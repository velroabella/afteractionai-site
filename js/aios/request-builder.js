/* ══════════════════════════════════════════════════════════
   AIOS — Request Builder
   Assembles the final prompt payload from core prompt,
   selected skill, memory context, page context, and user
   input. Output is a structured object ready for the app's
   AI request pipeline (not yet wired).
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var RequestBuilder = {

    /**
     * Build a complete AIOS request payload.
     *
     * @param {Object} opts
     * @param {string}  opts.userMessage   - The veteran's current message
     * @param {Object}  [opts.routeResult] - Output from Router.routeAIOSIntent()
     * @param {Object}  [opts.skillConfig] - Output from skill.run() — { prompt, data }
     * @param {Object}  [opts.memoryContext] - From MemoryManager — veteran profile snapshot
     * @param {Object}  [opts.pageContext]  - Page-level context (e.g. current page, active topics)
     * @returns {Object} { system, messages, meta }
     */
    buildAIOSRequest: function(opts) {
      opts = opts || {};

      // ── 1. Assemble system prompt ──────────────────────
      var systemParts = [];

      // Core prompt (always present)
      var CorePrompt = window.AIOS && window.AIOS.CorePrompt;
      var coreText = CorePrompt ? CorePrompt.getAIOSCorePrompt() : '';
      if (coreText) {
        systemParts.push(coreText);
      }

      // Skill prompt (if a skill was activated)
      if (opts.skillConfig && opts.skillConfig.prompt) {
        systemParts.push(opts.skillConfig.prompt);
      }

      // Memory context (veteran profile snapshot)
      if (opts.memoryContext) {
        var mem = opts.memoryContext;
        var profileLines = ['## VETERAN CONTEXT'];
        if (mem.name)            profileLines.push('- Name: ' + mem.name);
        if (mem.branch)          profileLines.push('- Branch: ' + mem.branch);
        if (mem.serviceEra)      profileLines.push('- Era: ' + mem.serviceEra);
        if (mem.dischargeStatus) profileLines.push('- Discharge: ' + mem.dischargeStatus);
        if (mem.vaRating !== null && mem.vaRating !== undefined)
                                 profileLines.push('- VA Rating: ' + mem.vaRating + '%');
        if (mem.state)           profileLines.push('- State: ' + mem.state);
        if (mem.primaryNeed)     profileLines.push('- Primary need: ' + mem.primaryNeed);
        if (mem.needs && mem.needs.length)
                                 profileLines.push('- Needs: ' + mem.needs.join(', '));
        if (profileLines.length > 1) {
          systemParts.push(profileLines.join('\n'));
        }
      }

      // Page context (current page, active topics, etc.)
      if (opts.pageContext) {
        var pageLines = ['## PAGE CONTEXT'];
        if (opts.pageContext.page)   pageLines.push('- Page: ' + opts.pageContext.page);
        if (opts.pageContext.topics && opts.pageContext.topics.length) {
          pageLines.push('- Active topics: ' + opts.pageContext.topics.join(', '));
        }
        if (opts.pageContext.inputMode) {
          pageLines.push('- Input mode: ' + opts.pageContext.inputMode);
        }
        if (pageLines.length > 1) {
          systemParts.push(pageLines.join('\n'));
        }
      }

      // Skill data hints (unknownFields, etc.)
      if (opts.skillConfig && opts.skillConfig.data) {
        var d = opts.skillConfig.data;
        if (d.unknownFields && d.unknownFields.length) {
          systemParts.push('## SKILL HINTS\n- Unknown context fields: ' + d.unknownFields.join(', ') +
            '\n- These are helpful but NOT required before responding. Ask naturally if needed.');
        }
        if (d.crisisDetected) {
          systemParts.push('## CRISIS DETECTED\nProvide Veterans Crisis Line (988, press 1) immediately.');
        }
      }

      var system = systemParts.join('\n\n');

      // ── 2. Build messages array ────────────────────────
      var messages = [];
      if (opts.userMessage) {
        messages.push({ role: 'user', content: opts.userMessage });
      }

      // ── 3. Assemble meta (for logging / inspection) ───
      var meta = {
        intent: (opts.routeResult && opts.routeResult.intent) || 'GENERAL_QUESTION',
        skill: (opts.routeResult && opts.routeResult.skill) || null,
        confidence: (opts.routeResult && opts.routeResult.confidence) || 0,
        matched: (opts.routeResult && opts.routeResult.matched) || null,
        hasMemory: !!opts.memoryContext,
        hasPageContext: !!opts.pageContext,
        systemPromptLength: system.length
      };

      return {
        system: system,
        messages: messages,
        meta: meta
      };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.RequestBuilder = RequestBuilder;

})();
