/* ══════════════════════════════════════════════════════════
   AIOS — Skill Loader
   Manages loading, activation, and deactivation of skills.
   Skills are self-contained modules with prompts, data refs,
   and response formatting rules.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var SkillLoader = {

    /** Currently active skill (or null) */
    activeSkill: null,

    /**
     * Load and activate a skill by ID.
     * @param {string} skillId
     * @returns {Object|null} The loaded skill, or null if not found
     */
    load: function(skillId) {
      var skill = SkillLoader._registry[skillId] || null;
      if (skill) {
        SkillLoader.activeSkill = skill;
      }
      return skill;
    },

    /**
     * Deactivate the current skill.
     */
    unload: function() {
      SkillLoader.activeSkill = null;
    },

    /**
     * Register a skill module.
     * @param {string} skillId
     * @param {Object} skillModule - { name, prompt, format, dataSources }
     */
    register: function(skillId, skillModule) {
      SkillLoader._registry[skillId] = skillModule;
    },

    /**
     * Get all registered skill IDs.
     * @returns {string[]}
     */
    list: function() {
      return Object.keys(SkillLoader._registry);
    },

    /** Internal registry */
    _registry: {}
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.SkillLoader = SkillLoader;

})();
