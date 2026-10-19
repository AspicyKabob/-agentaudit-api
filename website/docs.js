// ── Global tab switch function ─────────────────────────────────
function docsTabSwitch(btn) {
  var group = btn.closest('.code-tabs');
  if (!group) return;
  var target = btn.getAttribute('data-tab');
  group.querySelectorAll('.tab-btn').forEach(function(b) {
    b.classList.toggle('active', b === btn);
  });
  group.querySelectorAll('.tab-panel').forEach(function(p) {
    p.classList.toggle('active', p.getAttribute('data-tab') === target);
  });
}

document.addEventListener('DOMContentLoaded', function() {

  // ── Tab switching ──────────────────────────────────────────────
  document.querySelectorAll('.code-tabs').forEach(function(group) {
    var btns = group.querySelectorAll('.tab-btn');
    var panels = group.querySelectorAll('.tab-panel');
    btns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = btn.getAttribute('data-tab');
        btns.forEach(function(b) { b.classList.toggle('active', b === btn); });
        panels.forEach(function(p) { p.classList.toggle('active', p.getAttribute('data-tab') === target); });
      });
    });
    // Copy button copies the active panel
    var copyBtn = group.querySelector('.tab-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function() {
        var activePanel = group.querySelector('.tab-panel.active');
        if (!activePanel) return;
        var code = activePanel.querySelector('pre').textContent;
        navigator.clipboard.writeText(code).then(function() {
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copied');
          setTimeout(function() { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 2000);
        });
      });
    }
  });

  // ── Copy buttons (standalone code blocks) ─────────────────────
  document.querySelectorAll('.copy-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var code = btn.closest('.code-block').querySelector('pre').textContent;
      navigator.clipboard.writeText(code).then(function() {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function() {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      });
    });
  });

  // ── Active sidebar link on scroll ──────────────────────────────
  var sections = document.querySelectorAll('.docs-section[id]');
  var sidebarLinks = document.querySelectorAll('.docs-sidebar a[href^="#"]');
  var currentSectionId = sections.length ? sections[0].id : null;
  var sidebarObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        currentSectionId = entry.target.id;
        sidebarLinks.forEach(function(a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id);
        });
        renderPagenav();
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  sections.forEach(function(s) { sidebarObserver.observe(s); });

  // ── Docs search ────────────────────────────────────────────────
  var sidebar = document.getElementById('docs-sidebar');
  var searchInput = document.getElementById('docs-search-input');
  var searchResults = document.getElementById('docs-search-results');
  var searchEmpty = document.getElementById('docs-search-empty');

  function buildSearchIndex() {
    var index = [];
    sections.forEach(function(sec) {
      var heading = sec.querySelector('h2');
      var text = sec.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
      index.push({
        id: sec.id,
        title: heading ? heading.textContent.trim() : sec.id,
        text: text,
      });
    });
    return index;
  }
  var searchIndex = buildSearchIndex();

  if (searchInput && sidebar && searchResults) {
    searchInput.addEventListener('input', function() {
      var q = searchInput.value.trim().toLowerCase();
      searchResults.innerHTML = '';
      if (!q) {
        sidebar.classList.remove('searching');
        searchEmpty.style.display = 'none';
        return;
      }
      sidebar.classList.add('searching');
      var matches = searchIndex.filter(function(item) {
        return item.title.toLowerCase().includes(q) || item.text.includes(q);
      }).slice(0, 10);
      if (!matches.length) {
        searchEmpty.style.display = 'block';
        return;
      }
      searchEmpty.style.display = 'none';
      matches.forEach(function(m) {
        var a = document.createElement('a');
        a.href = '#' + m.id;
        a.innerHTML = '<span>' + m.title.replace(/</g, '&lt;') + '</span><span class="result-kind">#' + m.id + '</span>';
        a.addEventListener('click', function() {
          searchInput.value = '';
          sidebar.classList.remove('searching');
          searchResults.innerHTML = '';
        });
        searchResults.appendChild(a);
      });
    });
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var first = searchResults.querySelector('a');
        if (first) { e.preventDefault(); first.click(); }
      } else if (e.key === 'Escape') {
        searchInput.value = '';
        sidebar.classList.remove('searching');
        searchResults.innerHTML = '';
        searchEmpty.style.display = 'none';
      }
    });
  }

  // ── Prev / next section navigation ─────────────────────────────
  var pagenav = document.getElementById('docs-pagenav');
  var navSections = Array.prototype.slice.call(sections).map(function(sec) {
    var heading = sec.querySelector('h2');
    return { id: sec.id, title: heading ? heading.textContent.trim() : sec.id };
  });
  function renderPagenav() {
    if (!pagenav || !navSections.length) return;
    var hash = window.location.hash.replace('#', '');
    var idx = navSections.findIndex(function(s) { return s.id === (hash || currentSectionId); });
    if (idx === -1) idx = 0;
    var prev = navSections[idx - 1];
    var next = navSections[idx + 1];
    pagenav.innerHTML =
      (prev
        ? '<a href="#' + prev.id + '" class="prev"><span class="pagenav-label">← Previous</span><span class="pagenav-title">' + prev.title + '</span></a>'
        : '<span></span>') +
      (next
        ? '<a href="#' + next.id + '" class="next"><span class="pagenav-label">Next →</span><span class="pagenav-title">' + next.title + '</span></a>'
        : '<span></span>');
  }
  renderPagenav();
  window.addEventListener('hashchange', renderPagenav);

});
