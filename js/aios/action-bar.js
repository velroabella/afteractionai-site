/* ══════════════════════════════════════════════════════════
   AIOS — Action Bar  (Phase 49)
   Renders contextual action buttons under AI chat messages
   based on the structured response contract (Phase 47).

   DESIGN PRINCIPLES:
   - Additive only: never modifies AI response text or existing buttons.
   - Conditional: buttons only appear when contract data warrants them.
   - Idempotent: calling render() twice on the same div is safe (no-op).
   - Zero dependencies beyond window.AIOS namespace.
   - Graceful degradation: if contract is null/empty, renders nothing.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Button Definitions
     Each entry defines one possible action button.
       id:       unique key (also used as CSS modifier)
       label:    button text
       icon:     small SVG icon string
       show:     function(contract, activeMission) → boolean
       action:   function(contract, activeMission, messageDiv)
     ──────────────────────────────────────────────────────── */

  var BUTTONS = [

    // ── Create Mission ──────────────────────────────────────
    {
      id: 'create-mission',
      label: 'Create Mission',
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
      show: function(contract, activeMission) {
        // Show when response has mission signals and no mission is active
        if (!contract || !contract.mission_signals) return false;
        if (!contract.mission_signals.suggestedType) return false;
        if (activeMission && activeMission.status === 'in_progress') return false;
        return true;
      },
      action: function(contract) {
        try {
          var Manager = window.AIOS && window.AIOS.Mission;
          var Extractor = window.AIOS && window.AIOS.MissionExtractor;
          if (Extractor && Manager) {
            var result = Extractor.process(contract, null);
            if (result && result.action === 'create') {
              console.log('[AIOS][ACTION-BAR] Mission created: ' + result.mission.type);
              // Sync to persistence
              if (window.AIOS.MissionState && window.AIOS.MissionState.syncFromAIOS) {
                window.AIOS.MissionState.syncFromAIOS();
              }
              if (typeof showToast === 'function') {
                showToast('Mission created: ' + (result.mission.name || result.mission.type).replace(/_/g, ' '), 'success');
              }
            }
          }
        } catch (e) {
          console.warn('[AIOS][ACTION-BAR] create-mission error:', e.message || e);
        }
      }
    },

    // ── View Mission (Dashboard) ────────────────────────────
    {
      id: 'view-mission',
      label: 'View in Dashboard',
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
      show: function(contract, activeMission) {
        // Show when an active mission exists
        return !!(activeMission && activeMission.status === 'in_progress');
      },
      action: function() {
        // Navigate to profile/dashboard page
        window.location.href = 'profile.html';
      }
    },

    // ── Add to Checklist ────────────────────────────────────
    {
      id: 'add-checklist',
      label: 'Add to Checklist',
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
      show: function(contract, activeMission) {
        // Show when there are actionable steps AND an active mission to attach them to
        if (!contract || !contract.recommended_actions) return false;
        if (!activeMission || activeMission.status !== 'in_progress') return false;
        var actionCount = 0;
        for (var i = 0; i < contract.recommended_actions.length; i++) {
          if (contract.recommended_actions[i].isAction) actionCount++;
        }
        return actionCount > 0;
      },
      action: function(contract, activeMission, messageDiv, btnEl) {
        try {
          var Extractor = window.AIOS && window.AIOS.MissionExtractor;
          if (!Extractor) return;
          var snapshot = Extractor.buildDashboardSnapshot(contract, activeMission);
          if (snapshot && snapshot.checklist && snapshot.checklist.length > 0) {
            // Store checklist items in MissionState for dashboard pickup
            if (window.AIOS.MissionState) {
              var existing = window.AIOS.MissionState.get() || {};
              var existingChecklist = existing.checklist || [];
              var newItems = [];
              for (var i = 0; i < snapshot.checklist.length; i++) {
                var item = snapshot.checklist[i];
                if (item.source === 'ai_response') {
                  // Deduplicate by text
                  var isDupe = false;
                  for (var j = 0; j < existingChecklist.length; j++) {
                    if (existingChecklist[j].text === item.text) { isDupe = true; break; }
                  }
                  if (!isDupe) newItems.push(item);
                }
              }
              if (newItems.length > 0) {
                existing.checklist = existingChecklist.concat(newItems);
                window.AIOS.MissionState.set(existing);
                console.log('[AIOS][ACTION-BAR] Added ' + newItems.length + ' items to checklist');
                if (typeof showToast === 'function') {
                  showToast(newItems.length + ' item' + (newItems.length > 1 ? 's' : '') + ' added to checklist', 'success');
                }
                // Visual feedback on button
                if (btnEl) {
                  btnEl.textContent = '\u2713 Added';
                  btnEl.disabled = true;
                }
              } else {
                if (typeof showToast === 'function') {
                  showToast('Items already in checklist', 'info');
                }
              }
            }
          }
        } catch (e) {
          console.warn('[AIOS][ACTION-BAR] add-checklist error:', e.message || e);
        }
      }
    },

    // ── Open Resources ──────────────────────────────────────
    {
      id: 'open-resources',
      label: 'Open Resources',
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
      show: function(contract) {
        // Show when response contains URL resources
        if (!contract || !contract.resources) return false;
        var urlCount = 0;
        for (var i = 0; i < contract.resources.length; i++) {
          if (contract.resources[i].type === 'url') urlCount++;
        }
        return urlCount > 0;
      },
      action: function(contract) {
        // Open the first URL resource; if multiple, navigate to resources page
        if (!contract || !contract.resources) return;
        var urls = [];
        for (var i = 0; i < contract.resources.length; i++) {
          if (contract.resources[i].type === 'url') urls.push(contract.resources[i].value);
        }
        if (urls.length === 1) {
          window.open(urls[0], '_blank', 'noopener');
        } else if (urls.length > 1) {
          // Open first, toast about others
          window.open(urls[0], '_blank', 'noopener');
          if (typeof showToast === 'function') {
            showToast(urls.length + ' resources found — first one opened', 'info');
          }
        }
      }
    }

  ]; // end BUTTONS


  /* ────────────────────────────────────────────────────────
     Suppression Rules
     Prevent action bar from appearing in contexts where
     it would be redundant or inappropriate.
     ──────────────────────────────────────────────────────── */
  function _shouldSuppress(contract) {
    if (!contract) return true;

    // Never show action bar on crisis responses
    if (contract.mode === 'crisis') return true;

    // Never show on pure intake questions (too early in conversation)
    if (contract.mode === 'intake') return true;

    // Never show on low-confidence conversation mode with no signals
    if (contract.mode === 'conversation' &&
        !contract.mission_signals &&
        !contract.recommended_actions &&
        !contract.resources) return true;

    return false;
  }


  /* ════════════════════════════════════════════════════════
     PUBLIC API — ActionBar.render(contract, messageDiv)
     ════════════════════════════════════════════════════════ */

  var ActionBar = {

    /**
     * Render contextual action buttons under an AI message div.
     * Safe to call multiple times — idempotent (checks for existing bar).
     *
     * @param {Object} contract — Output of ResponseContract.parse()
     * @param {HTMLElement} messageDiv — The .message--ai DOM element
     * @returns {boolean} true if buttons were rendered, false otherwise
     */
    render: function(contract, messageDiv) {
      if (!contract || !messageDiv) return false;

      // Idempotency: skip if already rendered
      if (messageDiv.querySelector('.p49-action-bar')) return false;

      // Suppression check
      if (_shouldSuppress(contract)) return false;

      // Determine active mission state
      var activeMission = null;
      if (window.AIOS && window.AIOS.Mission) {
        activeMission = window.AIOS.Mission.current || null;
      }

      // Determine which buttons to show
      var visibleButtons = [];
      for (var i = 0; i < BUTTONS.length; i++) {
        if (BUTTONS[i].show(contract, activeMission)) {
          visibleButtons.push(BUTTONS[i]);
        }
      }

      // If no buttons qualify, don't render the bar
      if (visibleButtons.length === 0) return false;

      // Build the bar DOM
      var bar = document.createElement('div');
      bar.className = 'p49-action-bar';

      for (var j = 0; j < visibleButtons.length; j++) {
        (function(btnDef) {
          var btn = document.createElement('button');
          btn.className = 'p49-action-btn p49-action-btn--' + btnDef.id;
          btn.innerHTML = btnDef.icon + ' ' + btnDef.label;
          btn.setAttribute('aria-label', btnDef.label);
          btn.setAttribute('data-action', btnDef.id);

          btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[AIOS][ACTION-BAR] clicked: ' + btnDef.id);
            btnDef.action(contract, activeMission, messageDiv, btn);
          });

          bar.appendChild(btn);
        })(visibleButtons[j]);
      }

      messageDiv.appendChild(bar);
      console.log('[AIOS][ACTION-BAR] rendered ' + visibleButtons.length +
        ' button(s) for mode=' + contract.mode);
      return true;
    },

    /** Expose button definitions for testing/inspection. */
    BUTTONS: BUTTONS
  };


  /* ── Register ─────────────────────────────────────────── */
  window.AIOS = window.AIOS || {};
  window.AIOS.ActionBar = ActionBar;

})();
