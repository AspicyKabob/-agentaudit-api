const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8080'
  : 'https://agentaudit-api-production.up.railway.app';

function api(path) {
  return `${API_BASE}${path}`;
}

function getToken() {
  return localStorage.getItem('aa_token');
}

function setToken(token) {
  localStorage.setItem('aa_token', token);
}

function clearToken() {
  localStorage.removeItem('aa_token');
}

function isLoggedIn() {
  return !!getToken();
}

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

async function apiCall(method, path, body, auth = false) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  if (auth) {
    const token = getToken();
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(api(path), opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function updateNav() {
  const navAuth = document.getElementById('nav-auth');
  if (!navAuth) return;

  if (isLoggedIn()) {
    navAuth.innerHTML = `
      <a href="/dashboard.html" class="btn btn-glass btn-sm">Dashboard</a>
      <button class="btn btn-secondary btn-sm" id="nav-logout">Log Out</button>
    `;
    document.getElementById('nav-logout')?.addEventListener('click', () => {
      clearToken();
      showToast('Logged out', 'info');
      updateNav();
    });
  } else {
    navAuth.innerHTML = `
      <a href="#login" class="btn btn-glass btn-sm" id="nav-login">Log In</a>
      <a href="#signup" class="btn btn-primary btn-sm" id="nav-signup">Get Started</a>
    `;
    bindAuthLinks();
  }
}

const modal = document.getElementById('auth-modal');
const signupForm = document.getElementById('signup-form');
const loginForm = document.getElementById('login-form');

function openModal(tab = 'signup') {
  switchTab(tab);
  modal.classList.add('active');
}

function closeModal() {
  modal.classList.remove('active');
}

function switchTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  signupForm.classList.toggle('hidden', tab !== 'signup');
  loginForm.classList.toggle('hidden', tab !== 'login');
}

function bindAuthLinks() {
  document.querySelectorAll('#nav-login, a[href="#login"]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      openModal('login');
    });
  });
  document.querySelectorAll('#nav-signup, a[href="#signup"], #cta-signup').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      openModal('signup');
    });
  });
}

document.getElementById('modal-close')?.addEventListener('click', closeModal);
modal?.addEventListener('click', e => {
  if (e.target === modal) closeModal();
});

document.querySelectorAll('.modal-tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

signupForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = signupForm.querySelector('button[type="submit"]');
  const errorEl = document.getElementById('signup-error');
  const original = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '<span>Creating...</span>';
  errorEl.textContent = '';

  try {
    const data = await apiCall('POST', '/api/v1/auth/register', {
      name: document.getElementById('signup-name').value,
      email: document.getElementById('signup-email').value,
      password: document.getElementById('signup-password').value,
    });

    const loginData = await apiCall('POST', '/api/v1/auth/login', {
      email: document.getElementById('signup-email').value,
      password: document.getElementById('signup-password').value,
    });

    setToken(loginData.accessToken);
    showToast('Welcome! Redirecting to dashboard...', 'success');
    closeModal();
    updateNav();
    setTimeout(() => window.location.href = '/dashboard.html', 800);
  } catch (err) {
    errorEl.textContent = err.message;
    btn.disabled = false;
    btn.innerHTML = original;
  }
});

loginForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = loginForm.querySelector('button[type="submit"]');
  const errorEl = document.getElementById('login-error');
  const original = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '<span>Logging in...</span>';
  errorEl.textContent = '';

  try {
    const data = await apiCall('POST', '/api/v1/auth/login', {
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-password').value,
    });

    setToken(data.accessToken);
    showToast('Welcome back! Redirecting...', 'success');
    closeModal();
    updateNav();
    setTimeout(() => window.location.href = '/dashboard.html', 800);
  } catch (err) {
    errorEl.textContent = err.message;
    btn.disabled = false;
    btn.innerHTML = original;
  }
});

document.querySelectorAll('[data-plan]').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!isLoggedIn()) {
      openModal('signup');
      return;
    }
    const plan = btn.dataset.plan;
    if (plan === 'free') {
      showToast('You are already on the Free plan!', 'info');
      return;
    }
    if (plan === 'enterprise') {
      window.open('mailto:sales@agentaudit.io?subject=Enterprise Inquiry', '_blank');
      return;
    }
    try {
      const data = await apiCall('POST', '/api/v1/billing/checkout-session', {
        priceId: btn.dataset.price,
      }, true);
      if (data.url) window.location.href = data.url;
      else showToast('Billing setup incomplete. Please try again later.', 'error');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
});

updateNav();
bindAuthLinks();

// ─── Existing visual scripts (unchanged) ─────────────────────────

const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');

let particles = [];
const particleCount = 100;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

class Particle {
  constructor() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.size = Math.random() * 2 + 0.5;
    this.speedX = (Math.random() - 0.5) * 0.5;
    this.speedY = (Math.random() - 0.5) * 0.5;
    this.opacity = Math.random() * 0.5 + 0.1;
  }

  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
    if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(99, 102, 241, ${this.opacity})`;
    ctx.fill();
  }
}

function initParticles() {
  particles = [];
  for (let i = 0; i < particleCount; i++) particles.push(new Particle());
}

function animateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => { p.update(); p.draw(); });
  particles.forEach((a, i) => {
    particles.slice(i + 1).forEach(b => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 150) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(99, 102, 241, ${0.1 * (1 - distance / 150)})`;
        ctx.lineWidth = 0.5;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    });
  });
  requestAnimationFrame(animateParticles);
}

resizeCanvas();
initParticles();
animateParticles();
window.addEventListener('resize', () => { resizeCanvas(); initParticles(); });

const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const delay = entry.target.dataset.delay || 0;
      setTimeout(() => entry.target.classList.add('visible'), delay);
    }
  });
}, observerOptions);

document.querySelectorAll('.animate-in').forEach(el => observer.observe(el));

setTimeout(() => {
  document.querySelectorAll('.hero .animate-in').forEach(el => {
    const delay = el.dataset.delay || 0;
    setTimeout(() => el.classList.add('visible'), delay);
  });
}, 100);

function animateCounter(el) {
  const target = parseInt(el.dataset.target);
  const duration = 2000;
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(target * easeOut);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

const counterObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCounter(entry.target);
      counterObserver.unobserve(entry.target);
    }
  });
});
document.querySelectorAll('.counter').forEach(el => counterObserver.observe(el));

document.querySelectorAll('.code-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;
    document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.dataset.tab === targetTab);
    });
  });
});

// Framework integration tabs
document.querySelectorAll('.fw-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetFw = tab.dataset.fw;
    document.querySelectorAll('.fw-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.fw-content').forEach(content => {
      content.classList.toggle('active', content.dataset.fw === targetFw);
    });
  });
});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

window.addEventListener('scroll', () => {
  const nav = document.querySelector('.nav-glass');
  const currentScroll = window.pageYOffset;
  if (currentScroll > 50) {
    nav.style.background = 'rgba(3, 7, 18, 0.9)';
    nav.style.borderColor = 'rgba(148, 163, 184, 0.2)';
  } else {
    nav.style.background = 'rgba(3, 7, 18, 0.7)';
    nav.style.borderColor = 'rgba(148, 163, 184, 0.1)';
  }
});

const demoText = document.getElementById('demo-text');
const demoCheck = document.getElementById('demo-check');
const demoClear = document.getElementById('demo-clear');
const demoOutput = document.getElementById('demo-output');

const PII_PATTERNS = [
  { name: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/, severity: 'critical' },
  { name: 'Email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, severity: 'warning' },
  { name: 'Credit Card', pattern: /\b(?:\d[ -]*?){13,16}\b/, severity: 'critical' },
  { name: 'Phone', pattern: /\b\d{3}-\d{3}-\d{4}\b/, severity: 'warning' },
];

const KEYWORD_RULES = [
  { keywords: ['password', 'secret', 'token', 'api_key', 'apikey'], severity: 'warning' },
  { keywords: ['ssn', 'social security', 'credit card', 'cvv'], severity: 'critical' },
];

const REGEX_RULES = [
  { name: 'Custom SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/, severity: 'critical' },
];

const CUSTOM_RULES = [
  {
    name: 'Length Check',
    check: (text) => text.length > 200,
    severity: 'warning',
  },
];

const SENTIMENT_RULES = [
  {
    name: 'Toxic Language',
    check: (text) => {
      const toxicWords = ['worthless', 'pathetic', 'stupid', 'idiot', 'hate', 'kill', 'die'];
      return toxicWords.some(w => text.toLowerCase().includes(w));
    },
    severity: 'critical',
  },
];

function evaluateGuardrail(text) {
  const violations = [];
  for (const pii of PII_PATTERNS) {
    if (pii.pattern.test(text)) {
      violations.push({ type: 'PII', detail: pii.name, severity: pii.severity });
    }
  }
  for (const rule of REGEX_RULES) {
    if (rule.pattern.test(text)) {
      violations.push({ type: 'Regex', detail: rule.name, severity: rule.severity });
    }
  }
  for (const rule of SENTIMENT_RULES) {
    if (rule.check(text)) {
      violations.push({ type: 'Sentiment', detail: rule.name, severity: rule.severity });
    }
  }
  for (const rule of CUSTOM_RULES) {
    if (rule.check(text)) {
      violations.push({ type: 'Custom', detail: rule.name, severity: rule.severity });
    }
  }
  const lower = text.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        violations.push({ type: 'Keyword', detail: `Forbidden keyword: "${kw}"`, severity: rule.severity });
        break;
      }
    }
  }
  return violations;
}

function renderResult(violations) {
  const hasCritical = violations.some(v => v.severity === 'critical');
  const statusClass = hasCritical ? 'blocked' : violations.length > 0 ? 'flagged' : 'allowed';
  const statusText = hasCritical ? 'BLOCKED — Critical violations found' : violations.length > 0 ? 'FLAGGED — Warnings detected' : 'CLEAN — No violations detected';
  const statusIcon = hasCritical ? '✗' : violations.length > 0 ? '!' : '✓';

  const listItems = violations.map(v =>
    `<li><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg> [${v.type}] ${v.detail}</li>`
  ).join('');

  const flags = violations.map(v => `${v.severity.toUpperCase()}_${v.type.toLowerCase()}_${v.detail.replace(/\s+/g, '_').substring(0, 20)}`);
  const apiResponse = {
    id: 'log_' + Math.random().toString(36).substring(2, 10),
    action: 'prompt_submitted',
    complianceFlags: flags,
    createdAt: new Date().toISOString()
  };

  const curlCmd = `curl -X POST https://agentaudit-api-production.up.railway.app/api/v1/audit-logs \\
  -H "X-API-Key: aa_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"prompt_submitted","prompt":"${demoText.value.substring(0, 50).replace(/'/g, "\\'")}..."}'`;

  demoOutput.innerHTML = `
    <div class="demo-result">
      <div class="demo-status ${statusClass}">
        <div class="demo-status-icon">${statusIcon}</div>
        <div>${statusText}</div>
      </div>
      ${violations.length > 0 ? `
      <div class="demo-violations">
        <div class="demo-violations-title">Violations (${violations.length})</div>
        <ul class="demo-violations-list">${listItems}</ul>
      </div>` : ''}
      
      <div class="demo-api-section">
        <div class="demo-api-header">
          <span>API Response Preview</span>
          <span class="demo-api-badge">JSON</span>
        </div>
        <pre class="demo-api-json">${JSON.stringify(apiResponse, null, 2)}</pre>
        <div class="demo-api-actions">
          <button class="btn btn-glass btn-sm" onclick="copyToClipboard(this, '${curlCmd.replace(/'/g, "\\'")}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copy cURL
          </button>
          <a href="#signup" class="btn btn-primary btn-sm" id="demo-signup">Get API Key →</a>
        </div>
      </div>
      <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">
        Client-side simulation. In production: real-time guardrail with audit log persistence.
      </div>
    </div>`;
  
  document.getElementById('demo-signup')?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal('signup');
  });
}

function copyToClipboard(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    setTimeout(() => {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy cURL`;
    }, 2000);
  });
}

demoCheck?.addEventListener('click', () => {
  const text = demoText?.value?.trim();
  if (!text) {
    showToast('Paste some text first!', 'error');
    return;
  }
  demoOutput.innerHTML = `
    <div class="demo-scanning">
      <div class="demo-scanning-spinner"></div>
      <span>Running guardrail check...</span>
    </div>`;
  setTimeout(() => {
    const violations = evaluateGuardrail(text);
    renderResult(violations);
  }, 600);
});

demoClear?.addEventListener('click', () => {
  if (demoText) demoText.value = '';
  demoOutput.innerHTML = `
    <div class="demo-output-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      <p>Results will appear here</p>
    </div>`;
});

console.log('%cAgentAudit', 'font-size: 32px; font-weight: bold; background: linear-gradient(135deg, #6366f1, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent;');
console.log('%cReal-time guardrails for AI agents.', 'font-size: 14px; color: #94a3b8;');
