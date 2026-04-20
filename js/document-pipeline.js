// ══════════════════════════════════════════════════════════
// DOCUMENT PIPELINE — SINGLE ENTRY POINT
//
// Purpose:
//   Every .docx generation in After Action AI MUST flow through
//   AAAI.docPipeline.generate(formType, userData, context).
//
//   No direct calls to AAAI.legalDocx.generate or
//   AAAI.legalDocx.generateFromData are permitted outside this file.
//
// Responsibilities:
//   1. Input normalization        — unify formType, userData, context
//   2. Pre-generation validation  — required fields, enum values,
//                                   data placeholder scan
//   3. Acknowledgment gate        — mandatory legal acknowledgment
//   4. Dispatch                   — structured data path vs. raw text path
//   5. Post-generation validation — placeholder leak check on output text
//   6. Save-record normalization  — single schema for dashboard persistence
//   7. Structured error returns   — no silent failures
//
// Output contract (always returns a Promise resolving to this shape):
//   {
//     ok:              boolean,
//     form_type:       string,      // normalized
//     file_name:       string|null, // null if !ok
//     content_text:    string|null, // plain-text representation for save
//     validation:      {
//        passed:       boolean,
//        pre_errors:   string[],    // blocking errors detected pre-build
//        post_errors:  string[],    // blocking errors detected post-build
//        warnings:     string[]
//     },
//     save_record:     {            // canonical shape for dashboard save
//        form_type:    string,
//        file_name:    string,
//        content_text: string,
//        fields_used:  string[],
//        generated_at: string,      // ISO 8601
//        pipeline_version: string
//     } | null,
//     error:           string|null
//   }
// ══════════════════════════════════════════════════════════

(function () {
  'use strict';

  var PIPELINE_VERSION = '1.0.0';

  // ── PLACEHOLDER DETECTION PATTERNS ─────────────────────
  // Any surviving [BRACKET], $[BRACKET], or [ADD YOUR ...] patterns
  // in the final output text indicate a data-sourcing or template
  // defect (Phase G+ regression). Block the document rather than
  // emit a broken artifact.
  var PLACEHOLDER_PATTERNS = [
    /\[[A-Z][A-Z _]{1,40}\]/,                  // [PHONE], [EMAIL], [FULL NAME]
    /\$\[[A-Z][A-Z _]{0,40}\]/,                // $[AMOUNT], $[AMT]
    /\[ADD\s+[^\]]{1,80}\]/i,                  // [ADD YOUR SPECIFIC ACCOMPLISHMENTS]
    /\[LIST\s+[^\]]{1,80}\]/i,                 // [LIST RELEVANT CERTIFICATIONS]
    /\[INSERT\s+[^\]]{1,80}\]/i,               // [INSERT YOUR ...]
    /\[YOUR\s+[^\]]{1,80}\]/i,                 // [YOUR NAME HERE]
    /\[NOT\s+PROVIDED\]/i                      // Hard skeleton leak
  ];

  // Allowed tokens that LOOK like placeholders but are intentional
  // (e.g., appearing inside a disclaimer that explains the template).
  var PLACEHOLDER_ALLOWLIST = [
    /\[DRAFT\s+TEMPLATE[^\]]*\]/i,
    /\[TEMPLATE[^\]]*\]/i,
    /\[SAMPLE[^\]]*\]/i,
    /\[EXAMPLE[^\]]*\]/i
  ];

  // ── REQUIRED FIELDS BY FORM TYPE ───────────────────────
  // Structured paths (resume-builder, rental-application-packet) fail
  // pre-build if these fields are missing or empty. Raw-content paths
  // (markdown-based legal forms) skip this check.
  var REQUIRED_FIELDS = {
    'resume-builder': {
      critical: ['fullName', 'branch', 'mos', 'rank', 'yearsService'],
      min_critical_filled: 2
    },
    'rental-application-packet': {
      critical: ['fullName', 'email', 'phone', 'currentAddress'],
      min_critical_filled: 3
    }
  };

  // ── ENUM FIELD WHITELISTS ──────────────────────────────
  // Validates against known-good values to prevent enum drift
  // (see DEFECT 7B-1: 'adaptive_sports' passed guards silently).
  var ENUM_FIELDS = {
    branch: [
      'Army', 'Navy', 'Air Force', 'Marine Corps', 'Marines',
      'Coast Guard', 'Space Force', 'National Guard', 'Reserve'
    ],
    dischargeType: [
      'Honorable', 'General', 'General Under Honorable Conditions',
      'Other Than Honorable', 'OTH', 'Bad Conduct', 'Dishonorable',
      'Entry-Level Separation', 'Uncharacterized'
    ],
    serviceStatus: [
      'Active Duty', 'Veteran', 'Retired', 'Reserve', 'National Guard',
      'Separated', 'Transitioning'
    ]
  };

  // ── RAW-CONTENT STRUCTURE MIN ──────────────────────────
  // Raw markdown-ish content must meet at least one of:
  //   - contain a heading (# or ##)
  //   - be >= 80 words
  var MIN_RAW_CONTENT_WORDS = 80;

  /* ======================================================
     INTERNAL HELPERS
     ====================================================== */

  function _normalizeFormType(formType) {
    if (!formType || typeof formType !== 'string') return null;
    return formType.toLowerCase().replace(/[\s_]+/g, '-').trim();
  }

  function _isStructuredType(normalized) {
    return normalized === 'resume-builder' ||
           normalized === 'rental-application-packet';
  }

  function _toPlainTextFromData(data) {
    // Flatten structured data to scannable text for placeholder detection.
    try {
      return Object.keys(data || {}).map(function (k) {
        var v = data[k];
        if (v == null) return '';
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      }).join('\n');
    } catch (_e) {
      return '';
    }
  }

  function _scanForPlaceholders(text) {
    // Returns array of placeholder strings detected, excluding allowlisted.
    if (!text || typeof text !== 'string') return [];
    var hits = [];
    PLACEHOLDER_PATTERNS.forEach(function (pattern) {
      var match = text.match(pattern);
      if (!match) return;
      var token = match[0];
      var allowed = PLACEHOLDER_ALLOWLIST.some(function (rx) {
        return rx.test(token);
      });
      if (!allowed && hits.indexOf(token) === -1) {
        hits.push(token);
      }
    });
    return hits;
  }

  function _validateRequiredFields(normalized, data) {
    var spec = REQUIRED_FIELDS[normalized];
    if (!spec) return { ok: true, missing: [] };
    var missing = [];
    var filled = 0;
    spec.critical.forEach(function (field) {
      var v = data && data[field];
      var isFilled = v != null && String(v).trim() !== '' &&
                     !/^\[.*\]$/.test(String(v).trim());
      if (isFilled) filled++;
      else missing.push(field);
    });
    if (filled < spec.min_critical_filled) {
      return {
        ok: false,
        missing: missing,
        error: 'Only ' + filled + ' of ' + spec.min_critical_filled +
               ' required fields filled for ' + normalized +
               '. Missing: ' + missing.join(', ')
      };
    }
    return { ok: true, missing: missing };
  }

  function _validateEnums(data) {
    var errors = [];
    Object.keys(ENUM_FIELDS).forEach(function (field) {
      var v = data && data[field];
      if (v == null || v === '') return;
      var allowed = ENUM_FIELDS[field];
      var match = allowed.some(function (a) {
        return String(v).toLowerCase().trim() === String(a).toLowerCase().trim();
      });
      if (!match) {
        errors.push('Invalid enum for "' + field + '": "' + v +
                    '" (allowed: ' + allowed.slice(0, 4).join(', ') +
                    (allowed.length > 4 ? ', ...' : '') + ')');
      }
    });
    return errors;
  }

  function _validateRawContent(content) {
    if (!content || typeof content !== 'string') {
      return ['Raw content is empty'];
    }
    var hasHeading = /^#{1,3}\s+.+/m.test(content) || /\n#{1,3}\s+.+/.test(content);
    var wordCount = content.split(/\s+/).filter(function (w) {
      return w.length > 0;
    }).length;
    if (!hasHeading && wordCount < MIN_RAW_CONTENT_WORDS) {
      return ['Raw content has no heading and only ' + wordCount + ' words ' +
              '(minimum ' + MIN_RAW_CONTENT_WORDS + ')'];
    }
    // Reject content that leads with conversational preamble patterns
    var firstChunk = content.substring(0, 200).toLowerCase();
    var badPreambles = [
      'the veteran asked', 'user request', "here's what you asked",
      'here is what you asked', 'below is the document you requested',
      'i understand you want'
    ];
    var preambleHit = badPreambles.find(function (p) {
      return firstChunk.indexOf(p) !== -1;
    });
    if (preambleHit) {
      return ['Raw content leads with conversational preamble: "' + preambleHit + '"'];
    }
    return [];
  }

  function _emptySaveRecord() {
    return null;
  }

  function _buildSaveRecord(normalized, fileName, contentText, fieldsUsed) {
    return {
      form_type:        normalized,
      file_name:        fileName,
      content_text:     contentText || '',
      fields_used:      fieldsUsed || [],
      generated_at:     new Date().toISOString(),
      pipeline_version: PIPELINE_VERSION
    };
  }

  function _result(ok, formType, fileName, contentText, validation, saveRecord, error) {
    return {
      ok:           !!ok,
      form_type:    formType || null,
      file_name:    fileName || null,
      content_text: contentText || null,
      validation:   validation,
      save_record:  saveRecord,
      error:        error || null
    };
  }

  function _emptyValidation() {
    return { passed: true, pre_errors: [], post_errors: [], warnings: [] };
  }

  /* ======================================================
     ACKNOWLEDGMENT WRAPPER
     ====================================================== */

  function _runAcknowledgment(formType, onConfirm) {
    // If the legal-acknowledgment module is loaded, enforce the
    // mandatory acknowledgment modal before generation. Otherwise fail
    // loudly — we do not permit ungated generation.
    if (window.AAAI && window.AAAI.legal &&
        typeof window.AAAI.legal.requireAcknowledgment === 'function') {
      window.AAAI.legal.requireAcknowledgment(formType, onConfirm);
      return true;
    }
    console.error('[DocPipeline] AAAI.legal.requireAcknowledgment is unavailable');
    return false;
  }

  /* ======================================================
     CORE GENERATE
     ====================================================== */

  /**
   * Single entry point for ALL document generation.
   *
   * @param {string} formType — form type id (case-insensitive, underscore/space normalized)
   * @param {Object|string} userData — structured data object OR raw AI text content
   * @param {Object} [context] — optional context:
   *        - skipAcknowledgment: boolean (ONLY for internal retry after prior gate)
   *        - onSuccess:          function(saveRecord) → post-save hook
   *        - onError:            function(errorString) → error hook
   *        - mode:               'auto' | 'structured' | 'raw' (default 'auto')
   * @returns {Promise<Object>} — pipeline result shape (see top of file)
   */
  function generate(formType, userData, context) {
    context = context || {};
    var validation = _emptyValidation();

    /* ── 1. Normalize and classify input ───────────────── */
    var normalized = _normalizeFormType(formType);
    if (!normalized) {
      validation.pre_errors.push('formType is empty or invalid');
      validation.passed = false;
      var r = _result(false, null, null, null, validation, null,
        'Pipeline rejected: invalid formType');
      if (context.onError) try { context.onError(r.error); } catch (_e) {}
      return Promise.resolve(r);
    }

    // Determine mode
    var mode = context.mode || 'auto';
    var isStructuredData = userData && typeof userData === 'object' &&
                           !Array.isArray(userData);
    var isRawText = typeof userData === 'string' && userData.length > 0;

    if (mode === 'auto') {
      if (_isStructuredType(normalized) && isStructuredData) mode = 'structured';
      else if (isRawText) mode = 'raw';
      else if (_isStructuredType(normalized)) mode = 'structured';
      else mode = 'raw';
    }

    /* ── 2. Pre-generation validation ───────────────────── */
    if (mode === 'structured') {
      if (!isStructuredData) {
        validation.pre_errors.push('Structured mode requires an object for userData');
      } else {
        // Required fields
        var reqCheck = _validateRequiredFields(normalized, userData);
        if (!reqCheck.ok) {
          validation.pre_errors.push(reqCheck.error);
        }
        // Enum validation
        var enumErrors = _validateEnums(userData);
        if (enumErrors.length) {
          // Enum errors are blocking — they caused DEFECT 7B-1 silent failures
          enumErrors.forEach(function (e) { validation.pre_errors.push(e); });
        }
        // Pre-build placeholder scan on the DATA itself
        var dataPlaceholders = _scanForPlaceholders(_toPlainTextFromData(userData));
        if (dataPlaceholders.length) {
          validation.pre_errors.push('Data contains literal placeholder tokens: ' +
            dataPlaceholders.slice(0, 5).join(', '));
        }
      }
    } else {
      // Raw mode: validate content structure
      var rawErrors = _validateRawContent(userData);
      rawErrors.forEach(function (e) { validation.pre_errors.push(e); });
      // Pre-build placeholder scan on raw content
      if (isRawText) {
        var rawPlaceholders = _scanForPlaceholders(userData);
        if (rawPlaceholders.length) {
          validation.pre_errors.push('Raw content contains placeholder tokens: ' +
            rawPlaceholders.slice(0, 5).join(', '));
        }
      }
    }

    if (validation.pre_errors.length > 0) {
      validation.passed = false;
      var preFailResult = _result(
        false, normalized, null, null, validation, null,
        'Pre-generation validation failed: ' + validation.pre_errors.join('; ')
      );
      console.warn('[DocPipeline] PRE-VALIDATION FAILED for ' + normalized + ':',
        validation.pre_errors);
      if (context.onError) try { context.onError(preFailResult.error); } catch (_e) {}
      return Promise.resolve(preFailResult);
    }

    /* ── 3. Acknowledgment gate ─────────────────────────── */
    var finalMode = mode;
    return new Promise(function (resolve) {
      var proceed = function (confirmedFormType) {
        var effectiveFormType = _normalizeFormType(confirmedFormType) || normalized;
        _dispatchGeneration(effectiveFormType, userData, finalMode, validation, context, resolve);
      };

      if (context.skipAcknowledgment === true) {
        proceed(normalized);
        return;
      }

      var gated = _runAcknowledgment(normalized, proceed);
      if (!gated) {
        validation.passed = false;
        validation.pre_errors.push('Acknowledgment module unavailable');
        resolve(_result(false, normalized, null, null, validation, null,
          'Pipeline rejected: acknowledgment module unavailable'));
      }
    });
  }

  function _dispatchGeneration(normalized, userData, mode, validation, context, resolve) {
    if (!window.AAAI || !window.AAAI.legalDocx) {
      validation.passed = false;
      validation.post_errors.push('AAAI.legalDocx is unavailable');
      return resolve(_result(false, normalized, null, null, validation, null,
        'Generator module not loaded'));
    }

    var promise;
    try {
      if (mode === 'structured') {
        if (typeof window.AAAI.legalDocx._pipelineGenerateFromData !== 'function') {
          // Fall back to public API (pipeline is the only gate now so calling
          // the public API here is safe and invisible to consumers).
          promise = window.AAAI.legalDocx.generateFromData(normalized, userData);
        } else {
          promise = window.AAAI.legalDocx._pipelineGenerateFromData(normalized, userData);
        }
      } else {
        if (typeof window.AAAI.legalDocx._pipelineGenerate !== 'function') {
          promise = window.AAAI.legalDocx.generate(normalized, userData);
        } else {
          promise = window.AAAI.legalDocx._pipelineGenerate(normalized, userData);
        }
      }
    } catch (dispatchErr) {
      validation.passed = false;
      validation.post_errors.push('Dispatch threw: ' +
        (dispatchErr && dispatchErr.message ? dispatchErr.message : String(dispatchErr)));
      var dispatchResult = _result(false, normalized, null, null, validation, null,
        'Dispatch failed: ' + (dispatchErr && dispatchErr.message ?
          dispatchErr.message : String(dispatchErr)));
      if (context.onError) try { context.onError(dispatchResult.error); } catch (_e) {}
      return resolve(dispatchResult);
    }

    if (!promise || typeof promise.then !== 'function') {
      // Legacy path returned a string (fileName) synchronously — wrap it.
      promise = Promise.resolve(
        typeof promise === 'string' ? { fileName: promise, contentText: '' } : promise
      );
    }

    promise.then(function (generated) {
      // Normalize generator return: public generate() returns a string fileName;
      // generateFromData returns { fileName, blob, contentText }.
      var fileName, contentText;
      if (typeof generated === 'string') {
        fileName = generated;
        contentText = (mode === 'raw' && typeof userData === 'string') ?
          userData : _toPlainTextFromData(userData);
      } else if (generated && typeof generated === 'object') {
        fileName = generated.fileName || null;
        contentText = generated.contentText ||
          ((mode === 'raw' && typeof userData === 'string') ?
            userData : _toPlainTextFromData(userData));
      } else {
        fileName = null;
        contentText = '';
      }

      /* ── 4. Post-generation validation ───────────────── */
      var postPlaceholders = _scanForPlaceholders(contentText);
      if (postPlaceholders.length) {
        // A placeholder leak at this stage means a BUILDER defect
        // (hardcoded [PHONE]/[EMAIL] literals in buildResumeFromData).
        // Surface the leak — do NOT silently save a broken document.
        validation.post_errors.push('Output contains placeholder leaks: ' +
          postPlaceholders.slice(0, 8).join(', '));
      }

      if (validation.post_errors.length > 0) {
        validation.passed = false;
        var postFailResult = _result(false, normalized, fileName, contentText,
          validation, null,
          'Post-generation validation failed: ' + validation.post_errors.join('; '));
        console.error('[DocPipeline] POST-VALIDATION FAILED for ' + normalized + ':',
          validation.post_errors);
        if (context.onError) {
          try { context.onError(postFailResult.error); } catch (_e) {}
        }
        return resolve(postFailResult);
      }

      /* ── 5. Build canonical save record ──────────────── */
      var fieldsUsed = (mode === 'structured' && userData) ?
        Object.keys(userData).filter(function (k) {
          var v = userData[k];
          return v != null && String(v).trim() !== '';
        }) : [];

      var saveRecord = _buildSaveRecord(normalized, fileName, contentText, fieldsUsed);

      var successResult = _result(true, normalized, fileName, contentText,
        validation, saveRecord, null);

      console.log('[DocPipeline] OK ' + normalized + ' → ' + fileName +
        ' (mode=' + mode + ', fields=' + fieldsUsed.length + ')');

      if (context.onSuccess) {
        try { context.onSuccess(saveRecord); } catch (_e) {
          console.error('[DocPipeline] onSuccess hook threw:', _e);
        }
      }

      resolve(successResult);
    }).catch(function (err) {
      validation.passed = false;
      var msg = err && err.message ? err.message : String(err || 'Unknown generator error');
      validation.post_errors.push('Generator threw: ' + msg);
      var errResult = _result(false, normalized, null, null, validation, null,
        'Generator error: ' + msg);
      console.error('[DocPipeline] Generator failed for ' + normalized + ':', err);
      if (context.onError) try { context.onError(errResult.error); } catch (_e) {}
      resolve(errResult);
    });
  }

  /* ======================================================
     PUBLIC API
     ====================================================== */

  window.AAAI = window.AAAI || {};
  window.AAAI.docPipeline = {
    VERSION:  PIPELINE_VERSION,
    generate: generate,

    // Exposed for tests + diagnostics only. Do not call from product code.
    _scan:    _scanForPlaceholders,
    _reqCheck: _validateRequiredFields,
    _enumCheck: _validateEnums,
    _rawCheck: _validateRawContent,

    // Registry extensions
    addRequiredFields: function (formType, spec) {
      var n = _normalizeFormType(formType);
      if (n && spec && spec.critical && spec.min_critical_filled != null) {
        REQUIRED_FIELDS[n] = spec;
      }
    },
    addEnum: function (field, values) {
      if (field && Array.isArray(values)) ENUM_FIELDS[field] = values.slice();
    }
  };

  console.log('[DocPipeline] v' + PIPELINE_VERSION + ' loaded. ' +
    'Single entry point: AAAI.docPipeline.generate(formType, userData, context)');

})();
