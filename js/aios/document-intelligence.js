/* ══════════════════════════════════════════════════════════
   AfterAction AI — AIOS Document Intelligence
   PHASE 3.4 — Document Intelligence

   Lazy-loads pdf.js and Tesseract.js only when a file is
   actually uploaded. Extracts text from PDFs and images,
   then normalizes it through document-analyzer.

   Public API (window.AIOS.DocumentIntelligence):
     extractText(file)          → Promise<string>
     extractAndNormalize(file)  → Promise<{rawText, typeId, fields}>
     status()                   → { pdfReady, ocrReady }

   Registers: window.AIOS.DocumentIntelligence
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  if (!window.AIOS) window.AIOS = {};

  /* ── CDN URLs ─────────────────────────────────────────── */
  var PDF_JS_URL    = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  var PDF_WORKER    = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  var TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

  var MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
  var MAX_PDF_PAGES   = 10;

  /* ── Load state ───────────────────────────────────────── */
  var _pdfReady = false;
  var _ocrReady = false;

  /* ── Lazy script loader ───────────────────────────────── */
  function _loadScript(url) {
    return new Promise(function(resolve, reject) {
      if (document.querySelector('script[src="' + url + '"]')) {
        resolve(); return;
      }
      var s = document.createElement('script');
      s.src = url;
      s.onload  = function() { resolve(); };
      s.onerror = function() { reject(new Error('Failed to load: ' + url)); };
      document.head.appendChild(s);
    });
  }

  /* ── PDF extraction ───────────────────────────────────── */
  function _extractPDF(file) {
    return _loadScript(PDF_JS_URL).then(function() {
      _pdfReady = true;
      var pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
      if (!pdfjsLib) throw new Error('pdf.js did not initialise');
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;

      return file.arrayBuffer().then(function(buf) {
        return pdfjsLib.getDocument({ data: buf }).promise;
      }).then(function(pdf) {
        var pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
        var pagePromises = [];
        for (var i = 1; i <= pages; i++) {
          pagePromises.push(
            pdf.getPage(i).then(function(page) {
              return page.getTextContent().then(function(tc) {
                return tc.items.map(function(it) { return it.str; }).join(' ');
              });
            })
          );
        }
        return Promise.all(pagePromises).then(function(texts) {
          var raw = texts.join('\n').trim();
          if (raw.length < 20) {
            return '[PDF uploaded — scanned document. Please ask the veteran to confirm the key details.]';
          }
          return raw;
        });
      });
    });
  }

  /* ── Image OCR extraction ─────────────────────────────── */
  function _extractImage(file) {
    if (file.size > MAX_IMAGE_BYTES) {
      return Promise.resolve('[Image too large for OCR (>10 MB). Please ask the veteran about its contents.]');
    }
    return _loadScript(TESSERACT_URL).then(function() {
      _ocrReady = true;
      if (!window.Tesseract) throw new Error('Tesseract did not initialise');
      return window.Tesseract.recognize(file, 'eng', { logger: function() {} });
    }).then(function(result) {
      var text = (result && result.data && result.data.text) ? result.data.text.trim() : '';
      if (text.length < 15) {
        return '[Image uploaded — text could not be extracted. Please ask the veteran about its contents.]';
      }
      return text;
    });
  }

  /* ── Shared normalizer ────────────────────────────────── */
  function _normalize(rawText) {
    var typeId = null;
    var fields = {};
    if (window.AIOS && window.AIOS.Skills && window.AIOS.Skills['document-analyzer']) {
      var da = window.AIOS.Skills['document-analyzer'];
      typeId = da.detectType(rawText);
      fields = da.extractDocumentFields(typeId, rawText);
    }
    return { rawText: rawText, typeId: typeId, fields: fields };
  }

  /* ── Public API ───────────────────────────────────────── */
  var DocumentIntelligence = {};

  DocumentIntelligence.extractText = function(file) {
    if (!file) return Promise.resolve('');
    if (file.type === 'application/pdf') {
      return _extractPDF(file).catch(function(err) {
        console.warn('[DocIntel] PDF extraction failed:', err);
        return '[PDF uploaded. Please ask the veteran to confirm the key details from their document.]';
      });
    }
    if (file.type && file.type.startsWith('image/')) {
      return _extractImage(file).catch(function(err) {
        console.warn('[DocIntel] OCR failed:', err);
        return '[Image uploaded. Please ask the veteran about the contents of this document.]';
      });
    }
    // Unsupported type
    return Promise.resolve('[' + (file.type || 'unknown') + ' file uploaded. Please ask the veteran about its contents.]');
  };

  DocumentIntelligence.extractAndNormalize = function(file) {
    return DocumentIntelligence.extractText(file).then(function(rawText) {
      return _normalize(rawText);
    });
  };

  DocumentIntelligence.status = function() {
    return { pdfReady: _pdfReady, ocrReady: _ocrReady };
  };

  window.AIOS.DocumentIntelligence = DocumentIntelligence;

})();
