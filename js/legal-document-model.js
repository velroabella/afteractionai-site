/* ============================================================
   PHASE 3.6 — Legal Document Model + Parser
   Converts raw AI legal template text into a normalized structure
   for cleaner DOCX generation.

   Output model:
   {
     title:    string,
     sections: [ { heading: string, content: string } ],
     metadata: { formType: string, requiresWitness: boolean, requiresNotary: boolean }
   }
   ============================================================ */

(function () {
  'use strict';

  /* ---------- METADATA LOOKUP TABLES ---------- */

  var WITNESS_FORMS = [
    'general-power-of-attorney',
    'durable-power-of-attorney',
    'medical-power-of-attorney',
    'living-will',
    'last-will-and-testament',
    'hipaa-authorization-form'
  ];

  var NOTARY_FORMS = [
    'general-power-of-attorney',
    'durable-power-of-attorney',
    'living-will',
    'last-will-and-testament'
  ];

  /* ---------- HEADING DETECTION ---------- */

  // Returns true if a line looks like a section heading
  function isHeadingLine(line) {
    var t = line.trim();
    if (!t || t.length < 3) return false;

    // ## Heading  /  ### Heading
    if (/^#{1,4}\s+\S/.test(t)) return true;

    // **Heading** or **Heading
    if (/^\*{1,2}[A-Z][^*\n]{2,}\*{0,2}$/.test(t)) return true;

    // ALL-CAPS line (letters only, not a [PLACEHOLDER] or short filler)
    if (
      t === t.toUpperCase() &&
      t.length >= 4 &&
      /[A-Z]/.test(t) &&
      !/^\[.+\]$/.test(t) &&
      !/^[-_=*]{3,}$/.test(t)
    ) return true;

    // Title-Case phrase ending with colon, under 60 chars  (e.g. "Powers Granted:")
    if (/^[A-Z][A-Za-z0-9\s\-\u2014]+:$/.test(t) && t.length < 60) return true;

    return false;
  }

  // Strips markdown decoration from a heading line → plain text
  function stripHeadingMarkup(line) {
    return line.trim()
      .replace(/^#{1,4}\s+/, '')
      .replace(/^\*{1,2}/, '')
      .replace(/\*{1,2}$/, '')
      .replace(/:$/, '')
      .trim();
  }

  /* ---------- MAIN PARSER ---------- */

  /**
   * parseLegalResponse(rawText, formType)
   *
   * Parses a raw AI legal template into a structured document model.
   * Returns null on failure — callers should fall back to raw text DOCX.
   *
   * @param  {string} rawText   — raw AI chat response
   * @param  {string} formType  — detected form type slug (e.g. 'living-will')
   * @returns {object|null}
   */
  function parseLegalResponse(rawText, formType) {
    try {
      if (!rawText || typeof rawText !== 'string') return null;

      // Strip [OPTIONS:...] blocks and leading/trailing whitespace
      var text = rawText
        .replace(/\[OPTIONS:[^\]]*\]/g, '')
        .trim();

      if (text.length < 80) return null;

      var lines = text.split('\n');
      var title = '';
      var sections = [];
      var currentHeading = '';
      var currentLines = [];
      var titleFound = false;
      var startIdx = 0;

      // ── Extract document title ──────────────────────────────
      // Scan first 8 lines for the first heading-like or ALL-CAPS line.
      for (var i = 0; i < Math.min(lines.length, 8); i++) {
        var l = lines[i].trim();
        if (!l) continue;

        if (isHeadingLine(lines[i])) {
          title = stripHeadingMarkup(lines[i]);
          titleFound = true;
          startIdx = i + 1;
          break;
        }
        // No heading found — use first non-empty line as fallback title
        if (!titleFound && i <= 2) {
          title = l;
          titleFound = true;
          startIdx = i + 1;
          break;
        }
      }

      // ── Parse remaining lines into sections ─────────────────
      for (var j = startIdx; j < lines.length; j++) {
        var line = lines[j];
        var trimmedLine = line.trim();

        if (isHeadingLine(line) && stripHeadingMarkup(line) !== title) {
          // Flush current section
          if (currentHeading !== '' || currentLines.length > 0) {
            var flushed = currentLines.join('\n').trim();
            if (currentHeading !== '' || flushed !== '') {
              sections.push({ heading: currentHeading, content: flushed });
            }
          }
          currentHeading = stripHeadingMarkup(line);
          currentLines = [];
        } else {
          currentLines.push(trimmedLine);
        }
      }

      // Flush final section
      if (currentHeading !== '' || currentLines.length > 0) {
        var lastContent = currentLines.join('\n').trim();
        if (currentHeading !== '' || lastContent !== '') {
          sections.push({ heading: currentHeading, content: lastContent });
        }
      }

      // If no sections were detected, parsing has not added value → return null
      if (sections.length === 0) return null;

      // ── Build metadata ──────────────────────────────────────
      var normalized = (formType || '').toLowerCase().replace(/[\s_]+/g, '-');
      var lower = text.toLowerCase();

      return {
        title:    title || formType || 'Legal Document',
        sections: sections,
        metadata: {
          formType:       normalized,
          requiresWitness: WITNESS_FORMS.indexOf(normalized) !== -1 || lower.indexOf('witness') !== -1,
          requiresNotary:  NOTARY_FORMS.indexOf(normalized)  !== -1 || lower.indexOf('notary')  !== -1
        }
      };

    } catch (err) {
      console.warn('[LegalModel] Parse error (non-fatal):', err.message);
      return null;
    }
  }

  /* ---------- EXPOSE ON AAAI NAMESPACE ---------- */

  window.AAAI = window.AAAI || {};
  window.AAAI.legalModel = {
    parse: parseLegalResponse
  };

})();
