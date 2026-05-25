const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8080'
  : 'https://api.agentaudit.io';

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

console.log('%cAgentAudit', 'font-size: 32px; font-weight: bold; background: linear-gradient(135deg, #6366f1, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent;');
console.log('%cThe audit layer AI agents desperately need.', 'font-size: 14px; color: #94a3b8;');
