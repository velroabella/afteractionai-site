/* ══════════════════════════════════════════════════════════
   AIOS — Request Builder
   Assembles the full API request payload by combining the
   system prompt, conversation history, skill context,
   veteran profile, and any injected data.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var RequestBuilder = {

    /**
     * Build a complete messages array for the chat API.
     * @param {Object} opts
     * @param {string} opts.systemPrompt - Assembled by CorePrompt
     * @param {Array}  opts.history      - Conversation messages
     * @param {string} opts.userInput    - Current user message
     * @param {Object} [opts.injection]  - Extra context to prepend (skill data, docs)
     * @returns {Array} Messages array ready for API call
     */
    build: function(opts) {
      var messages = [];

      if (opts.systemPrompt) {
        messages.push({ role: 'system', content: opts.systemPrompt });
      }

      if (opts.injection) {
        messages.push({ role: 'system', content: JSON.stringify(opts.injection) });
      }

      if (opts.history && opts.history.length) {
        messages = messages.concat(opts.history);
      }

      if (opts.userInput) {
        messages.push({ role: 'user', content: opts.userInput });
      }

      return messages;
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.RequestBuilder = RequestBuilder;

})();
