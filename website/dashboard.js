(function() {
  const API = window.location.hostname === 'localhost'
    ? 'http://localhost:8080'
    : 'https://agentaudit-api-production.up.railway.app';

  function getToken() { return localStorage.getItem('aa_token'); }
  function clearToken() { localStorage.removeItem('aa_token'); }

  // Guard — redirect to home if not logged in
  if (!getToken()) { window.location.href = '/'; }

  async function api(method, path, body, signal) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken(),
      },
      signal,
    };
    if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
    const res = await fetch(API + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || data.message || 'HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function showError(title, message, options) {
    options = options || {};
    const wrap = document.querySelector('.dashboard-wrap');
    const errorEl = document.getElementById('dashboard-error');
    document.getElementById('error-title').textContent = title || 'Dashboard unavailable';
    document.getElementById('error-message').textContent = message || 'Something went wrong. Please try again.';
    const retryBtn = document.getElementById('btn-retry');
    retryBtn.style.display = options.retryable === false ? 'none' : '';
    errorEl.style.display = 'block';
    wrap.classList.add('fatal-error');
    if (options.hideLogout) {
      document.getElementById('btn-error-logout').style.display = 'none';
    } else {
      document.getElementById('btn-error-logout').style.display = '';
    }
  }

  function clearError() {
    const wrap = document.querySelector('.dashboard-wrap');
    const errorEl = document.getElementById('dashboard-error');
    errorEl.style.display = 'none';
    wrap.classList.remove('fatal-error');
  }

  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3000);
  }

  window.addEventListener('unhandledrejection', function(e) {
    console.error('[Dashboard] Unhandled promise rejection:', e.reason);
    if (e.reason && e.reason.status >= 500) {
      showError('Server error', e.reason.message || 'The API returned an error. Please try again.', { retryable: true });
    }
  });

  document.getElementById('btn-logout').addEventListener('click', function() {
    clearToken();
    window.location.href = '/';
  });

  document.getElementById('btn-error-logout').addEventListener('click', function() {
    clearToken();
    window.location.href = '/';
  });

  document.getElementById('btn-retry').addEventListener('click', function() {
    clearError();
    loadDashboard();
  });

  document.getElementById('btn-save-webhook').addEventListener('click', async function() {
    var btn = this;
    var url = document.getElementById('webhook-url').value.trim();
    var webhookOn = document.getElementById('toggle-webhook').checked;
    var emailOn = document.getElementById('toggle-email').checked;
    var minSev = document.getElementById('sev-dropdown').getAttribute('data-value') || 'warning';
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      await api('PATCH', '/api/v1/auth/me', {
        webhookUrl: url || null,
        notifyWebhook: webhookOn,
        notifyEmail: emailOn,
        notifyMinSeverity: minSev
      });
      var saveConfirm = document.getElementById('save-confirm');
      if (saveConfirm) {
        saveConfirm.style.opacity = '1';
        clearTimeout(saveConfirm._fadeTimer);
        saveConfirm._fadeTimer = setTimeout(function() { saveConfirm.style.opacity = '0'; }, 2500);
      }
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
      } else if (e.status === 503) {
        toast('Billing is not configured for this deployment.', 'error');
      } else if (e.message && e.message.includes('fetch')) {
        toast('Connection lost. Please check your internet and try again.', 'error');
      } else {
        toast(e.message || 'Unable to load billing portal. Please try again.', 'error');
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

  // ─── Styled confirm modal ─────────────────────────────────────────
  function confirmModal(title, message, confirmLabel, confirmClass, onConfirm) {
    var existing = document.getElementById('dash-confirm-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'dash-confirm-overlay';
    overlay.className = 'dash-modal-overlay open';
    overlay.innerHTML =
      '<div class="dash-modal" style="max-width:380px;">' +
        '<h3>' + title + '</h3>' +
        '<p>' + message + '</p>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
          '<button class="btn-dash" id="dash-confirm-cancel">Cancel</button>' +
          '<button class="btn-dash ' + (confirmClass || 'btn-dash-danger') + '" id="dash-confirm-ok">' + (confirmLabel || 'Confirm') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function close() { overlay.remove(); }
    document.getElementById('dash-confirm-cancel').addEventListener('click', close);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    document.getElementById('dash-confirm-ok').addEventListener('click', function() {
      close();
      onConfirm();
    });
  }

  // ─── Pack actions (event delegation on packs-list) ────────────────
  document.getElementById('packs-list').addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var packId = btn.getAttribute('data-pack-id');

    if (action === 'install') {
      btn.disabled = true;
      btn.textContent = 'Installing...';
      api('POST', '/api/v1/compliance-rules/packs', { packId: packId })
        .then(function() {
          toast('Pack installed', 'success');
          loadDashboard();
        })
        .catch(function(err) {
          toast(err.message || 'Failed to install pack', 'error');
          btn.disabled = false;
          btn.textContent = 'Install';
        });
    }

    if (action === 'remove') {
      confirmModal(
        'Remove pack?',
        'All rules installed by this pack will be permanently deleted.',
        'Remove', 'btn-dash-danger',
        function() {
          api('DELETE', '/api/v1/compliance-rules/packs/' + packId)
            .then(function() { toast('Pack removed', 'info'); loadDashboard(); })
            .catch(function(err) { toast(err.message || 'Failed to remove pack', 'error'); });
        }
      );
    }
  });

  // ─── Key revoke (event delegation on keys-list) ───────────────────
  document.getElementById('keys-list').addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-revoke-id]');
    if (!btn) return;
    var id = btn.getAttribute('data-revoke-id');
    confirmModal(
      'Revoke API key?',
      'Any agent using this key will stop working immediately. This cannot be undone.',
      'Revoke key', 'btn-dash-danger',
      function() {
        api('DELETE', '/api/v1/auth/api-keys/' + id)
          .then(function() { toast('Key revoked', 'info'); loadDashboard(); })
          .catch(function(err) { toast(err.message || 'Failed to revoke key', 'error'); });
      }
    );
  });

  async function loadDashboard() {
    console.log('[Dashboard] Starting load...');
    try {
      clearError();
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
      document.getElementById('toggle-webhook').checked = me.notifyWebhook === true;
      document.getElementById('toggle-email').checked = me.notifyEmail === true;
      var sevVal = me.notifyMinSeverity || 'warning';
      var sevDropdown = document.getElementById('sev-dropdown');
      sevDropdown.setAttribute('data-value', sevVal);
      var sevOpt = document.querySelector('#sev-menu .sev-option[data-value="' + sevVal + '"]');
      if (sevOpt) {
        document.getElementById('sev-label').textContent = sevOpt.textContent;
        document.querySelectorAll('#sev-menu .sev-option').forEach(function(o) {
          o.classList.toggle('selected', o === sevOpt);
        });
      }
    } catch(err) {
      console.error('[Dashboard] Profile load failed:', err.message || err);
      var status = err.status || 0;
      var msg = err.message || '';
      if (status === 429 || msg.includes('429') || msg.includes('Too many')) {
        showError('Rate limited', 'Too many dashboard requests. Please wait 15 minutes and try again.', { retryable: false });
        return;
      }
      if (status === 401 || status === 403 || msg.includes('Invalid credentials') || msg.includes('Unauthorized')) {
        clearToken();
        window.location.href = '/?session=expired';
        return;
      }
      if (status === 0 || msg.includes('fetch') || msg.includes('Failed to fetch')) {
        showError('Connection lost', 'We could not reach AgentAudit. Please check your internet and try again.', { retryable: true });
        return;
      }
      showError('Dashboard unavailable', 'We could not load your account. Please try again in a moment.', { retryable: true });
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
      var statKeys = document.getElementById('stat-keys');
      if (statKeys) statKeys.textContent = keys.length;
      var keysList = document.getElementById('keys-list');
      if (keys.length) {
        keysList.innerHTML = keys.map(function(k) {
          return '<div class="key-row">' +
            '<div><div class="key-name">' + k.name + '</div>' +
            '<div class="key-meta">Created ' + new Date(k.createdAt).toLocaleDateString() + ' &nbsp;·&nbsp; aa_••••••••</div></div>' +
            '<button class="btn-dash btn-dash-danger" data-revoke-id="' + k.id + '" type="button">Revoke</button>' +
            '</div>';
        }).join('');
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
          var resolved = a.isResolved ? '<span style="color:var(--text-muted);font-size:11px;font-family:var(--font-mono);">RESOLVED</span>' : '<button class="btn-dash btn-dash-primary resolve-btn" data-resolve-id="' + a.id + '">Resolve</button>';
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

    try {
      var packs = await api('GET', '/api/v1/compliance-rules/packs');
      var installed = await api('GET', '/api/v1/compliance-rules/packs/installed');
      var installedIds = new Set((installed || []).map(function(p){ return p.id; }));
      var packsList = document.getElementById('packs-list');
      if (packs && packs.length) {
        packsList.innerHTML = packs.map(function(p) {
          var isInstalled = installedIds.has(p.id);
          var status = isInstalled ? '<span class="pack-status">Installed</span>' : '<span class="pack-status pending">Not installed</span>';
          var action = isInstalled
            ? '<button class="btn-dash btn-dash-danger" data-action="remove" data-pack-id="' + p.id + '">Remove</button>'
            : '<button class="btn-dash btn-dash-primary" data-action="install" data-pack-id="' + p.id + '">Install</button>';
          return '<div class="pack-row">' +
            '<div><div class="pack-name">' + p.name + '</div>' +
            '<div class="pack-meta">' + (p.description || '') + '</div></div>' +
            '<div style="display:flex;align-items:center;gap:12px;">' + status + action + '</div>' +
            '</div>';
        }).join('');
      } else {
        packsList.innerHTML = '<div class="empty-state">No compliance packs available.</div>';
      }
    } catch(e) { console.error('[Dashboard] Packs load failed:', e); document.getElementById('packs-list').innerHTML = '<div class="empty-state">Unable to load packs.</div>'; }

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

  // ─── Custom severity dropdown ─────────────────────────────────────
  (function() {
    var dropdown = document.getElementById('sev-dropdown');
    var trigger  = document.getElementById('sev-trigger');
    var menu     = document.getElementById('sev-menu');
    var label    = document.getElementById('sev-label');
    if (!dropdown) return;

    // Toggle open/close
    trigger.addEventListener('click', function(e) {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });

    // Close on outside click
    document.addEventListener('click', function() {
      dropdown.classList.remove('open');
    });

    // Option selection — write chosen value to data-value, update label
    menu.querySelectorAll('.sev-option').forEach(function(opt) {
      opt.addEventListener('click', function() {
        var val = opt.getAttribute('data-value');
        dropdown.setAttribute('data-value', val);
        label.textContent = opt.textContent;
        menu.querySelectorAll('.sev-option').forEach(function(o) {
          o.classList.toggle('selected', o === opt);
        });
        dropdown.classList.remove('open');
      });
    });
  }());

})();
