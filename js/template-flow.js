// ══════════════════════════════════════════════════════════
// TEMPLATE FLOW ENGINE
// Guided intake → Document generation → Save/Download
// ══════════════════════════════════════════════════════════

(function() {
  'use strict';

  var container = document.getElementById('templateFlow');
  var templateData = null;
  var uploadedFileText = '';

  // ── US States list for state_select fields ─────────────
  var US_STATES = [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware',
    'Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky',
    'Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi',
    'Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico',
    'New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania',
    'Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
    'Virginia','Washington','West Virginia','Wisconsin','Wyoming','District of Columbia'
  ];

  // ── Utility ────────────────────────────────────────────
  function escapeHtml(str) {
    var el = document.createElement('span');
    el.textContent = str || '';
    return el.innerHTML;
  }

  function getParam(name) {
    var url = new URL(window.location.href);
    return url.searchParams.get(name);
  }

  function toggleMenu() {
    var menu = document.getElementById('navMenu');
    menu.classList.toggle('active');
  }
  window.toggleMenu = toggleMenu;

  // ── Load template data ─────────────────────────────────
  var templateId = getParam('id');
  if (!templateId) {
    container.innerHTML = '<div style="text-align:center;padding:60px;"><h2>No template selected</h2><p><a href="document-templates.html">Browse all templates</a></p></div>';
    return;
  }

  fetch('data/document-templates.json').then(function(res) {
    return res.json();
  }).then(function(templates) {
    templateData = templates.find(function(t) { return t.id === templateId; });
    if (!templateData) {
      container.innerHTML = '<div style="text-align:center;padding:60px;"><h2>Template not found</h2><p><a href="document-templates.html">Browse all templates</a></p></div>';
      return;
    }
    if (templateData.phase !== 1) {
      container.innerHTML = '<div style="text-align:center;padding:60px;"><h2>' + escapeHtml(templateData.title) + '</h2><p>This template is coming soon. <a href="document-templates.html">Browse available templates</a></p></div>';
      return;
    }
    document.title = templateData.title + ' — AfterAction AI';
    renderIntake();
  }).catch(function(err) {
    console.error('Template load error:', err);
    container.innerHTML = '<div style="text-align:center;padding:60px;color:var(--gray-500);">Error loading template. <a href="document-templates.html">Go back</a></div>';
  });

  // ── Render Intake Form ─────────────────────────────────
  function renderIntake() {
    var t = templateData;
    var html = '';

    // Header
    html += '<div class="tmpl-flow__header">';
    html += '<a href="document-templates.html" class="tmpl-flow__back">&larr; All Templates</a>';
    html += '<h1 class="tmpl-flow__title">' + escapeHtml(t.title) + '</h1>';
    html += '<p class="tmpl-flow__desc">' + escapeHtml(t.description) + '</p>';
    if (t.legal_disclaimer) {
      html += '<div class="tmpl-flow__disclaimer">' + escapeHtml(t.legal_disclaimer) + '</div>';
    }
    html += '</div>';

    // Upload section
    html += '<div class="tmpl-flow__upload">';
    html += '<div class="tmpl-flow__upload-area" id="uploadArea">';
    html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
    html += '<p><strong>Upload documents that may help</strong> (optional)</p>';
    html += '<p class="tmpl-flow__upload-hint">';
    if (t.upload_suggestions && t.upload_suggestions.length > 0) {
      html += 'Helpful uploads: ' + t.upload_suggestions.join(', ');
    } else {
      html += 'Upload any relevant document, or type everything below.';
    }
    html += '</p>';
    html += '<input type="file" id="tmplFileInput" multiple accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" style="display:none;" />';
    html += '<button type="button" class="tmpl-flow__upload-btn" id="uploadBtn">Choose Files</button>';
    html += '</div>';
    html += '<div id="uploadedFiles" class="tmpl-flow__uploaded-files"></div>';
    html += '</div>';

    // Intake form
    html += '<form class="tmpl-flow__form" id="intakeForm">';
    t.intake.forEach(function(field) {
      html += renderField(field);
    });
    html += '<button type="submit" class="tmpl-flow__submit">Generate Document</button>';
    html += '</form>';

    container.innerHTML = html;

    // Wire upload
    var fileInput = document.getElementById('tmplFileInput');
    var uploadBtn = document.getElementById('uploadBtn');
    var uploadArea = document.getElementById('uploadArea');
    if (uploadBtn) uploadBtn.addEventListener('click', function() { fileInput.click(); });
    if (uploadArea) uploadArea.addEventListener('click', function(e) {
      if (e.target !== uploadBtn && !uploadBtn.contains(e.target)) fileInput.click();
    });
    if (fileInput) fileInput.addEventListener('change', handleUpload);

    // Wire form submit
    document.getElementById('intakeForm').addEventListener('submit', function(e) {
      e.preventDefault();
      generateDocument();
    });
  }

  function renderField(field) {
    var req = field.required ? ' required' : '';
    var html = '<div class="tmpl-flow__field">';
    html += '<label for="field_' + field.id + '">' + escapeHtml(field.label) + (field.required ? ' *' : '') + '</label>';

    if (field.type === 'text') {
      html += '<input type="text" id="field_' + field.id + '" name="' + field.id + '"' + req + ' />';
    } else if (field.type === 'textarea') {
      html += '<textarea id="field_' + field.id + '" name="' + field.id + '" rows="3"' + req + '></textarea>';
    } else if (field.type === 'select') {
      html += '<select id="field_' + field.id + '" name="' + field.id + '"' + req + '>';
      html += '<option value="">Select...</option>';
      (field.options || []).forEach(function(opt) {
        html += '<option value="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</option>';
      });
      html += '</select>';
    } else if (field.type === 'state_select') {
      html += '<select id="field_' + field.id + '" name="' + field.id + '"' + req + '>';
      html += '<option value="">Select your state...</option>';
      US_STATES.forEach(function(s) {
        html += '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>';
      });
      html += '</select>';
    }

    html += '</div>';
    return html;
  }

  // ── File Upload Handler ────────────────────────────────
  function handleUpload(e) {
    var files = Array.from(e.target.files);
    if (!files.length) return;

    var uploadedDiv = document.getElementById('uploadedFiles');
    var names = files.map(function(f) { return f.name; });
    uploadedDiv.innerHTML = '<p class="tmpl-flow__uploaded-label">Uploaded: ' + names.join(', ') + '</p>';

    // Read text from text files
    var chain = Promise.resolve('');
    files.forEach(function(file) {
      chain = chain.then(function(prev) {
        if (file.type === 'text/plain') {
          return file.text().then(function(text) {
            return prev + '\n--- ' + file.name + ' ---\n' + text;
          });
        }
        return prev + '\n--- ' + file.name + ' (' + file.type + ') ---\n[Uploaded file — content available for reference]';
      });
    });

    chain.then(function(text) {
      uploadedFileText = text;
    });
  }

  // ── Document Generation ────────────────────────────────
  function generateDocument() {
    var form = document.getElementById('intakeForm');
    var formData = {};
    templateData.intake.forEach(function(field) {
      var el = form.elements[field.id];
      formData[field.id] = el ? el.value : '';
    });

    var output = buildOutput(templateData.id, formData);
    renderOutput(output, formData);
  }

  // ── Output Builders (per template type) ────────────────
  function buildOutput(templateId, data) {
    var generators = {
      'resume-builder': generateResume,
      'linkedin-profile-builder': generateLinkedIn,
      'general-power-of-attorney': generateGeneralPOA,
      'last-will-and-testament': generateWill,
      'living-will': generateLivingWill,
      'va-claim-personal-statement': generateVAClaim,
      'debt-hardship-letter': generateDebtLetter
    };

    var gen = generators[templateId];
    if (gen) return gen(data);
    return { title: 'Document', sections: [{ heading: 'Output', content: 'Template generator not yet implemented.' }] };
  }

  function generateResume(d) {
    return {
      title: 'Resume — ' + d.fullName,
      sections: [
        { heading: d.fullName, content: 'Target Role: ' + d.targetRole },
        { heading: 'Professional Summary', content: 'Results-driven professional with ' + d.yearsService + ' years of military service in the ' + d.branch + ' (' + d.mos + '). Proven track record of leadership, mission execution, and team development. Seeking to leverage military expertise in a civilian ' + d.targetRole + ' role.' },
        { heading: 'Core Competencies', content: d.keySkills },
        { heading: 'Military Experience', content: d.branch + ' — ' + d.mos + '\nYears of Service: ' + d.yearsService + '\nKey accomplishments and responsibilities aligned with ' + d.targetRole + ' requirements.' },
        { heading: 'Education & Certifications', content: d.education || 'Include your education details here.' },
        { heading: 'Next Steps', content: 'Tailor this resume for each specific job application. Use keywords from the job description. Consider having it reviewed by a career counselor at your local VA or American Job Center.' }
      ]
    };
  }

  function generateLinkedIn(d) {
    return {
      title: 'LinkedIn Profile — ' + d.fullName,
      sections: [
        { heading: 'Headline', content: d.targetIndustry + ' Professional | ' + d.branch + ' Veteran | ' + (d.personalBrand || 'Mission-Driven Leader') },
        { heading: 'About / Summary', content: 'With ' + d.mos + ' experience in the ' + d.branch + ', I bring a proven track record of ' + (d.personalBrand || 'leadership, problem-solving, and mission execution') + ' to the ' + d.targetIndustry + ' space.\n\n' + d.highlights + '\n\nI\'m passionate about translating military discipline and strategic thinking into civilian impact. Open to connecting with professionals in ' + d.targetIndustry + '.' },
        { heading: 'Experience Section', content: d.branch + '\n' + d.mos + '\n\nKey highlights to include:\n' + d.highlights },
        { heading: 'Profile Tips', content: '• Use a professional headshot (not in uniform unless relevant)\n• Add your DD-214 verified military service badge\n• Connect with veterans in your target industry\n• Join veteran professional groups on LinkedIn\n• Engage with content in ' + d.targetIndustry + ' to build visibility' }
      ]
    };
  }

  function generateGeneralPOA(d) {
    return {
      title: 'General Power of Attorney',
      sections: [
        { heading: 'GENERAL POWER OF ATTORNEY', content: 'State of ' + d.state },
        { heading: 'Parties', content: 'Principal: ' + d.principalName + '\nAgent (Attorney-in-Fact): ' + d.agentName + '\nRelationship: ' + d.agentRelation },
        { heading: 'Grant of Authority', content: 'I, ' + d.principalName + ', a resident of the State of ' + d.state + ', hereby appoint ' + d.agentName + ' (' + d.agentRelation + ') as my attorney-in-fact to act on my behalf with the following powers:\n\n' + d.powers },
        { heading: 'Effective Date', content: 'This Power of Attorney shall become effective: ' + d.effective + '.' },
        { heading: 'Revocation', content: 'I reserve the right to revoke this Power of Attorney at any time by providing written notice to my agent.' },
        { heading: 'Signatures', content: 'Principal Signature: _______________________\nDate: _______________\n\nWitness 1: _______________________\nDate: _______________\n\nWitness 2: _______________________\nDate: _______________\n\nNotary Acknowledgment:\n(Notarization may be required in ' + d.state + ')' },
        { heading: 'IMPORTANT DISCLAIMER', content: 'This document was generated as a starting template. It is NOT legal advice. State laws regarding Powers of Attorney vary significantly. Have this document reviewed by a licensed attorney in ' + d.state + ' before signing. Free legal help for veterans: contact your local VA or a veterans legal aid organization.' }
      ]
    };
  }

  function generateWill(d) {
    return {
      title: 'Last Will and Testament of ' + d.fullName,
      sections: [
        { heading: 'LAST WILL AND TESTAMENT', content: 'State of ' + d.state },
        { heading: 'Declaration', content: 'I, ' + d.fullName + ', a resident of the State of ' + d.state + ', being of sound mind and not acting under duress or undue influence, declare this to be my Last Will and Testament. I revoke all previous wills and codicils.' },
        { heading: 'Marital Status', content: 'Marital status: ' + d.maritalStatus },
        { heading: 'Children', content: d.children || 'No children listed.' },
        { heading: 'Executor', content: 'I appoint ' + d.executor + ' as the Executor of this Will. If they are unable or unwilling to serve, I direct that the court appoint a suitable replacement.' },
        { heading: 'Distribution of Assets', content: d.beneficiaries },
        { heading: 'Guardianship', content: d.guardian ? 'If I have minor children at the time of my death, I appoint ' + d.guardian + ' as their legal guardian.' : 'No guardian designation required.' },
        { heading: 'Signatures', content: 'Testator Signature: _______________________\nDate: _______________\n\nWitness 1 (printed name): _______________________\nWitness 1 Signature: _______________________\nDate: _______________\n\nWitness 2 (printed name): _______________________\nWitness 2 Signature: _______________________\nDate: _______________' },
        { heading: 'IMPORTANT DISCLAIMER', content: 'This document was generated as a starting template. It is NOT legal advice. State laws regarding wills vary. Most states require 2 witnesses; some require notarization. Have this reviewed by a licensed attorney in ' + d.state + '. Free legal help for veterans is available through VA and veterans legal aid organizations.' }
      ]
    };
  }

  function generateLivingWill(d) {
    return {
      title: 'Living Will (Advance Directive) — ' + d.fullName,
      sections: [
        { heading: 'LIVING WILL / ADVANCE DIRECTIVE', content: 'State of ' + d.state },
        { heading: 'Declaration', content: 'I, ' + d.fullName + ', a resident of the State of ' + d.state + ', being of sound mind, make this declaration to inform my healthcare providers and loved ones of my wishes regarding life-sustaining treatment.' },
        { heading: 'Life-Sustaining Treatment', content: 'If I am terminally ill or permanently unconscious:\n\n' + d.lifeSustaining },
        { heading: 'Artificial Nutrition and Hydration', content: 'Regarding artificial nutrition and hydration (feeding tubes, IV fluids):\n\n' + d.nutrition },
        { heading: 'Pain Management', content: 'My preference for pain management:\n\n' + d.painManagement },
        { heading: 'Additional Wishes', content: d.otherWishes || 'No additional wishes specified.' },
        { heading: 'Signatures', content: 'Declarant Signature: _______________________\nDate: _______________\n\nWitness 1: _______________________\nDate: _______________\n\nWitness 2: _______________________\nDate: _______________' },
        { heading: 'IMPORTANT DISCLAIMER', content: 'This document was generated as a starting template. Requirements for advance directives vary by state. Have this reviewed by a licensed attorney or healthcare provider in ' + d.state + '.' }
      ]
    };
  }

  function generateVAClaim(d) {
    return {
      title: 'VA Claim Personal Statement — ' + d.fullName,
      sections: [
        { heading: 'PERSONAL STATEMENT IN SUPPORT OF CLAIM', content: 'VA Form 21-4138 (Statement in Support of Claim)' },
        { heading: 'Veteran Information', content: 'Name: ' + d.fullName + '\nBranch: ' + d.branch },
        { heading: 'Condition(s) Claimed', content: d.condition },
        { heading: 'In-Service Event, Injury, or Exposure', content: 'During my service in the ' + d.branch + ', I experienced the following:\n\n' + d.inServiceEvent },
        { heading: 'Current Impact on Daily Life', content: 'This condition currently affects my daily life and ability to work in the following ways:\n\n' + d.currentImpact },
        { heading: 'Treatment History', content: d.treatment || 'Treatment details to be provided with supporting medical records.' },
        { heading: 'Supporting Evidence', content: 'I am submitting the following supporting documents with this statement:\n• Service treatment records (if available)\n• Current medical records\n• Buddy statements (if available)\n• Any additional evidence supporting the connection between my service and this condition' },
        { heading: 'Certification', content: 'I certify that the statements made herein are true and correct to the best of my knowledge and belief.\n\nSignature: _______________________\nDate: _______________' },
        { heading: 'Next Steps', content: '1. Submit this statement with VA Form 21-526EZ\n2. Include all supporting medical evidence\n3. Consider requesting a C&P exam if not already scheduled\n4. If denied, you can appeal — consider using the AfterAction AI VA Appeal Letter template' }
      ]
    };
  }

  function generateDebtLetter(d) {
    var dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return {
      title: 'Debt Hardship Letter',
      sections: [
        { heading: '', content: dateStr + '\n\n' + d.creditorName + (d.accountNumber ? '\nAccount: ' + d.accountNumber : '') },
        { heading: 'RE: Request for Hardship Consideration', content: 'Dear ' + d.creditorName + ' Hardship Department,\n\nI am writing to request hardship consideration regarding my account' + (d.accountNumber ? ' (' + d.accountNumber + ')' : '') + ' with an approximate balance of ' + d.amountOwed + '.' },
        { heading: 'Hardship Explanation', content: d.hardshipReason },
        { heading: 'Veteran Status', content: d.veteranStatus.indexOf('Yes') === 0 ? 'I am a United States military ' + d.veteranStatus.replace('Yes — ', '') + '. Many creditors have specific hardship programs for military members and veterans under the Servicemembers Civil Relief Act (SCRA) and similar protections. I respectfully ask that any available military/veteran programs be applied to my account.' : '' },
        { heading: 'Relief Requested', content: 'I am requesting: ' + d.requestedRelief + '\n\nI am committed to resolving this obligation and am acting in good faith by reaching out proactively.' },
        { heading: 'Closing', content: 'Thank you for your consideration. I can be reached at the contact information below to discuss available options.\n\nSincerely,\n\n' + d.fullName + '\n[Your phone number]\n[Your email]\n[Your mailing address]' },
        { heading: 'Next Steps', content: '1. Send this letter via certified mail (return receipt requested)\n2. Keep a copy for your records\n3. Follow up in 14 business days if no response\n4. If you are a veteran, contact your local VA financial counselor for additional support\n5. Consider using the AfterAction AI Credit Dispute Letter or Budget Recovery Plan templates' }
      ]
    };
  }

  // ── Render Output ──────────────────────────────────────
  function renderOutput(output, formData) {
    var html = '';

    html += '<div class="tmpl-flow__header">';
    html += '<a href="document-templates.html" class="tmpl-flow__back">&larr; All Templates</a>';
    html += '<h1 class="tmpl-flow__title">' + escapeHtml(output.title) + '</h1>';
    html += '</div>';

    // Output document
    html += '<div class="tmpl-output" id="outputContent">';
    output.sections.forEach(function(sec) {
      if (sec.heading) {
        html += '<h2 class="tmpl-output__heading">' + escapeHtml(sec.heading) + '</h2>';
      }
      var lines = (sec.content || '').split('\n');
      lines.forEach(function(line) {
        html += '<p class="tmpl-output__text">' + escapeHtml(line) + '</p>';
      });
    });
    html += '</div>';

    // Actions
    html += '<div class="tmpl-flow__actions">';
    html += '<button class="tmpl-flow__action-btn" id="btnDownloadPDF">Download PDF</button>';
    html += '<button class="tmpl-flow__action-btn tmpl-flow__action-btn--outline" id="btnCopyText">Copy to Clipboard</button>';
    html += '<button class="tmpl-flow__action-btn tmpl-flow__action-btn--outline" id="btnSaveAccount">Save to Account</button>';
    html += '<button class="tmpl-flow__action-btn tmpl-flow__action-btn--outline" id="btnEditIntake">Edit &amp; Regenerate</button>';
    html += '</div>';

    // Suggested next
    if (templateData.suggested_next && templateData.suggested_next.length > 0) {
      html += '<div class="tmpl-flow__next">';
      html += '<h3>What to do next</h3>';
      html += '<div class="tmpl-flow__next-links" id="nextLinks"></div>';
      html += '</div>';
    }

    container.innerHTML = html;

    // Wire actions
    document.getElementById('btnDownloadPDF').addEventListener('click', function() {
      downloadPDF(output);
    });

    document.getElementById('btnCopyText').addEventListener('click', function() {
      var text = output.sections.map(function(s) {
        return (s.heading ? s.heading + '\n' + '='.repeat(s.heading.length) + '\n' : '') + s.content;
      }).join('\n\n');
      navigator.clipboard.writeText(text).then(function() {
        document.getElementById('btnCopyText').textContent = 'Copied!';
        setTimeout(function() { document.getElementById('btnCopyText').textContent = 'Copy to Clipboard'; }, 2000);
      });
    });

    document.getElementById('btnSaveAccount').addEventListener('click', function() {
      saveToAccount(output);
    });

    document.getElementById('btnEditIntake').addEventListener('click', function() {
      renderIntake();
      window.scrollTo(0, 0);
    });

    // Load suggested next templates
    if (templateData.suggested_next && templateData.suggested_next.length > 0) {
      fetch('data/document-templates.json').then(function(r) { return r.json(); }).then(function(all) {
        var linksDiv = document.getElementById('nextLinks');
        if (!linksDiv) return;
        var nextHtml = '';
        templateData.suggested_next.forEach(function(nextId) {
          var next = all.find(function(t) { return t.id === nextId; });
          if (next) {
            var href = next.phase === 1 ? 'template-flow.html?id=' + next.id : '#';
            var cls = next.phase === 1 ? 'tmpl-flow__next-link' : 'tmpl-flow__next-link tmpl-flow__next-link--disabled';
            nextHtml += '<a href="' + href + '" class="' + cls + '">' + escapeHtml(next.title) + (next.phase !== 1 ? ' (Coming Soon)' : '') + '</a>';
          }
        });
        linksDiv.innerHTML = nextHtml;
      });
    }

    window.scrollTo(0, 0);
  }

  // ── PDF Download ───────────────────────────────────────
  function downloadPDF(output) {
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      alert('PDF library not loaded. Please try again.');
      return;
    }

    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4' });
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var mL = 20, mR = 20, mTop = 25, mBot = 20;
    var usableW = pageW - mL - mR;
    var y = mTop;

    // Header bar
    doc.setFillColor(26, 54, 93);
    doc.rect(0, 0, pageW, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text('AfterAction AI — ' + (templateData.title || 'Document Template'), pageW / 2, 12, { align: 'center' });

    y = 28;

    // Date
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('Generated: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), pageW - mR, y, { align: 'right' });
    y += 10;

    // Sections
    output.sections.forEach(function(sec) {
      if (sec.heading) {
        if (y > pageH - mBot - 20) { doc.addPage(); y = mTop; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(26, 54, 93);
        doc.text(sec.heading, mL, y);
        y += 7;
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);

      var lines = doc.splitTextToSize(sec.content || '', usableW);
      lines.forEach(function(line) {
        if (y > pageH - mBot) { doc.addPage(); y = mTop; }
        doc.text(line, mL, y);
        y += 5;
      });
      y += 4;
    });

    // Footer on every page
    var totalPages = doc.internal.getNumberOfPages();
    for (var p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('AfterAction AI — afteractionai.org', mL, pageH - 8);
      doc.text('Page ' + p + ' of ' + totalPages, pageW - mR, pageH - 8, { align: 'right' });
    }

    var filename = (templateData.id || 'document') + '_' + new Date().toISOString().split('T')[0] + '.pdf';
    doc.save(filename);
  }

  // ── Save to Account ────────────────────────────────────
  function saveToAccount(output) {
    var btn = document.getElementById('btnSaveAccount');

    if (typeof AAAI === 'undefined' || !AAAI.auth || !AAAI.auth.isLoggedIn || !AAAI.auth.isLoggedIn()) {
      btn.textContent = 'Sign in to save';
      setTimeout(function() { btn.textContent = 'Save to Account'; }, 2000);
      if (AAAI && AAAI.auth && AAAI.auth.openAuthModal) {
        AAAI.auth.openAuthModal('login');
      }
      return;
    }

    var content = output.sections.map(function(s) {
      return (s.heading ? '## ' + s.heading + '\n' : '') + s.content;
    }).join('\n\n');

    AAAI.auth.saveTemplateOutput({
      template_type: templateData.id,
      title: output.title,
      content: content,
      metadata: { category: templateData.category, generated_at: new Date().toISOString() }
    }).then(function(result) {
      if (result && !result.error) {
        btn.textContent = 'Saved!';
        setTimeout(function() { btn.textContent = 'Save to Account'; }, 2000);
      } else {
        btn.textContent = 'Save failed';
        setTimeout(function() { btn.textContent = 'Save to Account'; }, 2000);
      }
    }).catch(function() {
      btn.textContent = 'Save failed';
      setTimeout(function() { btn.textContent = 'Save to Account'; }, 2000);
    });
  }

})();
