/* ══════════════════════════════════════════════════════════
   AIOS — Skill Loader
   Maps router output (skill name) to the correct skill
   module from window.AIOS.Skills. Manages activation,
   deactivation, and safe fallback for unknown skills.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Valid skill IDs — must match keys in AIOS.Skills
     ──────────────────────────────────────────────────────── */
  var KNOWN_SKILLS = [
    'benefit-path-finder',
    'va-disability-claim',
    'state-benefits',
    'crisis-support',
    'next-action-planner',
    'document-analyzer',
    'family-survivor-support',  // Phase 38
    'employment-transition',    // Phase R5.7
    'education-benefits',       // Phase R5
    'pact-act-toxic-exposure',  // Phase R5.3
    'va-healthcare',            // Phase R5.4
    'housing-benefits',         // Phase R5.5
    'mental-health',            // Phase R5.6
    'tdiu'                      // Phase R5.8
  ];


  var SkillLoader = {

    /** Currently active skill (or null) */
    activeSkill: null,

    /**
     * Load and activate a skill by name.
     * Reads from window.AIOS.Skills (populated by each skill's IIFE).
     * Returns null with a console warning for unknown skills.
     *
     * @param {string} skillName - Skill ID from router (e.g. 'crisis-support')
     * @returns {Object|null} The skill module, or null if not found
     */
    loadAIOSSkill: function(skillName) {
      if (!skillName || typeof skillName !== 'string') {
        return null;
      }

      var skills = (window.AIOS && window.AIOS.Skills) || {};
      var skill = skills[skillName] || null;

      if (skill) {
        SkillLoader.activeSkill = skill;
        return skill;
      }

      // Unknown skill — warn and return null
      console.warn('[AIOS SkillLoader] Unknown skill: "' + skillName + '". Known skills: ' + KNOWN_SKILLS.join(', '));
      return null;
    },

    /**
     * Get the currently active skill.
     * @returns {Object|null}
     */
    getActive: function() {
      return SkillLoader.activeSkill;
    },

    /**
     * Deactivate the current skill.
     */
    unload: function() {
      SkillLoader.activeSkill = null;
    },

    /**
     * Check if a skill name is known/valid.
     * @param {string} skillName
     * @returns {boolean}
     */
    isKnown: function(skillName) {
      return KNOWN_SKILLS.indexOf(skillName) !== -1;
    },

    /**
     * Get all known skill IDs.
     * @returns {string[]}
     */
    list: function() {
      return KNOWN_SKILLS.slice();
    },

    /**
     * Get all currently registered (loaded in DOM) skill IDs.
     * @returns {string[]}
     */
    listRegistered: function() {
      var skills = (window.AIOS && window.AIOS.Skills) || {};
      return Object.keys(skills);
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.SkillLoader = SkillLoader;

})();
