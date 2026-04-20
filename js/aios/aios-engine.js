/* ══════════════════════════════════════════════════════════
   AIOS — Engine Orchestrator  (Phase E-C)
   Response Intelligence Layer integration hook.

   Wraps the post-skill execution step: takes a routing result
   and a skill envelope (skill.run() → .data) and, when the
   AIOS_RIL_ENABLED flag is true, routes the envelope through
   ResponseShaper before output reaches the UI.

   When AIOS_RIL_ENABLED is false (DEFAULT), this module is a
   transparent pass-through — it does not alter app.js behavior
   in any way. Enable only after Phase E-D audit passes.

   INTEGRATION CONTRACT:
     After skill.run(context) returns skillConfig, caller does:

       var memCtx  = window.AIOS.Memory.getSkillContext();
       var rilResult = window.AIOS.Engine.runSkill({
         routeResult: routeResult,
         skillConfig: skillConfig,
         profile:     memCtx.profile,
         session:     memCtx.session
       });

     If rilResult.shapedText is non-empty:
       use rilResult.shapedText as primary text output
       attach rilResult.rawEnvelope, .rilTrace, .rilTone for audit

     Otherwise:
       continue the existing system-prompt path unchanged

   FILE MODIFIED: NONE. This is a new file.
   DO NOT MODIFY: router.js, memory-manager.js, skills, response-shaper.js,
                  response-catalog.js, app.js
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Feature flag
     Default: false — RIL is bypassed until Phase E-D passes.
     Flip to true only after full E-D audit is complete.
     ──────────────────────────────────────────────────────── */
  var AIOS_RIL_ENABLED = true;    // Phase E-C.5: E-D audit passed — RIL activated


  /* ────────────────────────────────────────────────────────
     Private helpers
     ──────────────────────────────────────────────────────── */

  /**
   * _buildRoutingInput
   * Normalise a raw routeResult object into the flat routing
   * descriptor expected by ResponseShaper.shapeResponse().
   *
   * Defensive: every field defaults to a safe empty value so
   * the shaper never sees undefined in the routing object.
   *
   * @param  {Object} routeResult — output of Router.routeAIOSIntent()
   * @returns {Object} routing descriptor
   */
  function _buildRoutingInput(routeResult) {     // INSERTION POINT B (line 53)
    if (!routeResult || typeof routeResult !== 'object') {
      return {
        intent:       null,
        tier:         null,
        confidence:   0,
        matched:      null,
        executionUrl: null
      };
    }
    return {
      intent:       routeResult.intent       || null,
      tier:         routeResult.tier         || null,
      confidence:   (typeof routeResult.confidence === 'number')
                      ? routeResult.confidence : 0,
      matched:      routeResult.matched      || null,
      executionUrl: routeResult.executionUrl || null
    };
  }

  /**
   * _safeEnvelope
   * Extract the structured data payload from a skill.run() result.
   * skill.run() returns { prompt: string, data: Object }.
   * The shaper reads from .data (pactResult, healthcareResult, etc.).
   * If skillConfig has no .data, fall back to the full object so
   * legacy callers that already pre-extracted data still work.
   *
   * @param  {Object|null} skillConfig — direct output of skill.run()
   * @returns {Object}
   */
  function _safeEnvelope(skillConfig) {          // INSERTION POINT C (line 79)
    if (!skillConfig || typeof skillConfig !== 'object') return {};
    // Standard: skill.run() → { prompt, data }
    if (skillConfig.data && typeof skillConfig.data === 'object') {
      return skillConfig.data;
    }
    // Fallback: caller passed data directly (future-proofing)
    return skillConfig;
  }

  /**
   * _bypassResult
   * Construct the standard bypass/fallback return object.
   * Used for: flag off, shaper unavailable, shaper threw, empty output.
   *
   * @param  {Object|null} skillConfig
   * @param  {boolean}     rilWasEnabled — was the flag on when bypass occurred
   * @param  {Object|null} shaperTrace   — trace from shaper if available
   * @returns {Object}
   */
  function _bypassResult(skillConfig, rilWasEnabled, shaperTrace) {
    return {
      skillConfig: skillConfig,
      shapedText:  '',
      rilEnabled:  rilWasEnabled,
      rawEnvelope: null,
      rilTrace:    shaperTrace || null,
      rilTone:     null
    };
  }


  /* ────────────────────────────────────────────────────────
     Engine — public API
     ──────────────────────────────────────────────────────── */

  var Engine = {

    /**
     * runSkill
     * Core integration point. Called after skill.run(context) returns
     * and before the result is committed to the UI output path.
     *
     * Flag OFF path (default):
     *   Console: [AIOS][ENGINE][BYPASS]
     *   Returns:  { skillConfig, shapedText:'', rilEnabled:false,
     *               rawEnvelope:null, rilTrace:null, rilTone:null }
     *   Behavior: no-op; app.js continues its existing system-prompt path.
     *
     * Flag ON path:
     *   Console: [AIOS][ENGINE][START]
     *   Calls:   ResponseShaper.shapeResponse({ routing, envelope, profile, session })
     *   If shaped text is non-empty:
     *     Returns: { skillConfig, shapedText, rilEnabled:true,
     *                rawEnvelope:skillEnvelope, rilTrace, rilTone }
     *   If shaped text is empty OR trace.fallback is true:
     *     Returns: bypass result (preserves legacy path)
     *
     * @param  {Object} opts
     *   routeResult {Object} — raw output of Router.routeAIOSIntent()
     *   skillConfig {Object} — raw output of skill.run(context) → { prompt, data }
     *   profile     {Object} — AIOS.Memory.getSkillContext().profile
     *   session     {Object} — AIOS.Memory.getSkillContext().session
     * @returns {Object} RIL result descriptor
     */
    runSkill: function (opts) {             // INSERTION POINT D (line 137)
      opts = opts || {};
      var routeResult = opts.routeResult || null;
      var skillConfig = opts.skillConfig || null;
      var profile     = opts.profile     || {};
      var session     = opts.session     || {};

      /* ── FLAG OFF → legacy bypass ──────────────────────── */  // INSERTION POINT E (line 144)
      if (!AIOS_RIL_ENABLED) {
        console.log('[AIOS][ENGINE][BYPASS]');
        return _bypassResult(skillConfig, false, null);
      }

      /* ── FLAG ON → RIL path ────────────────────────────── */
      console.log('[AIOS][ENGINE][START]');                      // INSERTION POINT F (line 150)

      /* Guard: shaper must be present */
      if (!window.AIOS ||
          !window.AIOS.ResponseShaper ||
          typeof window.AIOS.ResponseShaper.shapeResponse !== 'function') {
        console.warn('[AIOS][ENGINE][WARN] ResponseShaper unavailable');
        return _bypassResult(skillConfig, true, null);
      }

      /* Extract skill envelope (the structured data object) */
      var skillEnvelope = _safeEnvelope(skillConfig);            // INSERTION POINT G (line 161)

      /* Build the routing descriptor */
      var routing = _buildRoutingInput(routeResult);             // INSERTION POINT H (line 164)

      /* Call shapeResponse */
      var shaped = null;
      try {
        shaped = window.AIOS.ResponseShaper.shapeResponse({     // INSERTION POINT I (line 169)
          routing:  routing,
          envelope: skillEnvelope,
          profile:  profile,
          session:  session
        });
      } catch (e) {
        console.warn('[AIOS][ENGINE][ERROR] shapeResponse threw:', e.message || String(e));
        return _bypassResult(skillConfig, true, null);
      }

      /* Guard: empty output or explicit fallback → legacy path */
      if (!shaped ||                                             // INSERTION POINT J (line 180)
          !shaped.text ||
          shaped.text.length === 0 ||
          (shaped.trace && shaped.trace.fallback === true)) {
        return _bypassResult(skillConfig, true, shaped ? shaped.trace : null);
      }

      /* Shaped text produced — primary output path */
      return {                                                   // INSERTION POINT K (line 188)
        skillConfig: skillConfig,      // original skill.run() output (prompt + data)
        shapedText:  shaped.text,      // RIL-assembled response text
        rilEnabled:  true,
        rawEnvelope: skillEnvelope,    // structured data object — preserved for audit/debug
        rilTrace:    shaped.trace,     // slot trace: toneMode, slotsUsed, templateKeys, protectedFields
        rilTone:     shaped.toneMode   // selected tone constant
      };
    },

    /**
     * isRILEnabled
     * Read the current flag state.
     * @returns {boolean}
     */
    isRILEnabled: function () {
      return AIOS_RIL_ENABLED;
    },

    /**
     * setRILEnabled
     * Flip the flag at runtime (for Phase E-D audit and testing).
     * Do NOT call from production code paths.
     * @param {boolean} val
     */
    setRILEnabled: function (val) {      // INSERTION POINT L (line 209)
      AIOS_RIL_ENABLED = !!val;
    }

  };


  /* ────────────────────────────────────────────────────────
     Expose on window.AIOS namespace
     ──────────────────────────────────────────────────────── */
  window.AIOS = window.AIOS || {};
  window.AIOS.Engine   = Engine;
  window.AIOS.VERSION  = 'v1.0.0';   // Phase G: production version tag

}());
