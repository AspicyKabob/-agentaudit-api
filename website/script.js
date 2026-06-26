const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8080'
  : window.location.origin;

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

function showEnterpriseModal() {
  const existing = document.getElementById('enterprise-modal');
  if (existing) existing.remove();

  const SUPPORT = 'support@agentaudit.online';
  const SUBJECT = encodeURIComponent('Enterprise Plan Inquiry');
  const BODY    = encodeURIComponent('Hi AgentAudit team,\n\nI\'m interested in the Enterprise plan.\n\nOrganisation:\nUse case:\nExpected volume:\n\nThanks,');

  const overlay = document.createElement('div');
  overlay.id = 'enterprise-modal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);';
  overlay.innerHTML = `
    <div style="background:#111;border:1px solid rgba(250,250,249,0.15);padding:40px;max-width:440px;width:90%;position:relative;">
      <button id="ent-modal-close" style="position:absolute;top:14px;right:18px;background:none;border:none;color:#78716c;font-size:22px;cursor:pointer;line-height:1;">&times;</button>
      <p style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#dc2626;margin:0 0 14px;">Enterprise Plan</p>
      <h3 style="font-family:'Instrument Serif',Georgia,serif;font-size:22px;font-weight:400;color:#fafaf9;margin:0 0 10px;">Get in touch</h3>
      <p style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#a8a29e;line-height:1.7;margin:0 0 28px;">Email us at <strong style="color:#fafaf9;">${SUPPORT}</strong> and we'll get back to you within one business day.</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <a href="https://mail.google.com/mail/?view=cm&to=${SUPPORT}&su=${SUBJECT}&body=${BODY}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid rgba(250,250,249,0.12);color:#fafaf9;text-decoration:none;font-family:'JetBrains Mono',monospace;font-size:12px;transition:border-color 0.2s;" onmouseover="this.style.borderColor='rgba(250,250,249,0.35)'" onmouseout="this.style.borderColor='rgba(250,250,249,0.12)'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" stroke-width="1.5"/><polyline points="22,6 12,13 2,6" stroke="currentColor" stroke-width="1.5"/></svg>
          Open in Gmail
        </a>
        <a href="https://outlook.live.com/mail/0/deeplink/compose?to=${SUPPORT}&subject=${SUBJECT}&body=${BODY}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid rgba(250,250,249,0.12);color:#fafaf9;text-decoration:none;font-family:'JetBrains Mono',monospace;font-size:12px;transition:border-color 0.2s;" onmouseover="this.style.borderColor='rgba(250,250,249,0.35)'" onmouseout="this.style.borderColor='rgba(250,250,249,0.12)'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" stroke-width="1.5"/><polyline points="22,6 12,13 2,6" stroke="currentColor" stroke-width="1.5"/></svg>
          Open in Outlook
        </a>
        <a href="mailto:${SUPPORT}?subject=${SUBJECT}&body=${BODY}" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid rgba(250,250,249,0.12);color:#fafaf9;text-decoration:none;font-family:'JetBrains Mono',monospace;font-size:12px;transition:border-color 0.2s;" onmouseover="this.style.borderColor='rgba(250,250,249,0.35)'" onmouseout="this.style.borderColor='rgba(250,250,249,0.12)'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" stroke-width="1.5"/><polyline points="22,6 12,13 2,6" stroke="currentColor" stroke-width="1.5"/></svg>
          Open in default mail app
        </a>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.getElementById('ent-modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
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

async function apiCall(method, path, body, auth = false, signal = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal,
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
  if (!modal) {
    // No auth modal on this page — navigate to index with the right tab
    window.location.href = 'index.html?' + (tab === 'login' ? 'login=1' : 'signup=1');
    return;
  }
  switchTab(tab);
  modal.classList.add('active');
}

function closeModal() {
  if (!modal) return;
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
      if (isLoggedIn()) {
        window.location.href = '/dashboard.html';
      } else {
        openModal('signup');
      }
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
      window.location.href = '/dashboard.html';
      return;
    }
    if (plan === 'enterprise') {
      showEnterpriseModal();
      return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Redirecting to Stripe...';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const data = await apiCall('POST', '/api/v1/billing/checkout-session', {
        priceId: btn.dataset.price,
      }, true, controller.signal);
      clearTimeout(timeoutId);
      if (data.url) {
        window.location.href = data.url;
      } else {
        btn.disabled = false;
        btn.textContent = originalText;
        showToast('Billing setup incomplete. Please try again later.', 'error');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      btn.disabled = false;
      btn.textContent = originalText;
      if (err.name === 'AbortError') {
        showToast('Request timed out. Please check your connection and try again.', 'error');
      } else if (err.message && err.message.includes('fetch')) {
        showToast('Connection lost. Please check your internet and try again.', 'error');
      } else {
        showToast(err.message || 'Failed to start checkout. Please try again.', 'error');
      }
    }
  });
});

  document.getElementById('btn-setup-notify')?.addEventListener('click', function(e) {
    e.preventDefault();
    if (isLoggedIn()) {
      window.location.href = '/dashboard.html';
    } else {
      openModal('signup');
    }
  });

  updateNav();
  bindAuthLinks();

  // Auto-open modal when redirected from another page with ?login=1 or ?signup=1
  if (modal) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login')) openModal('login');
    else if (params.get('signup')) openModal('signup');
  }

// ─── Existing visual scripts (unchanged) ─────────────────────────

const canvas = document.getElementById('bg-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

if (canvas && ctx) {
  let streams = [];
  const streamCount = 10;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789*#@&%$';

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  class DataStream {
    constructor() { this.reset(); }
    reset() {
      this.y = Math.random() * (canvas.height * 0.8) + (canvas.height * 0.1);
      this.x = -300;
      this.speed = 0.2 + Math.random() * 0.3;
      this.length = 8 + Math.floor(Math.random() * 12);
      this.chars = [];
      for (let i = 0; i < this.length; i++) {
        this.chars.push({
          char: chars[Math.floor(Math.random() * chars.length)],
          color: Math.random() > 0.92 ? 'rgba(220, 38, 38, 0.35)' : 'rgba(161, 161, 170, 0.18)',
          size: 9 + Math.floor(Math.random() * 3)
        });
      }
    }
    update() {
      this.x += this.speed;
      if (this.x > canvas.width + 300) this.reset();
    }
    draw() {
      let x = this.x;
      this.chars.forEach(c => {
        ctx.font = `${c.size}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = c.color;
        ctx.fillText(c.char, x, this.y);
        x += c.size * 0.55;
      });
    }
  }

  function initStreams() {
    streams = [];
    for (let i = 0; i < streamCount; i++) {
      const s = new DataStream();
      s.x = Math.random() * canvas.width;
      streams.push(s);
    }
  }

  function animateStreams() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    streams.forEach(s => { s.update(); s.draw(); });
    requestAnimationFrame(animateStreams);
  }

  resizeCanvas();
  initStreams();
  animateStreams();
  window.addEventListener('resize', () => { resizeCanvas(); initStreams(); });
}

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
    const tabsContainer = tab.closest('.code-tabs') || document;
    
    tabsContainer.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    const contentContainer = tab.closest('.code-grid') || tab.closest('.integration-block') || tabsContainer;
    
    contentContainer.querySelectorAll('.tab-content').forEach(content => {
      const isTarget = content.dataset.tab === targetTab;
      content.classList.toggle('active', isTarget);
    });
    
    contentContainer.querySelectorAll('.integration-code').forEach(content => {
      const isTarget = content.dataset.tabContent === targetTab;
      content.classList.toggle('active', isTarget);
      if (content.hidden !== undefined) content.hidden = !isTarget;
    });
    
    const filenameEl = contentContainer.querySelector('.code-filename');
    const activeContent = contentContainer.querySelector('.tab-content.active, .integration-code.active');
    if (filenameEl && activeContent) {
      const filename = activeContent.dataset.filename
        || activeContent.querySelector('code')?.dataset.filename;
      if (filename) filenameEl.textContent = filename;
    }
    
    contentContainer.querySelectorAll('.code-dots span').forEach(dot => {
      dot.classList.toggle('code-dot-active', dot.dataset.tabDot === targetTab);
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
  { name: 'Email address', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, severity: 'warning' },
  { name: 'Credit card number', pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/, severity: 'critical' },
  { name: 'Phone number', pattern: /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/, severity: 'warning' },
  { name: 'IP address', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/, severity: 'warning' },
];

const KEYWORD_RULES = [
  { keywords: ['password', 'secret', 'token', 'api_key', 'apikey', 'private_key'], severity: 'warning' },
  { keywords: ['ssn', 'social security', 'credit card', 'cvv', 'bank account'], severity: 'critical' },
];

const REGEX_RULES = [
  { name: 'AWS key', pattern: /\bAKIA[0-9A-Z]{16}\b/, severity: 'critical' },
  { name: 'JWT token', pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/, severity: 'critical' },
];

const CUSTOM_RULES = [
  {
    name: 'Response too long (>200 chars)',
    check: (text) => text.length > 200,
    severity: 'warning',
  },
];

const SENTIMENT_RULES = [
  {
    name: 'Toxic language',
    check: (text) => {
      const toxicWords = ['worthless', 'pathetic', 'stupid', 'idiot', 'hate you', 'kill', 'die'];
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

  const hasCriticalForResponse = violations.some(v => v.severity === 'critical');
  const flags = violations.map(v => `${v.severity.toUpperCase()}_${v.type.toLowerCase()}_${v.detail.replace(/\s+/g, '_').substring(0, 20)}`);
  const apiResponse = {
    id: 'log_' + Math.random().toString(36).substring(2, 10),
    action: 'prompt_submitted',
    blocked: hasCriticalForResponse,
    complianceFlags: flags,
    createdAt: new Date().toISOString(),
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
      </div>` : `
      <div class="demo-violations">
        <div class="demo-violations-title">Rules checked (5 categories)</div>
        <ul class="demo-violations-list">
          <li><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> PII detection — SSN, email, credit card, phone, IP</li>
          <li><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Credential keywords — password, secret, token, API key</li>
          <li><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Regex patterns — AWS keys, JWT tokens</li>
          <li><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Sentiment — toxic language detection</li>
          <li><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Custom rules — response length, format checks</li>
        </ul>
      </div>`}
      
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
  document.querySelectorAll('.demo-preset-btn').forEach(b => b.classList.remove('active'));
  demoOutput.innerHTML = `
    <div class="demo-output-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      <p>Results will appear here</p>
    </div>`;
});

const DEMO_PRESETS = {
  ssn:    "The patient's record shows Name: John Doe, SSN: 523-41-7890, DOB: 1985-03-12. Please update the file accordingly.",
  cc:     "Payment processed. Card: 4532015112830366, Exp: 09/26, CVV: 847. Transaction ID: TXN-99812. Amount: $249.00.",
  creds:  "Deployment config — DB_PASSWORD=Sup3rS3cr3t!, API_KEY=abc123token, STRIPE_SECRET=sk_live_abcdef. Do not share.",
  toxic:  "This response is completely worthless. The agent is stupid and I hate the output it keeps producing.",
  jwt:    "Auth header received: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  clean:  "The quarterly report shows a 12% increase in revenue driven by enterprise customer growth. Key metrics are on track and no compliance issues were identified during the audit period.",
};

document.querySelectorAll('.demo-preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = DEMO_PRESETS[btn.dataset.preset];
    if (!preset || !demoText) return;
    demoText.value = preset;
    document.querySelectorAll('.demo-preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Auto-run the check
    demoCheck?.click();
  });
});

document.querySelectorAll('.integration-code').forEach(container => {
  const btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.setAttribute('aria-label', 'Copy code');
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
  container.insertBefore(btn, container.firstChild);

  btn.addEventListener('click', () => {
    const codeEl = container.querySelector('pre code');
    if (!codeEl) return;
    const text = codeEl.innerText;

    function showCopied() {
      btn.textContent = 'Copied!';
      btn.setAttribute('aria-label', 'Copied to clipboard');
      setTimeout(() => {
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
        btn.setAttribute('aria-label', 'Copy code');
      }, 2000);
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(showCopied).catch(() => {
        fallbackCopy(text, showCopied);
      });
    } else {
      fallbackCopy(text, showCopied);
    }
  });
});

function fallbackCopy(text, callback) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
    callback();
  } catch (err) {
  }
  document.body.removeChild(textarea);
}

console.log('%cAgentAudit', 'font-size: 32px; font-weight: bold; color: #dc2626;');
console.log('%cReal-time guardrails for AI agents.', 'font-size: 14px; color: #78716c;');

// ─── Scroll-to-top ────────────────────────────────────────────────
(function() {
  const btn = document.getElementById('scroll-top');
  if (!btn) return;
  window.addEventListener('scroll', function() {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
  btn.addEventListener('click', function() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}());

// ─── Pack card buttons ────────────────────────────────────────────
document.querySelectorAll('.pack-card .btn-primary').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    if (isLoggedIn()) {
      window.location.href = '/dashboard.html';
    } else {
      showPackPrompt();
    }
  });
});

function showPackPrompt() {
  // Remove any existing prompt
  const existing = document.getElementById('pack-prompt');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pack-prompt';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9000',
    'display:flex', 'align-items:center', 'justify-content:center',
    'background:rgba(0,0,0,0.7)', 'backdrop-filter:blur(4px)'
  ].join(';');

  overlay.innerHTML = `
    <div style="
      background:#1a1a1a;
      border:1px solid rgba(250,250,249,0.15);
      padding:40px;
      max-width:420px;
      width:90%;
      text-align:center;
      position:relative;
    ">
      <button id="pack-prompt-close" style="
        position:absolute;top:16px;right:16px;
        background:none;border:none;color:#78716c;
        font-size:20px;cursor:pointer;line-height:1;
      ">&times;</button>
      <p style="
        font-family:'JetBrains Mono',monospace;
        font-size:10px;letter-spacing:0.15em;
        text-transform:uppercase;color:#dc2626;
        margin-bottom:16px;
      ">Compliance Packs</p>
      <h3 style="
        font-family:'Instrument Serif',Georgia,serif;
        font-size:24px;font-weight:400;
        color:#fafaf9;margin-bottom:12px;
      ">Create a free account to activate packs</h3>
      <p style="
        font-family:'JetBrains Mono',monospace;
        font-size:12px;color:#a8a29e;
        line-height:1.7;margin-bottom:32px;
      ">Compliance packs are configured from your dashboard. Sign up free — no credit card required.</p>
      <div style="display:flex;gap:12px;justify-content:center;">
        <a href="#signup" id="pack-prompt-signup" style="
          display:inline-flex;align-items:center;
          padding:12px 24px;
          font-family:'JetBrains Mono',monospace;
          font-size:12px;letter-spacing:0.05em;
          text-transform:uppercase;text-decoration:none;
          background:#fafaf9;color:#0c0c0c;
          border:1px solid #fafaf9;
        ">Get Started Free</a>
        <a href="#login" id="pack-prompt-login" style="
          display:inline-flex;align-items:center;
          padding:12px 24px;
          font-family:'JetBrains Mono',monospace;
          font-size:12px;letter-spacing:0.05em;
          text-transform:uppercase;text-decoration:none;
          background:transparent;color:#fafaf9;
          border:1px solid rgba(250,250,249,0.15);
        ">Log In</a>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('pack-prompt-close').addEventListener('click', function() {
    overlay.remove();
  });
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById('pack-prompt-signup').addEventListener('click', function(e) {
    e.preventDefault();
    overlay.remove();
    openModal('signup');
  });
  document.getElementById('pack-prompt-login').addEventListener('click', function(e) {
    e.preventDefault();
    overlay.remove();
    openModal('login');
  });
}




