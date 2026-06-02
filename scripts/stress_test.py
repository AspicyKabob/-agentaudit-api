"""
Stress-test script for AgentAudit batch endpoint.

Usage::

    python scripts/stress_test.py \
        --api-key aa_live_... \
        --base-url https://agentaudit-api-production.up.railway.app/api/v1 \
        --duration 60 \
        --workers 8 \
        --batch-size 50

Metrics printed:
- single_post_rate (items / sec)
- batch_post_rate (batches / sec)
- avg / p95 / p99 latencies
- success vs failure counts
- circuit breaker state (if the SDK exposes it)

Requirements: ``requests`` (already a dependency of the SDK).
"""

from __future__ import annotations

import argparse
import random
import statistics
import string
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List

import requests


def _random_text(length: int = 40) -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=length))


def _single_payload() -> Dict[str, str]:
    return {
        "action": random.choice(["prompt_submitted", "llm_response", "tool_executed"]),
        "prompt": _random_text(50),
        "response": _random_text(80),
        "metadata": {"model": "gpt-4", "tokens": random.randint(50, 500)},
    }


class StressRunner:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        duration: int,
        workers: int,
        batch_size: int,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.duration = duration
        self.workers = workers
        self.batch_size = min(batch_size, 100)
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        })
        self._stop = threading.Event()

        # Metrics
        self.single_ok = 0
        self.single_fail = 0
        self.batch_ok = 0
        self.batch_fail = 0
        self.single_latencies: List[float] = []
        self.batch_latencies: List[float] = []
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Single-post worker
    # ------------------------------------------------------------------
    def _single_worker(self) -> None:
        url = f"{self.base_url}/audit-logs"
        while not self._stop.is_set():
            payload = _single_payload()
            t0 = time.time()
            try:
                resp = self.session.post(url, json=payload, timeout=15)
                latency = time.time() - t0
                if resp.status_code == 201:
                    with self._lock:
                        self.single_ok += 1
                        self.single_latencies.append(latency)
                else:
                    with self._lock:
                        self.single_fail += 1
            except Exception:
                with self._lock:
                    self.single_fail += 1

    # ------------------------------------------------------------------
    # Batch-post worker
    # ------------------------------------------------------------------
    def _batch_worker(self) -> None:
        url = f"{self.base_url}/audit-logs/batch"
        while not self._stop.is_set():
            batch = [_single_payload() for _ in range(self.batch_size)]
            t0 = time.time()
            try:
                resp = self.session.post(url, json=batch, timeout=30)
                latency = time.time() - t0
                if resp.status_code == 201:
                    with self._lock:
                        self.batch_ok += 1
                        self.batch_latencies.append(latency)
                else:
                    with self._lock:
                        self.batch_fail += 1
            except Exception:
                with self._lock:
                    self.batch_fail += 1

    # ------------------------------------------------------------------
    # Run loop
    # ------------------------------------------------------------------
    def run(self) -> Dict[str, float]:
        start = time.time()

        threads: List[threading.Thread] = []
        for _ in range(self.workers // 2):
            t = threading.Thread(target=self._single_worker)
            t.start()
            threads.append(t)

        for _ in range(self.workers // 2):
            t = threading.Thread(target=self._batch_worker)
            t.start()
            threads.append(t)

        # Let workers run for the specified duration
        time.sleep(self.duration)
        self._stop.set()

        for t in threads:
            t.join(timeout=5)

        elapsed = time.time() - start

        single_total = self.single_ok + self.single_fail
        batch_total = self.batch_ok + self.batch_fail

        result = {
            "duration_sec": round(elapsed, 2),
            "single_success": self.single_ok,
            "single_failures": self.single_fail,
            "single_rate_sec": round(single_total / elapsed, 2),
            "batch_success": self.batch_ok,
            "batch_failures": self.batch_fail,
            "batch_rate_sec": round(batch_total / elapsed, 2),
            "single_latency_avg_ms": round(statistics.mean(self.single_latencies) * 1000, 2) if self.single_latencies else 0,
            "single_latency_p95_ms": round(_percentile(self.single_latencies, 0.95) * 1000, 2) if self.single_latencies else 0,
            "single_latency_p99_ms": round(_percentile(self.single_latencies, 0.99) * 1000, 2) if self.single_latencies else 0,
            "batch_latency_avg_ms": round(statistics.mean(self.batch_latencies) * 1000, 2) if self.batch_latencies else 0,
            "batch_latency_p95_ms": round(_percentile(self.batch_latencies, 0.95) * 1000, 2) if self.batch_latencies else 0,
            "batch_latency_p99_ms": round(_percentile(self.batch_latencies, 0.99) * 1000, 2) if self.batch_latencies else 0,
        }

        return result


def _percentile(data: List[float], p: float) -> float:
    if not data:
        return 0.0
    s = sorted(data)
    k = (len(s) - 1) * p
    f = int(k)
    c = f + 1 if f + 1 < len(s) else f
    return s[f] + (s[c] - s[f]) * (k - f)


def _print_report(metrics: Dict[str, float]) -> None:
    print("\n" + "=" * 60)
    print("  AgentAudit Stress Test Report")
    print("=" * 60)
    for key, val in metrics.items():
        label = key.replace("_", " ").title()
        print(f"  {label:<30} {val}")
    print("=" * 60 + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Stress-test AgentAudit endpoints")
    parser.add_argument("--api-key", required=True, help="AgentAudit API key")
    parser.add_argument("--base-url", default="https://agentaudit-api-production.up.railway.app/api/v1")
    parser.add_argument("--duration", type=int, default=30, help="Test duration in seconds")
    parser.add_argument("--workers", type=int, default=8, help="Total concurrent workers (split half/half)")
    parser.add_argument("--batch-size", type=int, default=50, help="Entries per batch (max 100)")
    args = parser.parse_args()

    runner = StressRunner(
        api_key=args.api_key,
        base_url=args.base_url,
        duration=args.duration,
        workers=args.workers,
        batch_size=args.batch_size,
    )
    metrics = runner.run()
    _print_report(metrics)
    return 0


if __name__ == "__main__":
    sys.exit(main())
