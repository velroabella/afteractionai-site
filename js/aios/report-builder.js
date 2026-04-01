/* ══════════════════════════════════════════════════════════
   AfterAction AI — AIOS Report Builder
   PHASE 3.6 — Structured DOCX Export

   Replaces regex-based PDF report parsing with structured
   DOCX export assembled from Phase 2 case data (missions,
   checklist items, documents) plus the AI report content.

   Falls back gracefully to existing jsPDF flow when
   DataAccess is unavailable or case data is incomplete.

   Public API (window.AIOS.ReportBuilder):
     generate(caseId, reportText) → Promise<void>
     isAvailable()               → boolean

   Registers: window.AIOS.ReportBuilder
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  if (!window.AIOS) window.AIOS = {};

  /* ── docx library reference ─────────────────────────── */
  function _D() {
    if (window.docx) return window.docx;
    throw new Error('[ReportBuilder] docx library not loaded');
  }

  /* ── Colour palette ──────────────────────────────────── */
  var NAVY   = '1A365D';
  var GOLD   = 'B8860B';
  var GRAY   = '666666';
  var LTGRAY = 'CCCCCC';
  var BLACK  = '1A1A1A';

  /* ── Low-level helpers ───────────────────────────────── */
  function _run(text, opts) {
    var D = _D();
    return new D.TextRun(Object.assign({ text: text || '', font: 'Arial', size: 22 }, opts || {}));
  }

  function _p(children, opts) {
    var D = _D();
    return new D.Paragraph(Object.assign({ children: children || [] }, opts || {}));
  }

  function _spacer() {
    return _p([], { spacing: { after: 160 } });
  }

  function _h1(text) {
    var D = _D();
    return _p([_run(text, { bold: true, size: 32, color: NAVY })], {
      spacing: { before: 280, after: 120 },
      border: { bottom: { style: D.BorderStyle.SINGLE, size: 8, color: NAVY, space: 6 } }
    });
  }

  function _h2(text) {
    return _p([_run(text, { bold: true, size: 26, color: NAVY })], {
      spacing: { before: 180, after: 80 }
    });
  }

  function _body(text) {
    return _p([_run(text || '', { size: 22, color: BLACK })], {
      spacing: { after: 80 }
    });
  }

  function _kv(label, value) {
    return _p([
      _run(label + ': ', { bold: true, size: 22, color: NAVY }),
      _run(value || '\u2014', { size: 22, color: BLACK })
    ], { spacing: { after: 60 } });
  }

  function _bullet(text) {
    return _p([_run('\u2022  ' + (text || ''), { size: 22, color: BLACK })], {
      indent: { left: 360 },
      spacing: { after: 60 }
    });
  }

  function _pageBreak() {
    var D = _D();
    return _p([new D.PageBreak()]);
  }

  function _badge(status) {
    var map = {
      not_started:     'Not Started',
      in_progress:     'In Progress',
      completed:       'Completed',
      skipped:         'Skipped',
      active:          'Active',
      uploaded:        'Uploaded',
      processed:       'Processed',
      reviewed:        'Reviewed',
      action_required: 'Action Required',
      complete:        'Complete',
      pending:         'Pending'
    };
    return (status && map[status]) ? map[status] : (status || '\u2014');
  }

  /* ── Header / Footer ─────────────────────────────────── */
  function _buildHeader() {
    var D = _D();
    return new D.Header({
      children: [
        _p([_run('AfterAction AI \u2014 Veteran Benefits Report',
            { bold: true, size: 18, color: NAVY })], {
          alignment: D.AlignmentType.CENTER,
          spacing: { after: 40 },
          border: { bottom: { style: D.BorderStyle.SINGLE, size: 4, color: NAVY, space: 4 } }
        })
      ]
    });
  }

  function _buildFooter() {
    var D = _D();
    var now = new Date().toLocaleDateString('en-US',
      { year: 'numeric', month: 'long', day: 'numeric' });
    return new D.Footer({
      children: [
        _p([_run('AfterAction AI \u2014 afteractionai.org \u2014 Generated: ' + now,
            { italics: true, size: 16, color: GRAY })], {
          alignment: D.AlignmentType.CENTER,
          border: { top: { style: D.BorderStyle.SINGLE, size: 4, color: LTGRAY, space: 4 } }
        })
      ]
    });
  }

  /* ── Section: Cover ──────────────────────────────────── */
  function _buildCover(caseRow) {
    var D     = _D();
    var title = (caseRow && caseRow.title) ? caseRow.title : 'Veteran Benefits Report';
    var now   = new Date().toLocaleDateString('en-US',
      { year: 'numeric', month: 'long', day: 'numeric' });
    var vetName = '';
    try {
      if (window.AIOS && window.AIOS.Memory &&
          typeof window.AIOS.Memory.getProfile === 'function') {
        vetName = window.AIOS.Memory.getProfile().name || '';
      }
    } catch (e) {}

    var rows = [
      _spacer(), _spacer(), _spacer(),
      _p([_run('AfterAction AI', { bold: true, size: 56, color: NAVY })],
         { alignment: D.AlignmentType.CENTER, spacing: { after: 60 } }),
      _p([_run('Veteran Benefits Report', { size: 30, color: GOLD, italics: true })],
         { alignment: D.AlignmentType.CENTER, spacing: { after: 160 } }),
      _p([_run(title, { bold: true, size: 26, color: BLACK })],
         { alignment: D.AlignmentType.CENTER, spacing: { after: 60 } })
    ];

    if (vetName) {
      rows.push(_p([_run(vetName, { size: 24, color: GRAY })],
        { alignment: D.AlignmentType.CENTER, spacing: { after: 60 } }));
    }

    rows.push(
      _p([_run('Generated: ' + now, { size: 20, color: GRAY, italics: true })],
         { alignment: D.AlignmentType.CENTER, spacing: { after: 240 } }),
      _spacer(), _spacer(),
      _p([_run(
        'This report is for informational purposes only and does not constitute legal advice.',
        { size: 18, color: GRAY, italics: true })],
        { alignment: D.AlignmentType.CENTER })
    );

    return rows;
  }

  /* ── Section: Profile ────────────────────────────────── */
  function _buildProfile() {
    var rows = [_h1('Veteran Profile')];
    var mem  = {};
    try {
      if (window.AIOS && window.AIOS.Memory &&
          typeof window.AIOS.Memory.getProfile === 'function') {
        mem = window.AIOS.Memory.getProfile() || {};
      }
    } catch (e) {}

    var fields = [
      ['Name',              mem.name],
      ['Branch of Service', mem.branch],
      ['Service Era',       mem.era],
      ['Discharge Status',  mem.discharge || mem.dischargeStatus],
      ['VA Rating',         (mem.vaRating !== undefined && mem.vaRating !== null)
                              ? mem.vaRating + '%' : null],
      ['State',             mem.state],
      ['Employment',        mem.employment]
    ];

    var any = false;
    fields.forEach(function (f) {
      if (f[1]) { rows.push(_kv(f[0], f[1])); any = true; }
    });
    if (!any) rows.push(_body('No profile data recorded for this session.'));

    rows.push(_spacer());
    return rows;
  }

  /* ── Section: Missions + Checklists ──────────────────── */
  function _buildMissions(missions) {
    var rows = [_h1('Active Missions')];

    if (!missions || missions.length === 0) {
      rows.push(_body('No missions recorded for this case.'));
      rows.push(_spacer());
      return rows;
    }

    missions.forEach(function (m, idx) {
      rows.push(_h2((idx + 1) + '. ' + (m.name || m.mission_type || 'Untitled Mission')));
      rows.push(_kv('Status', _badge(m.status)));
      if (m.current_step) rows.push(_kv('Current Step', m.current_step));
      if (m.next_step)    rows.push(_kv('Next Step',    m.next_step));

      var items = m._checklistItems || [];
      if (items.length > 0) {
        rows.push(_p([_run('Checklist Items:', { bold: true, size: 22, color: NAVY })],
          { spacing: { before: 80, after: 40 } }));
        items.forEach(function (item) {
          var sl = _badge(item.status || (item.is_completed ? 'completed' : 'not_started'));
          rows.push(_bullet(item.title + '  [' + sl + ']'));
        });
      }

      rows.push(_spacer());
    });

    return rows;
  }

  /* ── Section: Documents ──────────────────────────────── */
  function _buildDocuments(docs) {
    var rows = [_h1('Uploaded Documents')];

    if (!docs || docs.length === 0) {
      rows.push(_body('No documents uploaded for this case.'));
      rows.push(_spacer());
      return rows;
    }

    docs.forEach(function (doc) {
      var name    = doc.file_name     || 'Unknown file';
      var type    = doc.document_type || null;
      var status  = _badge(doc.status);
      var created = doc.created_at
        ? new Date(doc.created_at).toLocaleDateString('en-US',
            { year: 'numeric', month: 'short', day: 'numeric' })
        : null;

      rows.push(_p([_run(name, { bold: true, size: 22, color: BLACK })],
        { spacing: { before: 80, after: 40 } }));
      if (type)    rows.push(_kv('  Type',     type));
      rows.push(   _kv('  Status',   status));
      if (created) rows.push(_kv('  Uploaded', created));
    });

    rows.push(_spacer());
    return rows;
  }

  /* ── Section: Report Findings ────────────────────────── */
  function _buildFindings(reportText) {
    var rows = [_h1('Report Findings')];

    if (!reportText) {
      rows.push(_body('No report content available.'));
      rows.push(_spacer());
      return rows;
    }

    // Strip markdown artifacts
    var clean = reportText
      .replace(/\[OPTIONS:[^\]]*\]/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\[(.*?)\]\(https?:\/\/[^)]*\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim();

    // Split on markdown headings or numbered section starts
    var parts = clean.split(/\n(?=#{1,3}\s|\d+\.\s*[A-Z])/);

    parts.forEach(function (chunk) {
      chunk = chunk.trim();
      if (!chunk) return;

      var firstNl = chunk.indexOf('\n');
      if (firstNl > 0 && firstNl < 120) {
        var rawHead = chunk.substring(0, firstNl)
          .replace(/^#{1,3}\s*/, '')
          .replace(/^\d+\.\s*/, '')
          .trim();
        var body = chunk.substring(firstNl + 1).trim();
        if (rawHead) rows.push(_h2(rawHead));
        body.split(/\n{2,}/).forEach(function (para) {
          para = para.replace(/\n/g, ' ').trim();
          if (para) rows.push(_body(para));
        });
      } else {
        chunk.split(/\n{2,}/).forEach(function (para) {
          para = para.replace(/\n/g, ' ').trim();
          if (para) rows.push(_body(para));
        });
      }
    });

    rows.push(_spacer());
    return rows;
  }

  /* ── Data fetcher ────────────────────────────────────── */
  function _fetchData(caseId) {
    if (!caseId || !window.AAAI || !window.AAAI.DataAccess) {
      return Promise.resolve({ caseRow: null, missions: [], documents: [] });
    }
    var DA = window.AAAI.DataAccess;

    var pCase = (DA.cases && DA.cases.getFull)
      ? DA.cases.getFull(caseId).catch(function () { return { data: null }; })
      : Promise.resolve({ data: null });

    var pMissions = (DA.missions && DA.missions.list)
      ? DA.missions.list(caseId).catch(function () { return { data: [] }; })
      : Promise.resolve({ data: [] });

    var pDocs = (DA.documents && DA.documents.listByCase)
      ? DA.documents.listByCase(caseId).catch(function () { return { data: [] }; })
      : Promise.resolve({ data: [] });

    return Promise.all([pCase, pMissions, pDocs]).then(function (res) {
      var caseRow   = (res[0] && res[0].data) ? res[0].data : null;
      var missions  = (res[1] && res[1].data) ? res[1].data : [];
      var documents = (res[2] && res[2].data) ? res[2].data : [];

      // Fetch checklist items for each mission in parallel
      var clFetches = missions.map(function (m) {
        if (!m.id || !DA.checklistItems || !DA.checklistItems.listByMission) {
          return Promise.resolve([]);
        }
        return DA.checklistItems.listByMission(m.id)
          .then(function (r) { return (r && r.data) ? r.data : []; })
          .catch(function () { return []; });
      });

      return Promise.all(clFetches).then(function (clResults) {
        missions.forEach(function (m, i) { m._checklistItems = clResults[i] || []; });
        return { caseRow: caseRow, missions: missions, documents: documents };
      });
    });
  }

  /* ── Public API ──────────────────────────────────────── */
  var ReportBuilder = {};

  ReportBuilder.isAvailable = function () {
    return !!(window.docx && window.docx.Document && window.docx.Packer);
  };

  /**
   * Build and download a structured DOCX report.
   * @param {string} caseId     — active case UUID
   * @param {string} reportText — AI-generated report text (Findings section)
   * @returns {Promise<void>}
   */
  ReportBuilder.generate = function (caseId, reportText) {
    if (!ReportBuilder.isAvailable()) {
      return Promise.reject(new Error('[ReportBuilder] docx library not loaded.'));
    }
    var D = _D();

    return _fetchData(caseId).then(function (data) {
      var children = [];

      // 1. Cover page
      _buildCover(data.caseRow).forEach(function (p) { children.push(p); });
      children.push(_pageBreak());

      // 2. Veteran profile
      _buildProfile().forEach(function (p) { children.push(p); });

      // 3. Missions + checklist items
      _buildMissions(data.missions).forEach(function (p) { children.push(p); });

      // 4. Uploaded documents (only when present)
      if (data.documents.length > 0) {
        _buildDocuments(data.documents).forEach(function (p) { children.push(p); });
      }

      // 5. AI report findings (structured but not regex-dependent for layout)
      _buildFindings(reportText).forEach(function (p) { children.push(p); });

      var doc = new D.Document({
        styles: {
          default: { document: { run: { font: 'Arial', size: 22 } } }
        },
        sections: [{
          headers:    { default: _buildHeader() },
          footers:    { default: _buildFooter() },
          properties: {
            page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } }
          },
          children: children
        }]
      });

      return D.Packer.toBlob(doc).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a   = document.createElement('a');
        a.href     = url;
        a.download = 'AfterAction_AI_Report.docx';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      });
    });
  };

  window.AIOS.ReportBuilder = ReportBuilder;

})();
