(function() {
  const API = window.location.hostname === 'localhost'
    ? 'http://localhost:8080'
    : 'https://agentaudit-api-production.up.railway.app';

  function getToken() { return localStorage.getItem('aa_token'); }
  function clearToken() { localStorage.removeItem('aa_token'); }

  // Guard — redirect to home if not logged in
  if (!getToken()) { window.location.href = '/'; }

  async function api(method, path, body) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken(),
      },
    };
    if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
    const res = await fetch(API + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    return data;
  }

  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3000);
  }

  window.addEventListener('error', function(e) {
    console.error('[Dashboard] Unhandled error:', e.error);
    document.getElementById('org-name').textContent = 'Error — check console (F12)';
  });
  window.addEventListener('unhandledrejection', function(e) {
    console.error('[Dashboard] Unhandled promise rejection:', e.reason);
  });

  document.getElementById('btn-logout').addEventListener('click', function() {
    clearToken();
    window.location.href = '/';
  });

  document.getElementById('btn-save-webhook').addEventListener('click', async function() {
    var btn = this;
    var url = document.getElementById('webhook-url').value.trim();
    var webhookOn = document.getElementById('toggle-webhook').checked;
    var emailOn = document.getElementById('toggle-email').checked;
    var minSev = document.getElementById('select-severity').value;
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      await api('PATCH', '/api/v1/auth/me', {
        webhookUrl: url || null,
        notifyWebhook: webhookOn,
        notifyEmail: emailOn,
        notifyMinSeverity: minSev
      });
      toast('Notification preferences saved', 'success');
    } catch(err) {
      toast(err.message || 'Failed to save', 'error');
    }
    btn.disabled = false;
    btn.textContent = 'Save';
  });

  document.getElementById('btn-upgrade').addEventListener('click', async function() {
    var btn = this;
    var originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Loading billing portal...';

    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 15000);

    try {
      var d = await api('POST', '/api/v1/billing/portal-session', null, controller.signal);
      clearTimeout(timeoutId);
      if (d.url) {
        window.location.href = d.url;
      } else {
        btn.disabled = false;
        btn.textContent = originalText;
        toast('Unable to load billing portal. Please try again.', 'error');
      }
    } catch(e) {
      clearTimeout(timeoutId);
      btn.disabled = false;
      btn.textContent = originalText;
      if (e.name === 'AbortError') {
        toast('Request timed out. Please check your connection.', 'error');
      } else if (e.message && e.message.includes('fetch')) {
        toast('Connection lost. Please check your internet and try again.', 'error');
      } else {
        window.location.href = '/#pricing';
      }
    }
  });

  var keyModal = document.getElementById('key-modal');
  var stepCreate = document.getElementById('modal-step-create');
  var stepResult = document.getElementById('modal-step-result');
  var keyNameInput = document.getElementById('key-name');
  var keyReveal = document.getElementById('key-reveal-value');

  function openKeyModal() {
    stepCreate.style.display = '';
    stepResult.style.display = 'none';
    keyNameInput.value = '';
    keyModal.classList.add('open');
    keyNameInput.focus();
  }
  function closeKeyModal() {
    keyModal.classList.remove('open');
  }

  document.getElementById('btn-new-key').addEventListener('click', openKeyModal);
  document.getElementById('key-modal-x').addEventListener('click', closeKeyModal);
  keyModal.addEventListener('click', function(e) { if (e.target === keyModal) closeKeyModal(); });

  document.getElementById('btn-create-submit').addEventListener('click', async function() {
    var name = keyNameInput.value.trim();
    if (!name) { keyNameInput.focus(); return; }
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Creating...';
    try {
      var data = await api('POST', '/api/v1/auth/api-keys', { name: name });
      keyReveal.textContent = data.key;
      stepCreate.style.display = 'none';
      stepResult.style.display = '';
      loadDashboard();
    } catch(err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Create Key';
    }
  });

  document.getElementById('btn-copy-key').addEventListener('click', function() {
    navigator.clipboard.writeText(keyReveal.textContent).then(function() {
      toast('Key copied!', 'success');
      closeKeyModal();
    });
  });

  window.revokeKey = async function(id) {
    if (!confirm('Revoke this key? Agents using it will stop working immediately.')) return;
    try {
      await api('DELETE', '/api/v1/auth/api-keys/' + id);
      toast('Key revoked', 'info');
      loadDashboard();
    } catch(err) { toast(err.message, 'error'); }
  };

  async function loadDashboard() {
    console.log('[Dashboard] Starting load...');
    try {
      var me = await api('GET', '/api/v1/auth/me');
      console.log('[Dashboard] Profile loaded:', me.email, me.plan);
      document.getElementById('org-name').textContent = me.email;
      var plan = me.plan || 'free';
      var badge = document.getElementById('plan-badge');
      badge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
      badge.className = 'plan-badge plan-' + plan;
      document.getElementById('stat-api').textContent = (me.apiUsed || 0).toLocaleString();
      if (plan === 'free') document.getElementById('btn-upgrade').style.display = '';
      document.getElementById('webhook-url').value = me.webhookUrl || '';
      document.getElementById('toggle-webhook').checked = me.notifyWebhook !== false;
      document.getElementById('toggle-email').checked = me.notifyEmail !== false;
      document.getElementById('select-severity').value = me.notifyMinSeverity || 'warning';
    } catch(err) {
      console.error('[Dashboard] Profile load failed:', err.message || err);
      var msg = err.message || '';
      if (msg.includes('429') || msg.includes('Too many')) {
        document.getElementById('org-name').textContent = 'Rate limited — wait 15 min';
        return;
      }
      clearToken();
      window.location.href = '/';
      return;
    }

    try {
      var agents = await api('GET', '/api/v1/agents');
      document.getElementById('stat-agents').textContent = Array.isArray(agents) ? agents.length : '0';
    } catch(e) { console.error('[Dashboard] Agents load failed:', e); document.getElementById('stat-agents').textContent = '0'; }

    try {
      var logs = await api('GET', '/api/v1/audit-logs?limit=10');
      var logsList = document.getElementById('logs-list');
      if (logs.data && logs.data.length) {
        document.getElementById('stat-logs').textContent = (logs.pagination && logs.pagination.total ? logs.pagination.total : logs.data.length).toLocaleString();
        logsList.innerHTML = logs.data.map(function(l) {
          var flagged = l.complianceFlags && l.complianceFlags.length;
          return '<div class="log-row">' +
            '<span class="log-time">' + new Date(l.createdAt).toLocaleString() + '</span>' +
            '<span class="log-action">' + l.action + '</span>' +
            '<span class="log-agent">' + (l.agentId ? l.agentId.slice(0,8) + '...' : '—') + '</span>' +
            '<span class="log-status ' + (flagged ? 'status-flag' : 'status-clean') + '">' + (flagged ? '⚠ Flagged' : '✓ Clean') + '</span>' +
            '</div>';
        }).join('');
      } else {
        document.getElementById('stat-logs').textContent = '0';
        logsList.innerHTML = '<div class="empty-state">No audit logs yet.<br><small>Integrate the SDK to start logging.</small></div>';
      }
    } catch(e) { console.error('[Dashboard] Logs load failed:', e); document.getElementById('logs-list').innerHTML = '<div class="empty-state">Unable to load logs.</div>'; }

    try {
      var keys = await api('GET', '/api/v1/auth/api-keys');
      document.getElementById('stat-keys').textContent = keys.length;
      var keysList = document.getElementById('keys-list');
      if (keys.length) {
        keysList.innerHTML = keys.map(function(k) {
          return '<div class="key-row" data-key-id="' + k.id + '" data-key-name="' + k.name + '" data-key-created="' + k.createdAt + '" draggable="false">' +
            '<div><div class="key-name">' + k.name + '</div>' +
            '<div class="key-meta">Created ' + new Date(k.createdAt).toLocaleDateString() + ' &nbsp;·&nbsp; aa_••••••••</div></div>' +
            '<button class="btn btn-secondary btn-sm revoke-key-btn" data-revoke-id="' + k.id + '" type="button">Revoke</button>' +
            '</div>';
        }).join('');
        keysList.querySelectorAll('.revoke-key-btn').forEach(function(btn) {
          btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = btn.getAttribute('data-revoke-id');
            if (id) revokeKey(id);
          });
        });
      } else {
        keysList.innerHTML = '<div class="empty-state">No API keys yet.<br><small>Create one above to start integrating your agents.</small></div>';
      }
    } catch(e) { console.error('[Dashboard] Keys load failed:', e); document.getElementById('keys-list').innerHTML = '<div class="empty-state">Unable to load keys.</div>'; }

    try {
      var alerts = await api('GET', '/api/v1/alerts');
      var alertsList = document.getElementById('alerts-list');
      var unresolvedCount = alerts.filter(function(a){ return !a.isResolved; }).length;
      document.getElementById('stat-alerts').textContent = unresolvedCount.toString();
      if (alerts && alerts.length) {
        alertsList.innerHTML = alerts.map(function(a) {
          var sevClass = a.severity === 'critical' ? 'status-critical' : 'status-flag';
          var resolved = a.isResolved ? '<span style="color:var(--success);font-size:11px;">Resolved</span>' : '<button class="btn btn-secondary btn-sm resolve-btn" data-resolve-id="' + a.id + '">Resolve</button>';
          return '<div class="alert-row">' +
            '<span class="alert-severity ' + sevClass + '">' + a.severity + '</span>' +
            '<span class="alert-message">' + a.message + '</span>' +
            '<span class="alert-time">' + new Date(a.createdAt).toLocaleString() + '</span>' +
            '<span class="alert-actions">' + resolved + '</span>' +
            '</div>';
        }).join('');
        alertsList.querySelectorAll('.resolve-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var id = btn.getAttribute('data-resolve-id');
            if (id) resolveAlert(id);
          });
        });
      } else {
        alertsList.innerHTML = '<div class="empty-state">No alerts yet.<br><small>Compliance violations will appear here automatically.</small></div>';
      }
    } catch(e) { console.error('[Dashboard] Alerts load failed:', e); document.getElementById('alerts-list').innerHTML = '<div class="empty-state">Unable to load alerts.</div>'; }

    console.log('[Dashboard] Load complete.');
  }

  window.resolveAlert = async function(id) {
    try {
      await api('PATCH', '/api/v1/alerts/' + id + '/resolve');
      toast('Alert resolved', 'success');
      loadDashboard();
    } catch(err) { toast(err.message, 'error'); }
  };

  if (new URLSearchParams(window.location.search).get('billing') === 'success') {
    toast('Subscription activated!', 'success');
    history.replaceState(null, '', '/dashboard.html');
  }

  loadDashboard();
})();
