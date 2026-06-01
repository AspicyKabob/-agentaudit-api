const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8080'
  : 'https://agentaudit-api-production.up.railway.app';

function getToken() { return localStorage.getItem('aa_token'); }

document.getElementById('load-trace').addEventListener('click', async () => {
  const traceId = document.getElementById('trace-input').value.trim();
  if (!traceId) return alert('Enter a trace ID');

  const token = getToken();
  if (!token) return alert('Please log in first');

  const btn = document.getElementById('load-trace');
  btn.disabled = true;
  btn.textContent = 'Loading...';

  try {
    const res = await fetch(`${API_BASE}/api/v1/audit-logs/trace/${encodeURIComponent(traceId)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load trace');

    renderTrace(data.data || []);
  } catch (err) {
    document.getElementById('trace-tree').innerHTML = `
      <div class="empty-state" style="color: var(--error)">
        <p>Error: ${err.message}</p>
      </div>`;
    document.getElementById('stats-bar').style.display = 'none';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Load Trace';
  }
});

function buildTree(logs) {
  const map = new Map();
  logs.forEach(log => map.set(log.id, { ...log, children: [] }));
  const roots = [];
  logs.forEach(log => {
    const node = map.get(log.id);
    if (log.parentSpanId && map.has(log.parentSpanId)) {
      map.get(log.parentSpanId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortFn = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);
  roots.sort(sortFn);
  const sortChildren = (node) => {
    node.children.sort(sortFn);
    node.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);
  return roots;
}

function renderTrace(logs) {
  if (!logs.length) {
    document.getElementById('trace-tree').innerHTML = `
      <div class="empty-state">
        <p>No logs found for this trace ID</p>
      </div>`;
    document.getElementById('stats-bar').style.display = 'none';
    return;
  }

  const times = logs.map(l => new Date(l.createdAt).getTime()).sort((a, b) => a - b);
  const duration = ((times[times.length - 1] - times[0]) / 1000).toFixed(1);
  const flagsCount = logs.reduce((sum, l) => sum + (l.complianceFlags?.length || 0), 0);
  document.getElementById('stat-count').textContent = logs.length;
  document.getElementById('stat-duration').textContent = duration + 's';
  document.getElementById('stat-flags-count').textContent = flagsCount;
  document.getElementById('stat-flags').style.display = flagsCount > 0 ? 'flex' : 'none';
  document.getElementById('stats-bar').style.display = 'flex';

  const tree = buildTree(logs);
  document.getElementById('trace-tree').innerHTML = renderNodes(tree, 0);
}

function renderNodes(nodes, depth) {
  return nodes.map(node => {
    const hasFlags = (node.complianceFlags || []).length > 0;
    const iconClass = hasFlags ? 'blocked' :
                      node.action.includes('crew') ? 'crew' :
                      node.action.includes('task') ? 'task' : 'action';
    const icon = node.action.includes('crew') ? 'C' :
                 node.action.includes('task') ? 'T' : 'A';

    const flags = (node.complianceFlags || []).map(f => {
      const severity = f.includes('CRITICAL') ? 'critical' : 'warning';
      return `<span class="flag-badge ${severity}">${f}</span>`;
    }).join('');

    const time = new Date(node.createdAt);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let preview = '';
    if (node.response) {
      preview = `<div class="node-preview-label">Response</div><div class="node-preview">${escapeHtml(node.response.slice(0, 200))}${node.response.length > 200 ? '...' : ''}</div>`;
    } else if (node.prompt) {
      preview = `<div class="node-preview-label">Prompt</div><div class="node-preview">${escapeHtml(node.prompt.slice(0, 200))}${node.prompt.length > 200 ? '...' : ''}</div>`;
    }

    const meta = [];
    if (node.metadata?.crew) meta.push(`Crew: ${node.metadata.crew}`);
    if (node.metadata?.agent_role) meta.push(`Role: ${node.metadata.agent_role}`);
    if (node.metadata?.task_id) meta.push(`Task: ${node.metadata.task_id}`);

    const childrenHtml = node.children.length ? renderNodes(node.children, depth + 1) : '';
    const indentStyle = depth > 0 ? `margin-left: ${depth * 40}px;` : '';

    return `
      <div class="trace-node" style="${indentStyle}">
        <div class="node-icon ${iconClass}">${icon}</div>
        <div class="node-content ${hasFlags ? 'blocked' : ''}">
          <div class="node-header">
            <span class="node-title">${node.action}${hasFlags ? ' <span style="color:var(--error)">●</span>' : ''}</span>
            <span class="node-time">${timeStr}</span>
          </div>
          <div class="node-meta">
            ${meta.map(m => `<span>${m}</span>`).join('')}
          </div>
          ${preview}
          ${flags}
        </div>
      </div>
      ${childrenHtml}`;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
