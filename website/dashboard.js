(function() {
  // ─── API base — supports developer override stored in localStorage ──
  var storedBase = localStorage.getItem('aa_api_base');
  var API = storedBase
    ? storedBase.replace(/\/$/, '')
    : (window.location.hostname === 'localhost' ? 'http://localhost:8080' : window.location.origin);

  function getToken() { return localStorage.getItem('aa_token'); }
  function clearToken() { localStorage.removeItem('aa_token'); }

  // Guard — redirect to home if not logged in
  if (!getToken()) { window.location.href = '/'; }

  async function api(method, path, body, signal) {
    var opts = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken(),
      },
      signal: signal,
    };
    if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
    var res = await fetch(API + path, opts);
    var data = await res.json().catch(function() { return {}; });
    if (!res.ok) {
      var err = new Error(data.error || data.message || 'HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ─── Error overlay ────────────────────────────────────────────────
  function showError(title, message, options) {
    options = options || {};
    var errorEl = document.getElementById('dashboard-error');
    document.getElementById('error-title').textContent = title || 'Dashboard unavailable';
    document.getElementById('error-message').textContent = message || 'Something went wrong. Please try again.';
    document.getElementById('btn-retry').style.display = options.retryable === false ? 'none' : '';
    errorEl.style.display = 'block';
    document.getElementById('btn-error-logout').style.display = options.hideLogout ? 'none' : '';
  }

  function clearError() {
    document.getElementById('dashboard-error').style.display = 'none';
  }

  // ─── Toast ────────────────────────────────────────────────────────
  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(function() { el.classList.add('show'); });
    setTimeout(function() { el.classList.remove('show'); setTimeout(function() { el.remove(); }, 400); }, 3000);
  }

  // ─── Confirm modal ────────────────────────────────────────────────
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
    document.getElementById('dash-confirm-ok').addEventListener('click', function() { close(); onConfirm(); });
  }

  // ─── File download helper ─────────────────────────────────────────
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ─── Sidebar navigation ───────────────────────────────────────────
  var currentSection = 'overview';

  function showSection(name) {
    currentSection = name;
    document.querySelectorAll('.sidebar-item').forEach(function(item) {
      item.classList.toggle('active', item.getAttribute('data-section') === name);
    });
    document.querySelectorAll('.dashboard-section').forEach(function(sec) {
      sec.classList.toggle('active', sec.id === 'section-' + name);
    });
    // Lazy-load section data
    if (name === 'audit-logs') loadAuditLogs();
    if (name === 'alerts') loadAlerts();
    if (name === 'reports') loadReports();
    if (name === 'policies') loadPolicies();
  }

  document.querySelectorAll('.sidebar-item').forEach(function(item) {
    item.addEventListener('click', function() {
      showSection(item.getAttribute('data-section'));
    });
  });

  // ─── Global event listeners ───────────────────────────────────────
  window.addEventListener('unhandledrejection', function(e) {
    console.error('[Dashboard] Unhandled rejection:', e.reason);
    if (e.reason && e.reason.status >= 500) {
      showError('Server error', e.reason.message || 'The API returned an error.', { retryable: true });
    }
  });

  document.getElementById('btn-logout').addEventListener('click', function() { clearToken(); window.location.href = '/'; });
  document.getElementById('btn-error-logout').addEventListener('click', function() { clearToken(); window.location.href = '/'; });
  document.getElementById('btn-retry').addEventListener('click', function() { clearError(); loadDashboard(); });

  // ─── Settings: webhook / notifications ───────────────────────────
  document.getElementById('btn-save-webhook').addEventListener('click', async function() {
    var btn = this;
    var url = document.getElementById('webhook-url').value.trim();
    var webhookOn = document.getElementById('toggle-webhook').checked;
    var emailOn = document.getElementById('toggle-email').checked;
    var minSev = document.getElementById('sev-dropdown').getAttribute('data-value') || 'warning';
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      await api('PATCH', '/api/v1/auth/me', { webhookUrl: url || null, notifyWebhook: webhookOn, notifyEmail: emailOn, notifyMinSeverity: minSev });
      var saveConfirm = document.getElementById('save-confirm');
      if (saveConfirm) {
        saveConfirm.style.opacity = '1';
        clearTimeout(saveConfirm._fadeTimer);
        saveConfirm._fadeTimer = setTimeout(function() { saveConfirm.style.opacity = '0'; }, 2500);
      }
    } catch(err) { toast(err.message || 'Failed to save', 'error'); }
    btn.disabled = false; btn.textContent = 'Save';
  });

  // ─── Settings: API base URL override ─────────────────────────────
  var apiBaseInput = document.getElementById('api-base-url');
  if (apiBaseInput) apiBaseInput.value = storedBase || '';

  document.getElementById('btn-save-api-base').addEventListener('click', function() {
    var val = (apiBaseInput ? apiBaseInput.value.trim() : '');
    if (val) {
      localStorage.setItem('aa_api_base', val);
      API = val.replace(/\/$/, '');
      toast('API base saved — reloading dashboard', 'success');
      setTimeout(function() { loadDashboard(); }, 800);
    } else {
      localStorage.removeItem('aa_api_base');
      API = window.location.hostname === 'localhost' ? 'http://localhost:8080' : window.location.origin;
      toast('API base cleared — using origin', 'info');
      setTimeout(function() { loadDashboard(); }, 800);
    }
  });

  // ─── Upgrade / billing portal ─────────────────────────────────────
  document.getElementById('btn-upgrade').addEventListener('click', async function() {
    var btn = this;
    var orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Loading billing...';
    var controller = new AbortController();
    var t = setTimeout(function() { controller.abort(); }, 15000);
    try {
      var d = await api('POST', '/api/v1/billing/portal-session', null, controller.signal);
      clearTimeout(t);
      if (d.url) { window.location.href = d.url; return; }
      toast('Unable to load billing portal.', 'error');
    } catch(e) {
      clearTimeout(t);
      if (e.name === 'AbortError') toast('Request timed out.', 'error');
      else if (e.status === 503) toast('Billing not configured for this deployment.', 'error');
      else toast(e.message || 'Unable to load billing portal.', 'error');
    }
    btn.disabled = false; btn.textContent = orig;
  });

  // ─── API Key modal ────────────────────────────────────────────────
  var keyModal = document.getElementById('key-modal');
  var stepCreate = document.getElementById('modal-step-create');
  var stepResult = document.getElementById('modal-step-result');
  var keyNameInput = document.getElementById('key-name');
  var keyReveal = document.getElementById('key-reveal-value');

  function openKeyModal() { stepCreate.style.display = ''; stepResult.style.display = 'none'; keyNameInput.value = ''; keyModal.classList.add('open'); keyNameInput.focus(); }
  function closeKeyModal() { keyModal.classList.remove('open'); }

  document.getElementById('btn-new-key').addEventListener('click', openKeyModal);
  document.getElementById('key-modal-x').addEventListener('click', closeKeyModal);
  keyModal.addEventListener('click', function(e) { if (e.target === keyModal) closeKeyModal(); });

  document.getElementById('btn-create-submit').addEventListener('click', async function() {
    var name = keyNameInput.value.trim();
    if (!name) { keyNameInput.focus(); return; }
    var btn = this;
    btn.disabled = true; btn.textContent = 'Creating...';
    try {
      var data = await api('POST', '/api/v1/auth/api-keys', { name: name });
      keyReveal.textContent = data.key;
      stepCreate.style.display = 'none'; stepResult.style.display = '';
      loadOverview();
    } catch(err) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Create Key'; }
  });

  document.getElementById('btn-copy-key').addEventListener('click', function() {
    navigator.clipboard.writeText(keyReveal.textContent).then(function() { toast('Key copied!', 'success'); closeKeyModal(); });
  });

  // ─── Keys: revoke (event delegation) ─────────────────────────────
  document.getElementById('keys-list').addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-revoke-id]');
    if (!btn) return;
    var id = btn.getAttribute('data-revoke-id');
    confirmModal('Revoke API key?', 'Any agent using this key will stop working immediately.', 'Revoke key', 'btn-dash-danger', function() {
      api('DELETE', '/api/v1/auth/api-keys/' + id)
        .then(function() { toast('Key revoked', 'info'); loadOverview(); })
        .catch(function(err) { toast(err.message || 'Failed', 'error'); });
    });
  });

  // ─── Packs: install / remove (event delegation) ───────────────────
  document.getElementById('packs-list').addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var packId = btn.getAttribute('data-pack-id');
    if (action === 'install') {
      btn.disabled = true; btn.textContent = 'Installing...';
      api('POST', '/api/v1/compliance-rules/packs', { packId: packId })
        .then(function() { toast('Pack installed', 'success'); loadOverview(); })
        .catch(function(err) { toast(err.message || 'Failed', 'error'); btn.disabled = false; btn.textContent = 'Install'; });
    }
    if (action === 'remove') {
      confirmModal('Remove pack?', 'All rules installed by this pack will be deleted.', 'Remove', 'btn-dash-danger', function() {
        api('DELETE', '/api/v1/compliance-rules/packs/' + packId)
          .then(function() { toast('Pack removed', 'info'); loadOverview(); })
          .catch(function(err) { toast(err.message || 'Failed', 'error'); });
      });
    }
  });

  // ─── Export logs button ───────────────────────────────────────────
  document.getElementById('btn-export-logs').addEventListener('click', async function() {
    var btn = this; var orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Exporting...';
    try {
      var res = await fetch(API + '/api/v1/audit-logs/export?format=json', { headers: { 'Authorization': 'Bearer ' + getToken() } });
      if (!res.ok) throw new Error('Export failed: ' + res.status);
      downloadBlob(await res.blob(), 'audit-logs.json');
      toast('Export downloaded', 'success');
    } catch(e) { toast(e.message || 'Export failed', 'error'); }
    btn.disabled = false; btn.textContent = orig;
  });

  // ─── Alerts: show-resolved toggle ────────────────────────────────
  var alertsShowResolved = document.getElementById('alerts-show-resolved');
  if (alertsShowResolved) {
    alertsShowResolved.addEventListener('change', function() { loadAlerts(); });
  }

  // ─── Audit log pagination state ───────────────────────────────────
  var logsPage = 1;
  var logsPageSize = 25;
  var logsTotalPages = 1;

  document.getElementById('logs-page-size').addEventListener('change', function() {
    logsPageSize = parseInt(this.value, 10);
    logsPage = 1;
    loadAuditLogs();
  });

  document.getElementById('logs-prev').addEventListener('click', function() {
    if (logsPage > 1) { logsPage--; loadAuditLogs(); }
  });

  document.getElementById('logs-next').addEventListener('click', function() {
    if (logsPage < logsTotalPages) { logsPage++; loadAuditLogs(); }
  });

  // ─── Reports modal ────────────────────────────────────────────────
  var reportModal = document.getElementById('report-modal');
  function openReportModal() { reportModal.classList.add('open'); }
  function closeReportModal() { reportModal.classList.remove('open'); }

  document.getElementById('btn-new-report').addEventListener('click', openReportModal);
  document.getElementById('report-modal-x').addEventListener('click', closeReportModal);
  reportModal.addEventListener('click', function(e) { if (e.target === reportModal) closeReportModal(); });

  document.getElementById('btn-create-report').addEventListener('click', async function() {
    var btn = this;
    var name = document.getElementById('report-name').value.trim();
    var format = document.getElementById('report-format').value;
    var start = document.getElementById('report-start').value;
    var end = document.getElementById('report-end').value;
    if (!name) { toast('Enter a report name', 'error'); return; }
    if (!start || !end) { toast('Select a date range', 'error'); return; }
    btn.disabled = true; btn.textContent = 'Generating...';
    try {
      await api('POST', '/api/v1/reports', {
        name: name,
        format: format,
        dateRangeStart: new Date(start).toISOString(),
        dateRangeEnd: new Date(end).toISOString(),
      });
      toast('Report queued', 'success');
      closeReportModal();
      loadReports();
    } catch(err) { toast(err.message || 'Failed to create report', 'error'); }
    btn.disabled = false; btn.textContent = 'Generate';
  });

  // Reports: download / delete (event delegation)
  document.getElementById('reports-list').addEventListener('click', async function(e) {
    var btn = e.target.closest('button[data-report-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-report-action');
    var id = btn.getAttribute('data-report-id');
    var name = btn.getAttribute('data-report-name') || 'report';

    if (action === 'download') {
      btn.disabled = true; btn.textContent = '...';
      try {
        var res = await fetch(API + '/api/v1/reports/' + id + '/download', { headers: { 'Authorization': 'Bearer ' + getToken() } });
        if (!res.ok) throw new Error('Download failed: ' + res.status);
        var cd = res.headers.get('content-disposition') || '';
        var fnMatch = cd.match(/filename="?([^";\n]+)"?/);
        var filename = fnMatch ? fnMatch[1] : (name.replace(/\s+/g, '-') + '.json');
        downloadBlob(await res.blob(), filename);
        toast('Download started', 'success');
      } catch(err) { toast(err.message || 'Download failed', 'error'); }
      btn.disabled = false; btn.textContent = 'Download';
    }

    if (action === 'delete') {
      confirmModal('Delete report?', 'This cannot be undone.', 'Delete', 'btn-dash-danger', function() {
        api('DELETE', '/api/v1/reports/' + id)
          .then(function() { toast('Report deleted', 'info'); loadReports(); })
          .catch(function(err) { toast(err.message || 'Failed', 'error'); });
      });
    }
  });

  // ─── Policy modals ────────────────────────────────────────────────
  var policyModal = document.getElementById('policy-modal');
  var policyDetailModal = document.getElementById('policy-detail-modal');
  var currentPolicyId = null;
  var editingPolicyId = null;

  function openPolicyModal(editId, editData) {
    editingPolicyId = editId || null;
    document.getElementById('policy-modal-title').textContent = editId ? 'Edit Policy' : 'Create Policy';
    document.getElementById('policy-modal-desc').textContent = editId ? 'Update policy settings.' : 'Policies group rules and can be assigned to agents.';
    document.getElementById('btn-create-policy').textContent = editId ? 'Save' : 'Create';
    document.getElementById('policy-name').value = editData ? editData.name : '';
    document.getElementById('policy-description').value = editData ? (editData.description || '') : '';
    document.getElementById('policy-mode').value = editData ? (editData.mode || 'flag') : 'flag';
    document.getElementById('policy-priority').value = editData ? (editData.priority || 0) : 0;
    document.getElementById('policy-conditions').value = editData && editData.conditions ? JSON.stringify(editData.conditions, null, 2) : '';
    policyModal.classList.add('open');
    document.getElementById('policy-name').focus();
  }
  function closePolicyModal() { policyModal.classList.remove('open'); editingPolicyId = null; }
  function closePolicyDetailModal() { policyDetailModal.classList.remove('open'); currentPolicyId = null; }

  document.getElementById('btn-new-policy').addEventListener('click', function() { openPolicyModal(null, null); });
  document.getElementById('policy-modal-x').addEventListener('click', closePolicyModal);
  policyModal.addEventListener('click', function(e) { if (e.target === policyModal) closePolicyModal(); });
  document.getElementById('policy-detail-modal-x').addEventListener('click', closePolicyDetailModal);
  policyDetailModal.addEventListener('click', function(e) { if (e.target === policyDetailModal) closePolicyDetailModal(); });

  document.getElementById('btn-create-policy').addEventListener('click', async function() {
    var btn = this;
    var name = document.getElementById('policy-name').value.trim();
    var description = document.getElementById('policy-description').value.trim();
    var mode = document.getElementById('policy-mode').value;
    var priority = parseInt(document.getElementById('policy-priority').value, 10) || 0;
    var conditionsRaw = document.getElementById('policy-conditions').value.trim();
    var conditions = null;
    if (conditionsRaw) {
      try { conditions = JSON.parse(conditionsRaw); } catch(e) { toast('Conditions is not valid JSON', 'error'); return; }
    }
    if (!name) { toast('Enter a policy name', 'error'); return; }
    btn.disabled = true; btn.textContent = editingPolicyId ? 'Saving...' : 'Creating...';
    try {
      var body = { name: name, mode: mode, priority: priority };
      if (description) body.description = description;
      if (conditions !== null) body.conditions = conditions;
      if (editingPolicyId) {
        await api('PATCH', '/api/v1/policies/' + editingPolicyId, body);
        toast('Policy updated', 'success');
      } else {
        await api('POST', '/api/v1/policies', body);
        toast('Policy created', 'success');
      }
      closePolicyModal();
      loadPolicies();
    } catch(err) { toast(err.message || 'Failed', 'error'); }
    btn.disabled = false; btn.textContent = editingPolicyId ? 'Save' : 'Create';
  });

  // Policy list: row click → open detail
  document.getElementById('policies-list').addEventListener('click', async function(e) {
    var row = e.target.closest('.policy-row[data-policy-id]');
    if (!row) return;
    var id = row.getAttribute('data-policy-id');
    openPolicyDetail(id);
  });

  async function openPolicyDetail(id) {
    currentPolicyId = id;
    policyDetailModal.classList.add('open');
    document.getElementById('policy-detail-name').textContent = 'Loading...';
    document.getElementById('policy-detail-desc').textContent = '';
    document.getElementById('policy-analytics').style.display = 'none';
    document.getElementById('policy-agents-list').innerHTML = '<div class="empty-state">Loading...</div>';
    document.getElementById('policy-versions-list').innerHTML = '<div class="empty-state">Loading...</div>';

    try {
      var policy = await api('GET', '/api/v1/policies/' + id);
      document.getElementById('policy-detail-name').textContent = policy.name;
      document.getElementById('policy-detail-desc').textContent =
        (policy.description || '') +
        '  Mode: ' + (policy.mode || 'flag').toUpperCase() +
        '  Priority: ' + (policy.priority || 0) +
        '  Status: ' + (policy.isActive ? 'Active' : 'Inactive');

      // Analytics
      try {
        var analytics = await api('GET', '/api/v1/policies/' + id + '/analytics');
        var ag = document.getElementById('policy-analytics');
        if (analytics) {
          ag.innerHTML =
            '<div class="analytics-cell"><div class="analytics-label">Total Evaluations</div><div class="analytics-value">' + (analytics.totalEvaluations || 0) + '</div></div>' +
            '<div class="analytics-cell"><div class="analytics-label">Violations</div><div class="analytics-value">' + (analytics.violations || 0) + '</div></div>' +
            '<div class="analytics-cell"><div class="analytics-label">Blocks</div><div class="analytics-value">' + (analytics.blocks || 0) + '</div></div>' +
            '<div class="analytics-cell"><div class="analytics-label">Flags</div><div class="analytics-value">' + (analytics.flags || 0) + '</div></div>';
          ag.style.display = '';
        }
      } catch(e) { /* analytics optional */ }

      // Agents
      var agentsList = document.getElementById('policy-agents-list');
      var assignedAgents = policy.agents || [];
      if (assignedAgents.length) {
        agentsList.innerHTML = assignedAgents.map(function(a) {
          return '<div class="key-row">' +
            '<div><div class="key-name">' + (a.name || a.id) + '</div><div class="key-meta">' + a.id + '</div></div>' +
            '<button class="btn-dash btn-dash-danger" data-unassign-agent="' + a.id + '" type="button">Remove</button>' +
            '</div>';
        }).join('');
        agentsList.querySelectorAll('button[data-unassign-agent]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var agentId = btn.getAttribute('data-unassign-agent');
            api('DELETE', '/api/v1/policies/' + id + '/agents', { agentId: agentId })
              .then(function() { toast('Agent removed', 'info'); openPolicyDetail(id); })
              .catch(function(err) { toast(err.message || 'Failed', 'error'); });
          });
        });
      } else {
        agentsList.innerHTML = '<div class="empty-state">No agents assigned.</div>';
      }

      // Populate agent assign dropdown
      try {
        var agents = await api('GET', '/api/v1/agents');
        var sel = document.getElementById('policy-assign-agent');
        sel.innerHTML = '<option value="">Select agent</option>';
        (agents || []).forEach(function(a) {
          var opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = a.name || a.id;
          sel.appendChild(opt);
        });
      } catch(e) { /* agents optional */ }

      // Versions
      try {
        var versions = await api('GET', '/api/v1/policies/' + id + '/versions');
        var vList = document.getElementById('policy-versions-list');
        if (versions && versions.length) {
          vList.innerHTML = versions.map(function(v) {
            return '<div class="key-row">' +
              '<div><div class="key-name">' + (v.name || ('Version ' + v.versionNumber)) + '</div>' +
              '<div class="key-meta">' + new Date(v.createdAt).toLocaleString() + '</div></div>' +
              '<button class="btn-dash" data-restore-version="' + v.id + '" type="button">Restore</button>' +
              '</div>';
          }).join('');
          vList.querySelectorAll('button[data-restore-version]').forEach(function(btn) {
            btn.addEventListener('click', function() {
              var versionId = btn.getAttribute('data-restore-version');
              confirmModal('Restore version?', 'Current policy settings will be replaced.', 'Restore', 'btn-dash-primary', function() {
                api('POST', '/api/v1/policies/' + id + '/versions/' + versionId + '/restore')
                  .then(function() { toast('Version restored', 'success'); closePolicyDetailModal(); loadPolicies(); })
                  .catch(function(err) { toast(err.message || 'Failed', 'error'); });
              });
            });
          });
        } else {
          vList.innerHTML = '<div class="empty-state">No versions saved.</div>';
        }
      } catch(e) { document.getElementById('policy-versions-list').innerHTML = '<div class="empty-state">Unable to load versions.</div>'; }

      // Wire up edit/delete/assign/version buttons for this policy
      document.getElementById('btn-policy-edit').onclick = function() {
        closePolicyDetailModal();
        openPolicyModal(id, policy);
      };

      document.getElementById('btn-policy-delete').onclick = function() {
        confirmModal('Delete policy?', 'This cannot be undone.', 'Delete', 'btn-dash-danger', function() {
          api('DELETE', '/api/v1/policies/' + id)
            .then(function() { toast('Policy deleted', 'info'); closePolicyDetailModal(); loadPolicies(); })
            .catch(function(err) { toast(err.message || 'Failed', 'error'); });
        });
      };

      document.getElementById('btn-policy-assign').onclick = async function() {
        var agentId = document.getElementById('policy-assign-agent').value;
        if (!agentId) { toast('Select an agent', 'error'); return; }
        try {
          await api('POST', '/api/v1/policies/' + id + '/agents', { agentId: agentId });
          toast('Agent assigned', 'success');
          openPolicyDetail(id);
        } catch(err) { toast(err.message || 'Failed to assign', 'error'); }
      };

      document.getElementById('btn-policy-version').onclick = async function() {
        try {
          await api('POST', '/api/v1/policies/' + id + '/versions', {});
          toast('Version saved', 'success');
          openPolicyDetail(id);
        } catch(err) { toast(err.message || 'Failed to save version', 'error'); }
      };

    } catch(err) {
      document.getElementById('policy-detail-name').textContent = 'Error';
      document.getElementById('policy-detail-desc').textContent = err.message || 'Could not load policy.';
    }
  }

  // ─── Chain viewer ─────────────────────────────────────────────────
  var chainModal = document.getElementById('chain-modal');
  document.getElementById('chain-modal-x').addEventListener('click', function() { chainModal.classList.remove('open'); });
  chainModal.addEventListener('click', function(e) { if (e.target === chainModal) chainModal.classList.remove('open'); });

  async function openChainModal(logId, currentLog) {
    chainModal.classList.add('open');
    document.getElementById('chain-list').innerHTML = '<div class="empty-state">Loading chain...</div>';
    try {
      var chain = await api('GET', '/api/v1/audit-logs/' + logId + '/chain');
      var logs = Array.isArray(chain) ? chain : (chain.logs || []);
      if (!logs.length) {
        document.getElementById('chain-list').innerHTML = '<div class="empty-state">No related logs found for this request.</div>';
        return;
      }
      document.getElementById('chain-list').innerHTML = logs.map(function(l) {
        var isCurrent = l.id === logId;
        var flagged = l.complianceFlags && l.complianceFlags.length;
        var inputPreview = l.input ? JSON.stringify(l.input).slice(0, 200) : '';
        var outputPreview = l.output ? JSON.stringify(l.output).slice(0, 200) : '';
        return '<div class="chain-log' + (isCurrent ? ' current' : '') + '">' +
          '<div class="chain-log-title">' + l.action + (isCurrent ? ' <small style="color:var(--accent)">(this log)</small>' : '') + '</div>' +
          '<div class="chain-log-meta">' + new Date(l.createdAt).toLocaleString() + ' &nbsp;·&nbsp; agent: ' + (l.agentId ? l.agentId.slice(0, 8) + '...' : '—') + ' &nbsp;·&nbsp; <span class="' + (flagged ? 'status-flag' : 'status-clean') + '">' + (flagged ? 'Flagged' : 'Clean') + '</span></div>' +
          (inputPreview ? '<div class="chain-log-content"><pre>' + escapeHtml(inputPreview) + '</pre></div>' : '') +
          (outputPreview ? '<div class="chain-log-content"><pre>' + escapeHtml(outputPreview) + '</pre></div>' : '') +
          '</div>';
      }).join('');
    } catch(err) {
      document.getElementById('chain-list').innerHTML = '<div class="empty-state">Unable to load chain: ' + escapeHtml(err.message || '') + '</div>';
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Severity dropdown ────────────────────────────────────────────
  (function() {
    var dropdown = document.getElementById('sev-dropdown');
    var trigger  = document.getElementById('sev-trigger');
    var menu     = document.getElementById('sev-menu');
    var label    = document.getElementById('sev-label');
    if (!dropdown) return;
    trigger.addEventListener('click', function(e) { e.stopPropagation(); dropdown.classList.toggle('open'); });
    document.addEventListener('click', function() { dropdown.classList.remove('open'); });
    menu.querySelectorAll('.sev-option').forEach(function(opt) {
      opt.addEventListener('click', function() {
        var val = opt.getAttribute('data-value');
        dropdown.setAttribute('data-value', val);
        label.textContent = opt.textContent;
        menu.querySelectorAll('.sev-option').forEach(function(o) { o.classList.toggle('selected', o === opt); });
        dropdown.classList.remove('open');
      });
    });
  }());

  // ─── Load: Overview (profile + keys + packs + stats) ─────────────
  async function loadOverview() {
    try {
      clearError();
      var me = await api('GET', '/api/v1/auth/me');
      document.getElementById('org-name').textContent = me.email;
      var plan = me.plan || 'free';
      var badge = document.getElementById('plan-badge');
      badge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
      badge.className = 'plan-tag plan-' + plan;
      document.getElementById('stat-api').textContent = (me.apiUsed || 0).toLocaleString();
      document.getElementById('btn-upgrade').style.display = plan === 'free' ? '' : 'none';

      // Populate settings from profile
      document.getElementById('webhook-url').value = me.webhookUrl || '';
      document.getElementById('toggle-webhook').checked = me.notifyWebhook === true;
      document.getElementById('toggle-email').checked = me.notifyEmail === true;
      var sevVal = me.notifyMinSeverity || 'warning';
      var sevDropdown = document.getElementById('sev-dropdown');
      sevDropdown.setAttribute('data-value', sevVal);
      var sevOpt = document.querySelector('#sev-menu .sev-option[data-value="' + sevVal + '"]');
      if (sevOpt) {
        document.getElementById('sev-label').textContent = sevOpt.textContent;
        document.querySelectorAll('#sev-menu .sev-option').forEach(function(o) { o.classList.toggle('selected', o === sevOpt); });
      }

      // Subscription badge
      try {
        var sub = await api('GET', '/api/v1/billing/subscription');
        var subEl = document.getElementById('sub-status');
        if (subEl && sub.status && sub.status !== 'inactive' && sub.status !== 'error') {
          subEl.textContent = sub.status === 'active' ? 'Subscribed' : sub.status;
          subEl.className = 'plan-tag plan-' + plan;
          subEl.style.display = '';
        } else if (subEl) { subEl.style.display = 'none'; }
      } catch(e) {
        var s = document.getElementById('sub-status');
        if (s) s.style.display = 'none';
      }
    } catch(err) {
      var status = err.status || 0; var msg = err.message || '';
      if (status === 429 || msg.includes('429') || msg.includes('Too many')) { showError('Rate limited', 'Too many requests. Please wait 15 minutes.', { retryable: false }); return; }
      if (status === 401 || status === 403 || msg.includes('Unauthorized')) { clearToken(); window.location.href = '/?session=expired'; return; }
      if (status === 0 || msg.includes('fetch') || msg.includes('Failed to fetch')) { showError('Connection lost', 'Could not reach AgentAudit.', { retryable: true }); return; }
      showError('Dashboard unavailable', 'Could not load your account.', { retryable: true });
      return;
    }

    // Agents count
    try {
      var agents = await api('GET', '/api/v1/agents');
      document.getElementById('stat-agents').textContent = Array.isArray(agents) ? agents.length : '0';
    } catch(e) { document.getElementById('stat-agents').textContent = '0'; }

    // Total log count for stat
    try {
      var logs = await api('GET', '/api/v1/audit-logs?limit=1');
      var total = logs.pagination && logs.pagination.total != null ? logs.pagination.total : 0;
      document.getElementById('stat-logs').textContent = total.toLocaleString();
    } catch(e) { document.getElementById('stat-logs').textContent = '0'; }

    // Unresolved alert count for stat
    try {
      var allAlerts = await api('GET', '/api/v1/alerts?isResolved=false');
      document.getElementById('stat-alerts').textContent = Array.isArray(allAlerts) ? allAlerts.length : '0';
    } catch(e) { document.getElementById('stat-alerts').textContent = '0'; }

    // API Keys
    try {
      var keys = await api('GET', '/api/v1/auth/api-keys');
      var keysList = document.getElementById('keys-list');
      if (keys.length) {
        keysList.innerHTML = keys.map(function(k) {
          return '<div class="key-row">' +
            '<div><div class="key-name">' + escapeHtml(k.name) + '</div>' +
            '<div class="key-meta">Created ' + new Date(k.createdAt).toLocaleDateString() + '  &nbsp;·&nbsp;  aa_••••••••</div></div>' +
            '<button class="btn-dash btn-dash-danger" data-revoke-id="' + k.id + '" type="button">Revoke</button>' +
            '</div>';
        }).join('');
      } else {
        keysList.innerHTML = '<div class="empty-state">No API keys yet.<br><small>Create one above to start integrating your agents.</small></div>';
      }
    } catch(e) { document.getElementById('keys-list').innerHTML = '<div class="empty-state">Unable to load keys.</div>'; }

    // Compliance packs
    try {
      var packs = await api('GET', '/api/v1/compliance-rules/packs');
      var installed = await api('GET', '/api/v1/compliance-rules/packs/installed');
      var installedIds = new Set((installed || []).map(function(p) { return p.id; }));
      var packsList = document.getElementById('packs-list');
      if (packs && packs.length) {
        packsList.innerHTML = packs.map(function(p) {
          var isInstalled = installedIds.has(p.id);
          var status = isInstalled ? '<span class="pack-status">Installed</span>' : '<span class="pack-status pending">Not installed</span>';
          var action = isInstalled
            ? '<button class="btn-dash btn-dash-danger" data-action="remove" data-pack-id="' + p.id + '">Remove</button>'
            : '<button class="btn-dash btn-dash-primary" data-action="install" data-pack-id="' + p.id + '">Install</button>';
          return '<div class="pack-row">' +
            '<div><div class="pack-name">' + escapeHtml(p.name) + '</div>' +
            '<div class="pack-meta">' + escapeHtml(p.description || '') + '</div></div>' +
            '<div style="display:flex;align-items:center;gap:12px;">' + status + action + '</div>' +
            '</div>';
        }).join('');
      } else {
        packsList.innerHTML = '<div class="empty-state">No compliance packs available.</div>';
      }
    } catch(e) { document.getElementById('packs-list').innerHTML = '<div class="empty-state">Unable to load packs.</div>'; }
  }

  // ─── Load: Audit Logs (paginated) ─────────────────────────────────
  async function loadAuditLogs() {
    var list = document.getElementById('logs-list');
    list.innerHTML = '<div class="empty-state">Loading...</div>';
    try {
      var offset = (logsPage - 1) * logsPageSize;
      var data = await api('GET', '/api/v1/audit-logs?limit=' + logsPageSize + '&offset=' + offset);
      var logs = data.data || [];
      var pagination = data.pagination || {};
      var total = pagination.total || logs.length;
      logsTotalPages = Math.max(1, Math.ceil(total / logsPageSize));

      // Update pagination controls
      document.getElementById('logs-page-info').textContent =
        'Page ' + logsPage + ' of ' + logsTotalPages + ' (' + total.toLocaleString() + ' total)';
      document.getElementById('logs-prev').disabled = logsPage <= 1;
      document.getElementById('logs-next').disabled = logsPage >= logsTotalPages;
      document.getElementById('logs-pagination').style.display = total > 0 ? '' : 'none';

      if (logs.length) {
        list.innerHTML = logs.map(function(l) {
          var flagged = l.complianceFlags && l.complianceFlags.length;
          return '<div class="log-row" style="cursor:pointer;" data-log-id="' + l.id + '">' +
            '<span class="log-time">' + new Date(l.createdAt).toLocaleString() + '</span>' +
            '<span class="log-action">' + escapeHtml(l.action) + '</span>' +
            '<span class="log-agent">' + (l.agentId ? escapeHtml(l.agentId.slice(0, 12)) + '...' : '—') + '</span>' +
            '<span class="log-status"><span class="' + (flagged ? 'status-flag' : 'status-clean') + '">' + (flagged ? 'Flagged' : 'Clean') + '</span>' +
            ' <button class="btn-dash" style="margin-left:6px;padding:2px 8px;font-size:10px;" data-chain-id="' + l.id + '">Chain</button></span>' +
            '</div>';
        }).join('');

        // Chain viewer button
        list.querySelectorAll('button[data-chain-id]').forEach(function(btn) {
          btn.addEventListener('click', function(e) {
            e.stopPropagation();
            openChainModal(btn.getAttribute('data-chain-id'));
          });
        });
      } else {
        list.innerHTML = '<div class="empty-state">No audit logs yet.<br><small>Integrate the SDK to start logging.</small></div>';
        document.getElementById('logs-pagination').style.display = 'none';
      }
    } catch(e) {
      console.error('[Dashboard] Audit logs load failed:', e);
      list.innerHTML = '<div class="empty-state">Unable to load logs.</div>';
    }
  }

  // ─── Load: Alerts ─────────────────────────────────────────────────
  async function loadAlerts() {
    var list = document.getElementById('alerts-list');
    list.innerHTML = '<div class="empty-state">Loading...</div>';
    try {
      var showResolved = document.getElementById('alerts-show-resolved') && document.getElementById('alerts-show-resolved').checked;
      var url = '/api/v1/alerts' + (showResolved ? '' : '?isResolved=false');
      var alerts = await api('GET', url);
      if (alerts && alerts.length) {
        list.innerHTML = alerts.map(function(a) {
          var sevClass = a.severity === 'critical' ? 'status-critical' : 'status-flag';
          var agentInfo = a.auditLog && a.auditLog.agentId
            ? '<small style="color:var(--text-muted);font-family:var(--font-mono);font-size:10px;display:block;margin-top:2px;">agent: ' + escapeHtml(a.auditLog.agentId) + '</small>' : '';
          var ruleInfo = a.rule
            ? '<small style="color:var(--text-muted);font-family:var(--font-mono);font-size:10px;display:block;margin-top:2px;">rule: ' + escapeHtml(a.rule.name) + '</small>' : '';
          var resolveBtn = a.isResolved
            ? '<span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);">Resolved</span>'
            : '<button class="btn-dash btn-dash-primary resolve-btn" data-resolve-id="' + a.id + '">Resolve</button>';
          return '<div class="alert-row">' +
            '<span class="alert-severity ' + sevClass + '">' + a.severity.toUpperCase() + '</span>' +
            '<span class="alert-message">' + escapeHtml(a.message) + agentInfo + ruleInfo + '</span>' +
            '<span class="alert-time">' + new Date(a.createdAt).toLocaleString() + '</span>' +
            '<span class="alert-actions">' + resolveBtn + '</span>' +
            '</div>';
        }).join('');
        list.querySelectorAll('.resolve-btn').forEach(function(btn) {
          btn.addEventListener('click', function() { resolveAlert(btn.getAttribute('data-resolve-id')); });
        });
      } else {
        list.innerHTML = '<div class="empty-state">No' + (showResolved ? '' : ' unresolved') + ' alerts.<br><small>Compliance violations will appear here automatically.</small></div>';
      }
    } catch(e) {
      console.error('[Dashboard] Alerts load failed:', e);
      list.innerHTML = '<div class="empty-state">Unable to load alerts.</div>';
    }
  }

  window.resolveAlert = async function(id) {
    try {
      await api('PATCH', '/api/v1/alerts/' + id + '/resolve');
      toast('Alert resolved', 'success');
      // Refresh stat and list
      api('GET', '/api/v1/alerts?isResolved=false').then(function(a) {
        document.getElementById('stat-alerts').textContent = Array.isArray(a) ? a.length : '0';
      }).catch(function() {});
      loadAlerts();
    } catch(err) { toast(err.message, 'error'); }
  };

  // ─── Load: Reports ────────────────────────────────────────────────
  async function loadReports() {
    var list = document.getElementById('reports-list');
    list.innerHTML = '<div class="empty-state">Loading...</div>';
    try {
      var reports = await api('GET', '/api/v1/reports');
      var items = Array.isArray(reports) ? reports : (reports.data || []);
      if (items.length) {
        list.innerHTML = items.map(function(r) {
          var statusClass = r.status === 'ready' ? 'ready' : 'pending';
          var downloadBtn = r.status === 'ready'
            ? '<button class="btn-dash btn-dash-primary" data-report-action="download" data-report-id="' + r.id + '" data-report-name="' + escapeHtml(r.name) + '">Download</button>'
            : '<span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);">Generating...</span>';
          return '<div class="report-row">' +
            '<div><div class="report-name">' + escapeHtml(r.name) + '</div>' +
            '<div class="report-meta">' + (r.format || '').toUpperCase() + ' &nbsp;·&nbsp; ' +
              (r.dateRangeStart ? new Date(r.dateRangeStart).toLocaleDateString() + ' – ' + new Date(r.dateRangeEnd).toLocaleDateString() : '') +
            '</div></div>' +
            '<span class="report-status ' + statusClass + '">' + (r.status || 'pending').toUpperCase() + '</span>' +
            '<span class="report-date">' + new Date(r.createdAt).toLocaleDateString() + '</span>' +
            '<div style="display:flex;gap:8px;justify-content:flex-end;">' + downloadBtn +
              '<button class="btn-dash btn-dash-danger" data-report-action="delete" data-report-id="' + r.id + '" data-report-name="' + escapeHtml(r.name) + '">Delete</button>' +
            '</div>' +
            '</div>';
        }).join('');
      } else {
        list.innerHTML = '<div class="empty-state">No reports yet.<br><small>Click "Generate Report" to create your first export.</small></div>';
      }
    } catch(e) {
      console.error('[Dashboard] Reports load failed:', e);
      list.innerHTML = '<div class="empty-state">Unable to load reports.</div>';
    }
  }

  // ─── Load: Policies ───────────────────────────────────────────────
  async function loadPolicies() {
    var list = document.getElementById('policies-list');
    list.innerHTML = '<div class="empty-state">Loading...</div>';
    try {
      var policies = await api('GET', '/api/v1/policies');
      var items = Array.isArray(policies) ? policies : (policies.data || []);
      if (items.length) {
        list.innerHTML = items.map(function(p) {
          var activeClass = p.isActive ? 'policy-active' : 'policy-inactive';
          var activeLabel = p.isActive ? 'Active' : 'Inactive';
          return '<div class="policy-row" data-policy-id="' + p.id + '" style="cursor:pointer;">' +
            '<div><div class="policy-name">' + escapeHtml(p.name) + '</div>' +
            '<div class="policy-meta">' + escapeHtml(p.description || '') + '</div></div>' +
            '<span class="policy-mode">' + (p.mode || 'flag').toUpperCase() + '</span>' +
            '<span class="' + activeClass + '">' + activeLabel + '</span>' +
            '<span style="color:var(--text-muted);font-family:var(--font-mono);font-size:11px;">Priority: ' + (p.priority || 0) + '</span>' +
            '<span style="color:var(--text-muted);font-family:var(--font-mono);font-size:11px;">Updated ' + new Date(p.updatedAt || p.createdAt).toLocaleDateString() + '</span>' +
            '</div>';
        }).join('');
      } else {
        list.innerHTML = '<div class="empty-state">No policies yet.<br><small>Create a policy to add guardrails to your agents.</small></div>';
      }
    } catch(e) {
      console.error('[Dashboard] Policies load failed:', e);
      list.innerHTML = '<div class="empty-state">Unable to load policies.</div>';
    }
  }

  // ─── Main load ────────────────────────────────────────────────────
  function loadDashboard() {
    loadOverview();
  }

  // Handle billing success redirect
  if (new URLSearchParams(window.location.search).get('billing') === 'success') {
    toast('Subscription activated!', 'success');
    history.replaceState(null, '', '/dashboard.html');
  }

  loadDashboard();

})();
