const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8080'
  : window.location.origin;

function getToken() {
  return localStorage.getItem('aa_token');
}

const SAMPLE_TRACE = [
  {
    id: 'log-001',
    action: 'crew_start',
    agentId: 'agent-research-1',
    traceId: 'trace-demo-001',
    parentSpanId: null,
    prompt: 'Research crew initialized with 2 agents',
    response: null,
    complianceFlags: [],
    metadata: { crew: 'Research Crew', model: 'gpt-4' },
    createdAt: '2026-01-15T10:00:00.000Z'
  },
  {
    id: 'log-002',
    action: 'task_assign',
    agentId: 'agent-research-1',
    traceId: 'trace-demo-001',
    parentSpanId: 'log-001',
    prompt: 'Task: Research market trends for Q1 2026',
    response: null,
    complianceFlags: [],
    metadata: { crew: 'Research Crew', task_id: 'task-001', agent_role: 'Researcher' },
    createdAt: '2026-01-15T10:00:01.200Z'
  },
  {
    id: 'log-003',
    action: 'llm_call',
    agentId: 'agent-research-1',
    traceId: 'trace-demo-001',
    parentSpanId: 'log-002',
    prompt: 'Analyze market trends for AI agent compliance tools in Q1 2026',
    response: 'Market analysis: The AI agent compliance market is projected to grow 340% in 2026...',
    complianceFlags: [],
    metadata: { crew: 'Research Crew', model: 'gpt-4', tokens: 1250 },
    createdAt: '2026-01-15T10:00:02.500Z'
  },
  {
    id: 'log-004',
    action: 'task_assign',
    agentId: 'agent-writer-2',
    traceId: 'trace-demo-001',
    parentSpanId: 'log-001',
    prompt: 'Task: Write report on compliance findings',
    response: null,
    complianceFlags: [],
    metadata: { crew: 'Research Crew', task_id: 'task-002', agent_role: 'Writer' },
    createdAt: '2026-01-15T10:00:03.800Z'
  },
  {
    id: 'log-005',
    action: 'llm_call',
    agentId: 'agent-writer-2',
    traceId: 'trace-demo-001',
    parentSpanId: 'log-004',
    prompt: 'Write a detailed report on AI compliance findings including PII detection results',
    response: 'Report: Our analysis found that 23% of AI agent outputs contained potential PII...',
    complianceFlags: ['CRITICAL_pii_detect_SSN'],
    metadata: { crew: 'Research Crew', model: 'gpt-4', tokens: 890 },
    createdAt: '2026-01-15T10:00:05.100Z'
  },
  {
    id: 'log-006',
    action: 'guardrail_block',
    agentId: 'agent-writer-2',
    traceId: 'trace-demo-001',
    parentSpanId: 'log-005',
    prompt: 'Report output contained SSN pattern in example data',
    response: 'BLOCKED: Output contained PII. Sanitized version: Our analysis found that XX% of outputs contained potential PII...',
    complianceFlags: ['CRITICAL_pii_detect_SSN'],
    metadata: { crew: 'Research Crew', rule: 'PII Detection' },
    createdAt: '2026-01-15T10:00:05.300Z'
  },
  {
    id: 'log-007',
    action: 'crew_end',
    agentId: 'agent-research-1',
    traceId: 'trace-demo-001',
    parentSpanId: 'log-001',
    prompt: 'Research crew completed with 1 violation blocked',
    response: 'Crew finished. 6 logs generated. 1 compliance violation detected and blocked.',
    complianceFlags: [],
    metadata: { crew: 'Research Crew', duration_ms: 5300 },
    createdAt: '2026-01-15T10:00:06.000Z'
  }
];

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        <p>No logs found for this trace ID</p>
      </div>`;
    document.getElementById('stats-bar').style.display = 'none';
    document.getElementById('legend-bar').style.display = 'none';
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
  document.getElementById('legend-bar').style.display = 'flex';

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
                 node.action.includes('task') ? 'T' :
                 node.action.includes('guardrail') ? '!' : 'A';

    const flags = (node.complianceFlags || []).map(f => {
      const severity = f.includes('CRITICAL') ? 'critical' : 'warning';
      return `<span class="flag-badge ${severity}">${f}</span>`;
    }).join('');

    const time = new Date(node.createdAt);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 1 });

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
    if (node.metadata?.model) meta.push(`Model: ${node.metadata.model}`);

    const childrenHtml = node.children.length ? renderNodes(node.children, depth + 1) : '';
    const indentStyle = depth > 0 ? `margin-left: ${depth * 32}px;` : '';

    return `
      <div class="trace-node" style="${indentStyle}">
        ${node.children.length ? '<div class="tree-connector"></div>' : ''}
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

async function loadTrace(traceId) {
  const token = getToken();
  if (!token) {
    document.getElementById('trace-tree').innerHTML = `
      <div class="empty-state" style="color: var(--error)">
        <p>Please log in to view traces</p>
        <div class="sub">Authentication required for trace lookup</div>
      </div>`;
    return;
  }

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
    document.getElementById('legend-bar').style.display = 'none';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Load Trace';
  }
}

// Load sample trace
document.getElementById('load-sample')?.addEventListener('click', () => {
  document.getElementById('trace-input').value = 'trace-demo-001';
  renderTrace(SAMPLE_TRACE);
});

// Load trace from input
document.getElementById('load-trace')?.addEventListener('click', () => {
  const traceId = document.getElementById('trace-input').value.trim();
  if (!traceId) {
    document.getElementById('trace-tree').innerHTML = `
      <div class="empty-state" style="color: var(--error)">
        <p>Please enter a trace ID</p>
      </div>`;
    return;
  }
  loadTrace(traceId);
});

// Enter key support
document.getElementById('trace-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('load-trace').click();
  }
});

// ─── Contextual hint ─────────────────────────────────────────────
(function() {
  var hintEl = document.getElementById('trace-hint-text');
  if (!hintEl) return;

  var loggedIn = !!getToken();

  if (loggedIn) {
    hintEl.innerHTML =
      '<strong style="color:var(--text-secondary);">Where to find your trace IDs:</strong> ' +
      'Pass a <code style="color:var(--accent)">traceId</code> field when you call <code style="color:var(--accent)">audit.guardrail()</code> — ' +
      'every log in the same agent run should share the same ID. ' +
      'You can find recent trace IDs in your ' +
      '<a href="/dashboard.html" style="color:var(--text-secondary);text-decoration:underline;">dashboard audit logs</a>. ' +
      'Example: <code style="color:var(--accent)">traceId: "run-" + Date.now()</code>';
  } else {
    hintEl.innerHTML =
      '<strong style="color:var(--text-secondary);">Want to search your own agent traces?</strong> ' +
      '<a href="/dashboard.html" style="color:var(--text-secondary);text-decoration:underline;">Log in</a> ' +
      'or <a href="/#signup" style="color:var(--text-secondary);text-decoration:underline;">create a free account</a> ' +
      '— then pass a <code style="color:var(--accent)">traceId</code> in your SDK calls and search it here.';
  }
}());
