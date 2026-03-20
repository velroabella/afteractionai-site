/* ══════════════════════════════════════════════════════════
   AfterAction AI — Accessibility Entry Experience
   Isolated UI layer. Does NOT modify auth, templates, or checklist.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  const STORAGE_KEY = 'aaai_a11y_prefs';
  const SEEN_KEY = 'aaai_a11y_seen';

  // ── DEFAULT PREFERENCES ───────────────────────────────
  const DEFAULTS = {
    mode: null,        // 'voice' | 'typing'
    captions: false,   // show captions on voice responses
    highContrast: false,
    largeText: false
  };

  // ── LOAD / SAVE ───────────────────────────────────────
  function getPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }

  function savePrefs(prefs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (e) {}
  }

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
  }

  function hasSeen() {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; }
  }

  // ── APPLY PREFERENCES TO PAGE ─────────────────────────
  function applyPrefs(prefs) {
    document.documentElement.classList.toggle('a11y-high-contrast', !!prefs.highContrast);
    document.documentElement.classList.toggle('a11y-large-text', !!prefs.largeText);
    document.documentElement.classList.toggle('a11y-captions', !!prefs.captions);

    // If mode was chosen, auto-click the matching landing button
    if (prefs.mode && document.querySelector('.landing__buttons')) {
      const buttons = document.querySelectorAll('.landing__buttons button');
      buttons.forEach(function(btn) {
        const label = btn.getAttribute('aria-label') || '';
        if (prefs.mode === 'voice' && label.toLowerCase().includes('voice')) {
          // Don't auto-click — just store preference for when user clicks Start
        }
        if (prefs.mode === 'typing' && label.toLowerCase().includes('typing')) {
          // Same — stored, not auto-triggered
        }
      });
    }
  }

  // ── BUILD THE ENTRY OVERLAY ───────────────────────────
  function buildOverlay() {
    var overlay = document.createElement('div');
    overlay.id = 'a11yOverlay';
    overlay.className = 'a11y-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Choose your experience');

    overlay.innerHTML = [
      '<div class="a11y-overlay__box">',
      '  <div class="a11y-overlay__star">★</div>',
      '  <h2 class="a11y-overlay__title">Choose Your Experience</h2>',
      '  <p class="a11y-overlay__subtitle">Select how you\'d like to interact with your veteran benefits navigator.</p>',
      '',
      '  <div class="a11y-overlay__modes">',
      '    <button class="a11y-mode-btn" data-mode="voice" aria-label="Start with voice input">',
      '      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
      '      <span class="a11y-mode-btn__label">Talk to Me</span>',
      '      <span class="a11y-mode-btn__desc">Speak naturally — I\'ll listen and respond</span>',
      '    </button>',
      '',
      '    <button class="a11y-mode-btn" data-mode="typing" aria-label="Start with text input">',
      '      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
      '      <span class="a11y-mode-btn__label">I\'ll Type</span>',
      '      <span class="a11y-mode-btn__desc">Type your questions at your own pace</span>',
      '    </button>',
      '  </div>',
      '',
      '  <div class="a11y-overlay__options">',
      '    <label class="a11y-toggle">',
      '      <input type="checkbox" id="a11yCaptions" />',
      '      <span class="a11y-toggle__track"><span class="a11y-toggle__thumb"></span></span>',
      '      <span class="a11y-toggle__text">Show captions on voice responses</span>',
      '    </label>',
      '    <label class="a11y-toggle">',
      '      <input type="checkbox" id="a11yHighContrast" />',
      '      <span class="a11y-toggle__track"><span class="a11y-toggle__thumb"></span></span>',
      '      <span class="a11y-toggle__text">High contrast mode</span>',
      '    </label>',
      '    <label class="a11y-toggle">',
      '      <input type="checkbox" id="a11yLargeText" />',
      '      <span class="a11y-toggle__track"><span class="a11y-toggle__thumb"></span></span>',
      '      <span class="a11y-toggle__text">Larger text</span>',
      '    </label>',
      '  </div>',
      '',
      '  <p class="a11y-overlay__note">You can change these anytime using the <strong>⚙</strong> button.</p>',
      '</div>'
    ].join('\n');

    document.body.appendChild(overlay);

    // Wire up mode buttons
    overlay.querySelectorAll('.a11y-mode-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var mode = btn.getAttribute('data-mode');
        var prefs = getPrefs();
        prefs.mode = mode;
        prefs.captions = document.getElementById('a11yCaptions').checked;
        prefs.highContrast = document.getElementById('a11yHighContrast').checked;
        prefs.largeText = document.getElementById('a11yLargeText').checked;
        savePrefs(prefs);
        markSeen();
        applyPrefs(prefs);
        closeOverlay();

        // Click the corresponding landing button
        var landingBtns = document.querySelectorAll('.landing__buttons button');
        landingBtns.forEach(function(lb) {
          var label = (lb.getAttribute('aria-label') || '').toLowerCase();
          if (mode === 'voice' && label.includes('voice')) lb.click();
          if (mode === 'typing' && label.includes('typing')) lb.click();
        });
      });
    });

    // Focus first mode button for keyboard users
    setTimeout(function() {
      var firstBtn = overlay.querySelector('.a11y-mode-btn');
      if (firstBtn) firstBtn.focus();
    }, 100);

    // Trap focus inside overlay
    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeOverlay();
        return;
      }
      if (e.key !== 'Tab') return;
      var focusable = overlay.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  function closeOverlay() {
    var overlay = document.getElementById('a11yOverlay');
    if (overlay) {
      overlay.classList.add('a11y-overlay--closing');
      setTimeout(function() { overlay.remove(); }, 300);
    }
  }

  // ── SETTINGS PANEL (persistent gear button) ───────────
  function buildSettingsButton() {
    var btn = document.createElement('button');
    btn.id = 'a11ySettingsBtn';
    btn.className = 'a11y-settings-btn';
    btn.setAttribute('aria-label', 'Accessibility settings');
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    document.body.appendChild(btn);

    btn.addEventListener('click', function() {
      toggleSettingsPanel();
    });
  }

  function buildSettingsPanel() {
    var prefs = getPrefs();
    var panel = document.createElement('div');
    panel.id = 'a11yPanel';
    panel.className = 'a11y-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Accessibility settings');

    panel.innerHTML = [
      '<div class="a11y-panel__header">',
      '  <h3>Accessibility Settings</h3>',
      '  <button class="a11y-panel__close" aria-label="Close settings">&times;</button>',
      '</div>',
      '<div class="a11y-panel__body">',
      '  <div class="a11y-panel__group">',
      '    <span class="a11y-panel__group-label">Input Mode</span>',
      '    <div class="a11y-panel__mode-row">',
      '      <button class="a11y-panel__mode-btn' + (prefs.mode === 'voice' ? ' active' : '') + '" data-mode="voice">Voice</button>',
      '      <button class="a11y-panel__mode-btn' + (prefs.mode === 'typing' ? ' active' : '') + '" data-mode="typing">Typing</button>',
      '    </div>',
      '  </div>',
      '  <label class="a11y-toggle">',
      '    <input type="checkbox" id="panelCaptions"' + (prefs.captions ? ' checked' : '') + ' />',
      '    <span class="a11y-toggle__track"><span class="a11y-toggle__thumb"></span></span>',
      '    <span class="a11y-toggle__text">Captions on voice</span>',
      '  </label>',
      '  <label class="a11y-toggle">',
      '    <input type="checkbox" id="panelHighContrast"' + (prefs.highContrast ? ' checked' : '') + ' />',
      '    <span class="a11y-toggle__track"><span class="a11y-toggle__thumb"></span></span>',
      '    <span class="a11y-toggle__text">High contrast</span>',
      '  </label>',
      '  <label class="a11y-toggle">',
      '    <input type="checkbox" id="panelLargeText"' + (prefs.largeText ? ' checked' : '') + ' />',
      '    <span class="a11y-toggle__track"><span class="a11y-toggle__thumb"></span></span>',
      '    <span class="a11y-toggle__text">Larger text</span>',
      '  </label>',
      '</div>'
    ].join('\n');

    document.body.appendChild(panel);

    // Close button
    panel.querySelector('.a11y-panel__close').addEventListener('click', function() {
      toggleSettingsPanel();
    });

    // Mode buttons
    panel.querySelectorAll('.a11y-panel__mode-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        panel.querySelectorAll('.a11y-panel__mode-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        updatePrefsFromPanel();
      });
    });

    // Toggle inputs
    ['panelCaptions', 'panelHighContrast', 'panelLargeText'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', updatePrefsFromPanel);
    });

    // Escape to close
    panel.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') toggleSettingsPanel();
    });
  }

  function updatePrefsFromPanel() {
    var panel = document.getElementById('a11yPanel');
    if (!panel) return;
    var activeMode = panel.querySelector('.a11y-panel__mode-btn.active');
    var prefs = {
      mode: activeMode ? activeMode.getAttribute('data-mode') : getPrefs().mode,
      captions: document.getElementById('panelCaptions').checked,
      highContrast: document.getElementById('panelHighContrast').checked,
      largeText: document.getElementById('panelLargeText').checked
    };
    savePrefs(prefs);
    applyPrefs(prefs);
  }

  function toggleSettingsPanel() {
    var panel = document.getElementById('a11yPanel');
    if (panel) {
      panel.classList.toggle('a11y-panel--open');
    }
  }

  // ── INIT ──────────────────────────────────────────────
  function init() {
    // Only run on the landing page (index.html)
    if (!document.querySelector('.screen--landing')) return;

    var prefs = getPrefs();

    // Apply saved preferences immediately
    applyPrefs(prefs);

    // Build the gear button and settings panel (always available)
    buildSettingsButton();
    buildSettingsPanel();

    // Show overlay only on first visit
    if (!hasSeen()) {
      buildOverlay();
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
