/* ============================================================
   theme.js — theme toggle with 250ms @keyframes cross-fade
   Pattern per DESIGN_BRIEF.md (follow exactly):
   - @property registrations live in css/style.css (dark initial values)
   - keyframes animate the tokens in BOTH directions
   - load-flash gate: html.theme-anim[data-theme=...] added ONLY
     in the toggle click handler (initial loads never animate)
   - restart semantics: remove class -> force reflow -> re-add -> apply
   - duration tokenized as --theme-anim-dur: 250ms
   - theme keyframes are NOT wrapped in prefers-reduced-motion
     (the theme switch is exempt from the reduced-motion kill block)
   - persist in localStorage, default dark
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'freedf-theme';
  var root = document.documentElement;

  function getStoredTheme() {
    try {
      var t = localStorage.getItem(STORAGE_KEY);
      return t === 'light' ? 'light' : 'dark';
    } catch (e) {
      return 'dark';
    }
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) { /* storage unavailable — theme still applies for this session */ }
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      btn.setAttribute('title', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
  }

  function toggleTheme() {
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';

    // Restart semantics: remove class -> force reflow -> re-add -> apply theme.
    root.classList.remove('theme-anim');
    void root.offsetWidth; // force reflow so the animation restarts fresh
    root.classList.add('theme-anim');
    applyTheme(next);
  }

  function init() {
    // First paint is handled by the inline bootstrap in <head> (dark default).
    // Here we just make sure the attribute is consistent with storage.
    applyTheme(getStoredTheme());

    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', toggleTheme);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
