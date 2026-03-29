/* ══════════════════════════════════════════════════════════
   AIOS Skill — Crisis Support
   Handles two escalation tiers:
     CRISIS   — immediate danger → Veterans Crisis Line
     AT_RISK  — stabilization + priority resource guidance
   This skill takes priority over all other skills.
   Phase 22: AT_RISK tier added alongside existing CRISIS tier.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ── CRISIS prompt — immediate life-safety response ──────
  var CRISIS_PROMPT =
    '## CRISIS RESPONSE — IMMEDIATE PRIORITY\n' +
    'A veteran has expressed crisis indicators (suicidal ideation, self-harm, or imminent danger).\n' +
    'STOP all other processing. Your ONLY immediate response must:\n' +
    '1. Acknowledge the veteran with genuine compassion — do not minimize or problem-solve yet.\n' +
    '2. Immediately provide Veterans Crisis Line: Call 988 Press 1 | Text 838255 | Chat at VeteransCrisisLine.net\n' +
    '3. Do NOT continue benefit intake or ask other questions until the veteran re-engages.\n' +
    '4. Keep your message short, warm, and focused on connection — one paragraph, not a list.\n' +
    'Example tone: "I hear you, and I\'m glad you\'re talking to me. Please reach out to the Veterans ' +
    'Crisis Line right now — call 988 and press 1. They are trained specifically to help veterans in ' +
    'this moment. You are not alone."';

  // ── AT_RISK prompt — stabilization + priority resources ─
  var AT_RISK_PROMPT =
    '## AT_RISK STABILIZATION — PRIORITY RESPONSE\n' +
    'A veteran has signaled they may be in a fragile or high-stress situation: housing instability, ' +
    'financial distress, isolation, substance challenges, or domestic safety concerns.\n' +
    'Before continuing regular benefit intake:\n' +
    '1. Acknowledge the difficulty with genuine empathy — do not minimize or rush past it.\n' +
    '2. Reassure them they have come to the right place and that real help is available.\n' +
    '3. Prioritize stabilization resources relevant to their situation first:\n' +
    '   - Housing: VA Supportive Housing (HUD-VASH), National Call Center for Homeless Veterans (877-424-3838)\n' +
    '   - Financial: VA Emergency Financial Assistance, VSO emergency funds, Dial 211 for local services\n' +
    '   - Isolation: VA Caregiver Support Line (855-260-3274), Vet Centers at vetcenter.va.gov\n' +
    '   - Substance: VA Substance Use Treatment, SAMHSA helpline via 988\n' +
    '   - Domestic Safety: National DV Hotline (800-799-7233), VA social work services\n' +
    '4. Keep tone calm, forward-focused, and directive — one clear step at a time.\n' +
    '5. After addressing the immediate situation, gently ask how else you can help them move forward.';

  // ── AT_RISK keyword triggers — distinct from crisis keywords ──
  // These are first-person distress signals only — no single-word topic terms.
  // Crisis keywords (in router.js) are always checked first so no overlap is possible.
  var AT_RISK_TRIGGERS = [
    'losing my home', 'losing my house', 'about to lose my home',
    'facing eviction', 'being evicted', 'got evicted', 'getting evicted',
    'foreclosure', "can't pay rent", "can't afford rent",
    'behind on rent', 'behind on my mortgage',
    'living in my car', 'sleeping in my car', 'sleeping outside',
    'no place to live', "i'm homeless", 'i am homeless',
    'became homeless', 'just lost my housing',
    "can't pay my bills", "can't afford food", "can't afford to eat",
    'behind on bills', 'about to lose everything', 'losing everything',
    'completely alone', 'no one to turn to',
    'no one to help me', 'nobody to help me', 'totally isolated',
    'drinking problem', 'alcohol problem', 'drug problem',
    "can't stop drinking", "i'm an addict",
    'being abused', 'domestic violence',
    'unsafe at home', 'afraid to go home'
  ];

  var CrisisSupport = {

    id: 'crisis-support',
    name: 'Crisis Support',
    description: 'Handles CRISIS and AT_RISK escalation tiers for veteran stabilization.',

    /** High-priority — overrides other skill routing */
    priority: 100,

    /** CRISIS triggers (used by detect() and router.js CRISIS_KEYWORDS) */
    triggers: [
      'suicide', 'kill myself', 'end it', 'want to die',
      'no reason to live', "can't go on", 'hopeless',
      'self-harm', 'hurt myself', 'crisis', 'emergency',
      "don't want to be here", 'give up'
    ],

    /**
     * Check if user input contains CRISIS signals.
     * @param {string} userInput
     * @returns {boolean}
     */
    detect: function(userInput) {
      if (!userInput) return false;
      var lower = userInput.toLowerCase();
      return CrisisSupport.triggers.some(function(trigger) {
        return lower.indexOf(trigger) !== -1;
      });
    },

    /**
     * Check if user input contains AT_RISK signals.
     * Only call after confirming detect() returned false (CRISIS takes priority).
     * @param {string} userInput
     * @returns {boolean}
     */
    detectAtRisk: function(userInput) {
      if (!userInput) return false;
      var lower = userInput.toLowerCase();
      return AT_RISK_TRIGGERS.some(function(trigger) {
        return lower.indexOf(trigger) !== -1;
      });
    },

    /**
     * Execute the skill — returns tier-appropriate prompt and data.
     * @param {Object} context - { profile, history, userInput, tier }
     *   context.tier: 'CRISIS' | 'AT_RISK' (default: 'CRISIS' for safe fallback)
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      var tier = (context && context.tier) || 'CRISIS';
      if (tier === 'AT_RISK') {
        return { prompt: AT_RISK_PROMPT, data: { atRiskDetected: true } };
      }
      // Default: CRISIS (safe fallback — never demote a potential crisis to AT_RISK)
      return { prompt: CRISIS_PROMPT, data: { crisisDetected: true } };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['crisis-support'] = CrisisSupport;

})();
