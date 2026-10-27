(() => {
  const element = (id) => document.getElementById(id);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const healthUrl = local ? '/health' : 'https://agentaudit.online/health';
  let checking = false;
  let lastResultAt = 0;

  function component(name, state, label) {
    element(`${name}-row`).dataset.state = state;
    element(`${name}-state`).textContent = label;
  }

  function unknown(title, detail) {
    element('summary').dataset.state = 'unknown';
    element('summary-title').textContent = title;
    element('summary-detail').textContent = detail;
    component('api', 'unknown', 'Unknown');
    component('database', 'unknown', 'Unknown');
    component('redis', 'unknown', 'Unknown');
    element('check-context').textContent = 'No current health result is available.';
  }

  async function check() {
    if (checking) return;
    checking = true;
    const button = element('refresh');
    button.disabled = true;
    button.textContent = 'Checking…';
    element('last-attempt').textContent = new Date().toLocaleString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const started = performance.now();
    try {
      const response = await fetch(healthUrl, {
        signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error',
      });
      const data = await response.json();
      const database = data.dependencies?.database;
      const redis = data.dependencies?.redis;
      const checkedAt = Date.parse(data.checkedAt);
      if (![200, 503].includes(response.status) || data.service !== 'agentaudit-api'
        || !['ok', 'degraded'].includes(data.status) || !['up', 'down'].includes(database)
        || !['up', 'down', 'disabled'].includes(redis) || !Number.isFinite(checkedAt)
        || Date.now() - checkedAt > 60000 || checkedAt - Date.now() > 30000) {
        throw new Error('Unrecognized or stale health response');
      }
      const healthy = response.status === 200 && data.status === 'ok' && database === 'up' && redis !== 'down';
      lastResultAt = checkedAt;
      element('summary').dataset.state = healthy ? 'up' : 'down';
      element('summary-title').textContent = healthy ? 'Health checks passing' : 'Service health degraded';
      element('summary-detail').textContent = healthy
        ? 'The API health endpoint and its active dependency checks responded successfully.'
        : 'The API reports degraded health. Other functions may be affected; consult maintainer updates.';
      component('api', healthy ? 'up' : 'down', healthy ? 'Responding — checks passing' : 'Responding — degraded');
      component('database', database, database === 'up' ? 'Connected' : 'Unavailable or timed out');
      component('redis', redis === 'disabled' ? 'disabled' : redis,
        redis === 'disabled' ? 'Disabled — PostgreSQL fallback' : redis === 'up' ? 'Connected' : 'Unavailable or timed out');
      if (healthy) element('last-success').textContent = new Date(checkedAt).toLocaleString();
      const requestId = response.headers.get('x-request-id') || 'unavailable';
      element('check-context').textContent = `Round trip: ${Math.round(performance.now() - started)} ms · Release: ${data.commit || 'unknown'} · Request ID: ${requestId}`;
    } catch {
      lastResultAt = 0;
      unknown('Status unavailable', 'This browser could not obtain a fresh, valid health response. This can indicate a service, network, or browser-access problem; it is not proof of a complete outage. Try again or check GitHub updates.');
    } finally {
      clearTimeout(timeout);
      checking = false;
      button.disabled = false;
      button.textContent = 'Check now';
    }
  }

  element('refresh').addEventListener('click', check);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });
  setInterval(() => {
    if (lastResultAt && Date.now() - lastResultAt >= 60000) {
      unknown('Last result is stale', 'The last health result is over 60 seconds old. Check again for current status.');
    }
    if (!document.hidden) check();
  }, 30000);
  check();
})();
