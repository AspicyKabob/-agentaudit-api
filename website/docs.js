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
  var sidebarObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        sidebarLinks.forEach(function(a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id);
        });
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  sections.forEach(function(s) { sidebarObserver.observe(s); });

});
