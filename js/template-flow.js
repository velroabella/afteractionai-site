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
    if (templateData.phase > 3) {
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
      html += '<div class="tmpl-disclaimer">';
      html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      html += '<span>' + escapeHtml(t.legal_disclaimer) + '</span>';
      html += '</div>';
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
      'debt-hardship-letter': generateDebtLetter,
      'durable-power-of-attorney': generateDurablePOA,
      'medical-power-of-attorney': generateMedicalPOA,
      'hipaa-authorization-form': generateHIPAA,
      'emergency-contact-family-care-plan': generateFamilyCarePlan,
      'va-appeal-letter': generateVAAppeal,
      'records-request-letter': generateRecordsRequest,
      'federal-resume': generateFederalResume,
      'interview-prep-script': generateInterviewPrep,
      'credit-dispute-letter': generateCreditDispute,
      'budget-financial-recovery-plan': generateBudgetPlan,
      'nexus-letter-prep': generateNexusLetterPrep,
      'benefits-eligibility-summary': generateBenefitsEligibility,
      'military-civilian-skills-translator': generateSkillsTranslator,
      'salary-negotiation-script': generateSalaryNegotiation,
      'va-loan-readiness-checklist': generateVALoanChecklist,
      'rental-application-packet': generateRentalPacket,
      'personal-emergency-action-plan': generateEmergencyPlan
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

  // ── Phase 2 Generators ────────────────────────────────

  function generateDurablePOA(d) {
    return {
      title: 'Durable Power of Attorney',
      sections: [
        { heading: 'DURABLE POWER OF ATTORNEY', content: 'State of ' + d.state },
        { heading: 'Parties', content: 'Principal: ' + d.principalName + '\nAgent (Attorney-in-Fact): ' + d.agentName + '\nRelationship: ' + d.agentRelation + (d.successorAgent ? '\nSuccessor Agent: ' + d.successorAgent : '') },
        { heading: 'Durability Clause', content: 'This Power of Attorney shall NOT be affected by my subsequent disability or incapacity. This Power of Attorney shall remain in full force and effect even if I become disabled, incapacitated, or incompetent after the date of execution.' },
        { heading: 'Grant of Authority', content: 'I, ' + d.principalName + ', a resident of the State of ' + d.state + ', hereby appoint ' + d.agentName + ' (' + d.agentRelation + ') as my attorney-in-fact with the following powers:\n\n' + d.powers },
        { heading: 'Limitations', content: d.limitations || 'No specific limitations placed on the agent\'s authority beyond those required by state law.' },
        { heading: 'Successor Agent', content: d.successorAgent ? 'If ' + d.agentName + ' is unable or unwilling to serve, I appoint ' + d.successorAgent + ' as my successor agent with the same powers.' : 'No successor agent designated.' },
        { heading: 'Revocation', content: 'I reserve the right to revoke this Durable Power of Attorney at any time by providing written notice to my agent and any third parties who have relied upon it.' },
        { heading: 'Signatures', content: 'Principal Signature: _______________________\nDate: _______________\n\nWitness 1: _______________________\nDate: _______________\n\nWitness 2: _______________________\nDate: _______________\n\nNotary Acknowledgment:\n(Notarization is typically required for Durable Powers of Attorney in ' + d.state + ')' },
        { heading: 'IMPORTANT DISCLAIMER', content: 'This document was generated as a starting template. A Durable Power of Attorney is a significant legal document. State laws vary significantly. Have this reviewed by a licensed attorney in ' + d.state + ' before signing. Free legal help for veterans is available through VA and veterans legal aid organizations.' }
      ]
    };
  }

  function generateMedicalPOA(d) {
    return {
      title: 'Medical Power of Attorney — ' + d.principalName,
      sections: [
        { heading: 'MEDICAL POWER OF ATTORNEY', content: 'State of ' + d.state },
        { heading: 'Designation of Healthcare Agent', content: 'I, ' + d.principalName + ', a resident of the State of ' + d.state + ', hereby designate the following person as my agent to make healthcare decisions on my behalf:\n\nHealthcare Agent: ' + d.agentName + '\nRelationship: ' + d.agentRelation + '\nPhone: ' + d.agentPhone },
        { heading: 'Alternate Agent', content: d.alternateAgent ? 'If my primary agent is unable or unwilling to serve, I designate: ' + d.alternateAgent : 'No alternate agent designated.' },
        { heading: 'Authority Granted', content: 'My agent shall have authority to:\n\n• Consent to or refuse any medical treatment, procedure, or service\n• Access my medical records and health information\n• Choose healthcare providers and facilities\n• Make decisions about life-sustaining treatment\n' + (d.mentalHealth === 'Yes' ? '• Make decisions regarding mental health treatment' : d.mentalHealth === 'Only in specific circumstances' ? '• Make decisions regarding mental health treatment only in specific circumstances' : '• My agent does NOT have authority over mental health treatment decisions') },
        { heading: 'Special Instructions', content: d.specialInstructions || 'No specific medical instructions provided. My agent should make decisions consistent with my known values and wishes.' },
        { heading: 'Activation', content: 'This Medical Power of Attorney becomes effective when my attending physician certifies in writing that I am unable to make healthcare decisions for myself.' },
        { heading: 'Signatures', content: 'Principal Signature: _______________________\nDate: _______________\n\nWitness 1 (not the agent): _______________________\nDate: _______________\n\nWitness 2: _______________________\nDate: _______________\n\nNotary Acknowledgment:\n(May be required in ' + d.state + ')' },
        { heading: 'IMPORTANT DISCLAIMER', content: 'This document was generated as a starting template. State laws regarding Medical Powers of Attorney vary. Have this reviewed by a licensed attorney or healthcare provider in ' + d.state + '. Provide copies to your agent, physician, and hospital.' }
      ]
    };
  }

  function generateHIPAA(d) {
    return {
      title: 'HIPAA Authorization — ' + d.patientName,
      sections: [
        { heading: 'AUTHORIZATION FOR RELEASE OF HEALTH INFORMATION', content: 'Pursuant to the Health Insurance Portability and Accountability Act of 1996 (HIPAA), 45 CFR Parts 160 and 164' },
        { heading: 'Patient Information', content: 'Patient Name: ' + d.patientName + '\nDate of Birth: ' + d.dob },
        { heading: 'Healthcare Provider / Facility', content: 'I authorize the following provider or facility to release my health information:\n\n' + d.providerName },
        { heading: 'Authorized Recipient', content: 'The following person or organization is authorized to receive my health information:\n\n' + d.authorizedPerson },
        { heading: 'Information to Be Released', content: 'Type of information authorized for release: ' + d.infoType + (d.notes ? '\n\nAdditional notes: ' + d.notes : '') },
        { heading: 'Purpose', content: 'Purpose of this authorization: ' + d.purpose },
        { heading: 'Expiration', content: 'This authorization expires: ' + d.expiration },
        { heading: 'Patient Rights', content: 'I understand that:\n• I may revoke this authorization in writing at any time\n• Revocation will not apply to information already released\n• I may refuse to sign this authorization and it will not affect my treatment\n• Information released may be re-disclosed by the recipient and may no longer be protected by HIPAA' },
        { heading: 'Signatures', content: 'Patient Signature: _______________________\nDate: _______________\n\nIf signed by personal representative:\nRepresentative Name: _______________________\nRelationship: _______________________\nSignature: _______________________' },
        { heading: 'Next Steps', content: '1. Sign and date this form\n2. Provide a copy to ' + d.providerName + '\n3. Keep a copy for your records\n4. If using for a VA claim, submit with your claim packet' }
      ]
    };
  }

  function generateFamilyCarePlan(d) {
    return {
      title: 'Emergency Contact & Family Care Plan — ' + d.fullName,
      sections: [
        { heading: 'EMERGENCY CONTACT & FAMILY CARE PLAN', content: 'Prepared by: ' + d.fullName + '\nDate: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) },
        { heading: 'Dependents', content: d.dependents },
        { heading: 'Emergency Contacts', content: 'PRIMARY: ' + d.primaryContact + '\nSECONDARY: ' + d.secondaryContact },
        { heading: 'Designated Caregiver', content: 'If I am unavailable, deployed, hospitalized, or incapacitated, the following person is designated to care for my dependents:\n\n' + d.caregiver },
        { heading: 'Medical Information', content: d.medicalInfo || 'No special medical information noted. Update this section with allergies, medications, doctor names, and insurance info.' },
        { heading: 'Financial Information', content: d.financialInfo || 'No financial information noted. Consider adding: bank name (no account numbers), insurance provider, location of important documents.' },
        { heading: 'Special Instructions', content: d.specialNeeds || 'No special instructions noted. Consider adding: school/daycare info, pet care needs, religious preferences, daily routines.' },
        { heading: 'Important Document Locations', content: 'Update this section with the location of:\n• Will and estate documents\n• Insurance policies\n• Military documents (DD-214, orders)\n• Birth certificates and Social Security cards\n• Vehicle titles and property deeds\n• Power of Attorney documents' },
        { heading: 'Review Schedule', content: 'This plan should be reviewed and updated:\n• Every 6 months\n• When family circumstances change\n• Before any deployment or extended absence\n• When changing designated caregivers' },
        { heading: 'Next Steps', content: '1. Share this plan with your designated caregiver and emergency contacts\n2. Keep copies in a secure but accessible location\n3. If active duty, submit a copy to your unit (DA Form 5305 or equivalent)\n4. Store a digital copy in a secure location\n5. Consider pairing with a Last Will, Living Will, and Power of Attorney' }
      ]
    };
  }

  function generateVAAppeal(d) {
    var dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var laneInfo = {
      'Supplemental Claim (new evidence)': 'I am filing a Supplemental Claim under 38 CFR § 3.2501 with new and relevant evidence not previously considered.',
      'Higher-Level Review (same evidence, different reviewer)': 'I am requesting a Higher-Level Review under 38 CFR § 3.2601, asking that a senior reviewer re-examine the existing evidence.',
      'Board of Veterans Appeals (judge review)': 'I am appealing to the Board of Veterans\' Appeals for a review by a Veterans Law Judge.',
      'Not sure yet': 'I intend to appeal this decision through the appropriate review lane. [Consult with a Veterans Service Organization to determine the best appeal pathway.]'
    };
    return {
      title: 'VA Appeal Letter — ' + d.fullName,
      sections: [
        { heading: '', content: dateStr + '\n\nDepartment of Veterans Affairs\nEvidence Intake Center\nP.O. Box 4444\nJanesville, WI 53547-4444' },
        { heading: 'RE: Appeal of Denied Claim', content: 'Veteran: ' + d.fullName + '\nBranch: ' + d.branch + (d.claimNumber ? '\nClaim/File Number: ' + d.claimNumber : '') + '\nOriginal Denial Date: ' + d.denialDate },
        { heading: 'Appeal Pathway', content: laneInfo[d.appealLane] || laneInfo['Not sure yet'] },
        { heading: 'Condition(s) Denied', content: d.deniedCondition },
        { heading: 'VA\'s Stated Reason for Denial', content: d.denialReason },
        { heading: 'Why the Denial Should Be Reconsidered', content: 'I respectfully disagree with the denial decision for the following reasons:\n\n' + d.newEvidence },
        { heading: 'Supporting Evidence Enclosed', content: 'I am submitting the following evidence in support of this appeal:\n• This letter of disagreement\n• [List any new medical records, buddy statements, nexus letters, or other evidence]\n• [Reference any specific evidence the VA may have overlooked]' },
        { heading: 'Closing', content: 'I respectfully request that the Department of Veterans Affairs reconsider this claim in light of the evidence provided. I have served my country faithfully and ask for fair consideration of my claim.\n\nSincerely,\n\n' + d.fullName + '\n[Your address]\n[Your phone number]\n[Your email]' },
        { heading: 'Next Steps', content: '1. Submit within 1 year of the denial date (' + d.denialDate + ')\n2. For Supplemental Claims: use VA Form 20-0995\n3. For Higher-Level Review: use VA Form 20-0996\n4. For Board Appeal: use VA Form 10182\n5. Contact a Veterans Service Organization (VSO) for free help\n6. Keep copies of everything you submit\n7. Consider using the AfterAction AI Nexus Letter Prep template' }
      ]
    };
  }

  function generateRecordsRequest(d) {
    var dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return {
      title: 'Records Request Letter — ' + d.fullName,
      sections: [
        { heading: '', content: dateStr + '\n\n' + d.recordsFrom },
        { heading: 'RE: Request for ' + d.recordType, content: 'Dear Records Custodian,\n\nI am writing to formally request copies of my records as described below.' },
        { heading: 'Veteran / Requestor Information', content: 'Name: ' + d.fullName + '\nBranch of Service: ' + d.branch + '\nDates of Service: ' + d.serviceDates + (d.ssn_last4 ? '\nLast 4 SSN: xxx-xx-' + d.ssn_last4 : '') },
        { heading: 'Records Requested', content: 'Type: ' + d.recordType + '\nFrom: ' + d.recordsFrom + '\n\nPurpose: ' + d.reason + (d.additionalDetails ? '\n\nAdditional Details: ' + d.additionalDetails : '') },
        { heading: 'Authorization', content: 'I authorize the release of the above-described records. I understand that I may be required to provide additional identification or complete agency-specific forms.\n\nSincerely,\n\n' + d.fullName + '\n[Your current address]\n[Your phone number]\n[Your email]' },
        { heading: 'Enclosures', content: 'Consider including:\n• Copy of government-issued photo ID\n• Copy of DD-214 (if available)\n• Signed SF-180 (for military records from NPRC)\n• Any prior correspondence regarding this request' },
        { heading: 'Key Contacts for Records', content: 'National Personnel Records Center (NPRC):\n1 Archives Drive, St. Louis, MO 63138\nOnline: vetrecs.archives.gov\n\nVA Records:\nCall 1-800-827-1000 or visit va.gov\n\nFor fastest service, submit SF-180 online at vetrecs.archives.gov' }
      ]
    };
  }

  function generateFederalResume(d) {
    return {
      title: 'Federal Resume — ' + d.fullName,
      sections: [
        { heading: d.fullName, content: d.address + '\nEmail: ' + d.email + '\nPhone: ' + d.phone + '\nCitizenship: ' + d.citizenship + '\nVeterans\' Preference: ' + d.vetPref + (d.clearance ? '\nSecurity Clearance: ' + d.clearance : '') + (d.targetJob ? '\n\nApplying for: ' + d.targetJob : '') },
        { heading: 'Military Experience', content: d.branch + ' — ' + d.mos + '\nRank: ' + d.rank + '\nDates: ' + d.serviceDates + '\nHours per week: ' + d.hoursPerWeek + '\n\nDuties and Accomplishments:\n' + d.duties },
        { heading: 'Education', content: d.education },
        { heading: 'Certifications, Licenses & Training', content: d.certs || 'List any certifications, licenses, and military training courses with dates.' },
        { heading: 'Federal Resume Formatting Tips', content: 'IMPORTANT — Federal resumes are NOT like civilian resumes:\n\n• Length: 3-5 pages is normal (not 1-2 pages)\n• Include hours per week for every position\n• Include exact dates (month/year) for all positions\n• Include supervisor name and phone for each position\n• Use keywords from the job announcement throughout\n• Quantify accomplishments with numbers, percentages, dollar amounts\n• Include ALL relevant training, even military courses\n• List your GPA if 3.0 or above\n• Describe duties in paragraph format, not just bullet points\n• Each duty description should clearly address the job\'s qualification requirements' },
        { heading: 'Veterans\' Preference Notes', content: d.vetPref.indexOf('5-point') >= 0 ? 'You claimed 5-point preference (TP). You will need to submit a DD-214 showing honorable discharge.' : d.vetPref.indexOf('10-point') >= 0 ? 'You claimed 10-point preference. You will need to submit SF-15, DD-214, and VA disability rating letter.' : 'Review your eligibility for veterans\' preference at fedshirevets.gov.' },
        { heading: 'Next Steps', content: '1. Create or update your USAJobs profile at usajobs.gov\n2. Upload this resume to your USAJobs account\n3. Tailor the resume for each specific job announcement\n4. Apply to positions where you meet the minimum qualifications\n5. Consider attending a federal resume workshop at your local VA or American Job Center' }
      ]
    };
  }

  function generateInterviewPrep(d) {
    return {
      title: 'Interview Prep Script — ' + d.fullName,
      sections: [
        { heading: 'INTERVIEW PREPARATION: ' + d.targetRole, content: 'Candidate: ' + d.fullName + '\nTarget Role: ' + d.targetRole + '\nBackground: ' + d.branch + ' — ' + d.mos },
        { heading: 'STAR Response #1: Leadership', content: 'SITUATION: Set the scene from your military experience.\n' + d.leadershipExample + '\n\nSTAR Framework:\n• Situation: [Opening context — where were you, what was happening?]\n• Task: [What was your specific responsibility or challenge?]\n• Action: [What exactly did YOU do? Use "I" not "we"]\n• Result: [What was the measurable outcome? Quantify if possible]\n\nCivilian Translation Tip: Replace military jargon. Instead of "I led a squad of 9 on a patrol," say "I managed a team of 9 professionals executing high-stakes field operations with zero safety incidents."' },
        { heading: 'STAR Response #2: Overcoming Challenges', content: 'SITUATION: Describe the challenge.\n' + d.challengeExample + '\n\nSTAR Framework:\n• Situation: [What was the challenge or problem?]\n• Task: [What needed to be accomplished despite the challenge?]\n• Action: [How did you adapt, problem-solve, or persevere?]\n• Result: [What was the outcome? What did you learn?]\n\nCivilian Translation Tip: Emphasize problem-solving, adaptability, and composure under pressure — these translate to any industry.' },
        { heading: 'STAR Response #3: Teamwork & Conflict', content: 'SITUATION: Describe the team dynamic.\n' + d.teamworkExample + '\n\nSTAR Framework:\n• Situation: [What was the team dynamic or conflict?]\n• Task: [What role did you play in resolving it?]\n• Action: [How did you communicate, mediate, or collaborate?]\n• Result: [How was the team or project improved?]\n\nCivilian Translation Tip: Show emotional intelligence and communication skills, not just authority.' },
        { heading: 'Additional Strengths to Highlight', content: d.additionalStrengths || 'Consider mentioning: security clearance, project management experience, training and mentoring, technical certifications, crisis management.' },
        { heading: 'Common Interview Questions to Prepare For', content: '• "Tell me about yourself." — Lead with your military background translated for this role.\n• "Why are you leaving the military / why this career?" — Focus on how your skills transfer.\n• "What is your biggest weakness?" — Pick something real but show how you\'re improving.\n• "Where do you see yourself in 5 years?" — Show ambition aligned with the company.\n• "Why should we hire you?" — Connect your military discipline, leadership, and specific skills to their needs.' },
        { heading: 'Interview Day Tips', content: '• Arrive 15 minutes early\n• Bring 3-5 printed copies of your resume\n• Dress one level above the company norm\n• Prepare 2-3 questions to ask them\n• Send a thank-you email within 24 hours\n• If virtual: test your camera/mic, use a clean background, make eye contact with the camera' }
      ]
    };
  }

  function generateCreditDispute(d) {
    var dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var bureauAddresses = {
      'Equifax': 'Equifax Information Services LLC\nP.O. Box 740256\nAtlanta, GA 30374-0256',
      'Experian': 'Experian\nP.O. Box 4500\nAllen, TX 75013',
      'TransUnion': 'TransUnion LLC\nConsumer Dispute Center\nP.O. Box 2000\nChester, PA 19016',
      'All three bureaus': 'Send separate copies to:\n\nEquifax: P.O. Box 740256, Atlanta, GA 30374-0256\nExperian: P.O. Box 4500, Allen, TX 75013\nTransUnion: P.O. Box 2000, Chester, PA 19016'
    };
    return {
      title: 'Credit Dispute Letter',
      sections: [
        { heading: '', content: d.fullName + '\n' + d.address + '\n\n' + dateStr + '\n\n' + (bureauAddresses[d.bureau] || d.bureau) },
        { heading: 'RE: Formal Dispute of Inaccurate Credit Information', content: 'Dear ' + d.bureau + ' Dispute Department,\n\nI am writing pursuant to the Fair Credit Reporting Act (FCRA), 15 U.S.C. § 1681, to dispute inaccurate information on my credit report.' },
        { heading: 'Disputed Account', content: 'Creditor/Account Name: ' + d.accountName + (d.accountNumber ? '\nAccount Number: ' + d.accountNumber : '') + '\nReason for Dispute: ' + d.disputeReason },
        { heading: 'Explanation', content: d.explanation },
        { heading: 'Veteran Status & SCRA Protections', content: d.veteranStatus.indexOf('Yes') === 0 ? 'I am a United States military ' + d.veteranStatus.replace('Yes — ', '') + '. I request that any applicable protections under the Servicemembers Civil Relief Act (SCRA) be applied. The SCRA provides specific credit protections for servicemembers and veterans that may affect how this account should be reported.' : '' },
        { heading: 'Request', content: 'Under the FCRA, you are required to investigate this dispute within 30 days, forward my dispute to the furnisher, and remove or correct the item if it cannot be verified.\n\nI request that you:\n1. Investigate this disputed item immediately\n2. Forward all relevant documentation to the furnisher\n3. Remove or correct the inaccurate information\n4. Send me written confirmation of the results\n5. Provide an updated copy of my credit report' },
        { heading: 'Enclosures', content: 'I am enclosing:\n• Copy of my government-issued ID\n• Copy of my credit report with the disputed item highlighted\n• [Any supporting documents proving the inaccuracy]\n' + (d.veteranStatus.indexOf('Yes') === 0 ? '• Copy of DD-214 or military orders (for SCRA protections)' : '') },
        { heading: 'Closing', content: 'Please investigate this matter promptly. I expect a written response within 30 days as required by law.\n\nSincerely,\n\n' + d.fullName },
        { heading: 'Next Steps', content: '1. Send via certified mail with return receipt requested\n2. Keep copies of everything\n3. If disputing with all three bureaus, send separate letters to each\n4. Follow up after 30 days if no response\n5. If the bureau does not correct the item, you can file a complaint with the Consumer Financial Protection Bureau (CFPB)\n6. Veterans can get free credit counseling through many VSOs' }
      ]
    };
  }

  function generateBudgetPlan(d) {
    var income = parseFloat(d.monthlyIncome.replace(/[^0-9.]/g, '')) || 0;
    var housing = parseFloat(d.housing.replace(/[^0-9.]/g, '')) || 0;
    var transport = parseFloat(d.transportation.replace(/[^0-9.]/g, '')) || 0;
    var food = parseFloat(d.food.replace(/[^0-9.]/g, '')) || 0;
    var essentials = housing + transport + food;
    var remaining = income - essentials;
    var housingPct = income > 0 ? Math.round((housing / income) * 100) : 0;

    return {
      title: 'Budget & Financial Recovery Plan — ' + d.fullName,
      sections: [
        { heading: 'MONTHLY FINANCIAL SNAPSHOT', content: 'Name: ' + d.fullName + '\nDate: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '\nPrimary Goal: ' + d.financialGoal },
        { heading: 'Income', content: 'Total Monthly Income: $' + income.toLocaleString() + '\n\nSources:\n' + d.incomeSources },
        { heading: 'Essential Expenses', content: 'Housing (rent/mortgage + utilities): $' + housing.toLocaleString() + ' (' + housingPct + '% of income)' + (housingPct > 30 ? ' ⚠ Above recommended 30%' : ' ✓ Within recommended range') + '\nTransportation: $' + transport.toLocaleString() + '\nFood/Groceries: $' + food.toLocaleString() + '\n\nTotal Essentials: $' + essentials.toLocaleString() + '\nRemaining after essentials: $' + remaining.toLocaleString() },
        { heading: 'Other Monthly Expenses', content: d.otherExpenses || 'Review and list all other recurring expenses: phone, insurance, subscriptions, childcare, etc.' },
        { heading: 'Debts', content: d.debts + '\n\nDebt Payoff Strategy:\n• List debts from smallest balance to largest (debt snowball) or highest interest to lowest (debt avalanche)\n• Pay minimums on all debts, then put extra toward your target debt\n• Once one debt is paid off, roll that payment into the next' },
        { heading: 'Recommended Budget (50/30/20 Rule)', content: 'Based on your $' + income.toLocaleString() + ' monthly income:\n\n50% Needs (max $' + Math.round(income * 0.5).toLocaleString() + '): Housing, transportation, food, insurance, minimum debt payments\n30% Wants (max $' + Math.round(income * 0.3).toLocaleString() + '): Entertainment, dining out, subscriptions, hobbies\n20% Savings & Extra Debt (min $' + Math.round(income * 0.2).toLocaleString() + '): Emergency fund, retirement, extra debt payments' },
        { heading: 'Action Plan', content: '1. Build a $1,000 starter emergency fund first\n2. List all debts and choose snowball or avalanche method\n3. Cut unnecessary subscriptions and expenses\n4. If you have VA disability, confirm you are receiving the correct rating\n5. Check if you qualify for property tax exemptions, vehicle registration discounts, or other veteran benefits\n6. Set up automatic transfers for savings on payday\n7. Review and adjust this budget monthly' },
        { heading: 'Veteran-Specific Resources', content: '• VA Financial Counseling: Call 1-800-827-1000\n• Military OneSource (active/recently separated): militaryonesource.mil\n• Consumer Financial Protection Bureau Veterans Page: consumerfinance.gov/veterans\n• National Foundation for Credit Counseling: nfcc.org\n• Many states offer veteran-specific property tax, vehicle, and education benefits — check AfterAction AI State Benefits' }
      ]
    };
  }

  // ── Phase 3 Generators ────────────────────────────────

  function generateNexusLetterPrep(d) {
    return {
      title: 'Nexus Letter Prep — ' + d.fullName,
      sections: [
        { heading: 'NEXUS LETTER PREPARATION DOCUMENT', content: 'Prepared for: ' + d.fullName + '\nBranch: ' + d.branch + '\nDates of Service: ' + d.serviceDates + '\nDate: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) },
        { heading: 'What is a Nexus Letter?', content: 'A nexus letter is a medical opinion from a qualified healthcare provider stating that your current condition is "at least as likely as not" connected to your military service. It is one of the most important pieces of evidence in a VA disability claim.' },
        { heading: 'Condition Being Claimed', content: d.condition },
        { heading: 'In-Service Event / Injury / Exposure', content: d.inServiceEvent },
        { heading: 'Symptom Timeline', content: 'First symptoms appeared: ' + d.firstSymptoms + '\n\nThis timeline is critical. The closer symptoms appear to the in-service event, the stronger the connection. Even if symptoms appeared years later, a medical professional can still establish a nexus if there is a plausible medical explanation.' },
        { heading: 'Current Diagnosis & Treatment', content: (d.currentDiagnosis ? 'Current diagnosis: ' + d.currentDiagnosis : 'No formal diagnosis noted — getting a current diagnosis is an important step before requesting a nexus letter.') + '\n\n' + (d.currentTreatment ? 'Current treatment:\n' + d.currentTreatment : 'No current treatment listed.') },
        { heading: 'Prior VA Claims', content: d.priorClaims || 'No prior claims for this condition.' },
        { heading: 'What to Give Your Doctor', content: 'When you ask your doctor for a nexus letter, provide:\n\n1. This preparation document\n2. Your service treatment records (STRs) showing the in-service event\n3. Any medical records showing a timeline of symptoms since service\n4. Your DD-214\n5. A clear description of how the condition affects you daily\n\nAsk your doctor to include this specific language:\n"It is my medical opinion that [condition] is at least as likely as not (50% or greater probability) caused by or related to [in-service event/exposure] during the veteran\'s military service."' },
        { heading: 'Nexus Letter Template for Your Doctor', content: '[Doctor\'s Letterhead]\n\nDate: _______________\n\nRE: Nexus Letter for ' + d.fullName + '\n\nTo Whom It May Concern,\n\nI am [Doctor Name], [credentials]. I have [treated/reviewed the records of] ' + d.fullName + ' for [condition].\n\nAfter reviewing the veteran\'s military service records, medical history, and current condition, it is my medical opinion that ' + d.condition + ' is at least as likely as not (50% or greater probability) caused by or aggravated by the veteran\'s military service, specifically [in-service event].\n\nMy rationale is based on: [medical reasoning]\n\nSincerely,\n[Doctor Name, Credentials]\n[License Number]\n[Contact Information]' },
        { heading: 'Next Steps', content: '1. Get a current diagnosis if you don\'t have one\n2. Gather your service treatment records and medical records\n3. Schedule an appointment with your treating physician or an independent medical examiner\n4. Bring this prep document and supporting records to the appointment\n5. Once you have the nexus letter, submit it with your VA claim using the AfterAction AI VA Claim Personal Statement template\n6. If previously denied, use the VA Appeal Letter template with the nexus letter as new evidence' }
      ]
    };
  }

  function generateBenefitsEligibility(d) {
    var rating = d.disabilityRating;
    var ratingNum = parseInt(rating) || 0;
    var isPT = rating.indexOf('P&T') >= 0;
    var hasHonorable = d.dischargeType === 'Honorable' || d.dischargeType === 'General (Under Honorable Conditions)';

    var healthcareSec = 'VA Healthcare: ';
    if (!hasHonorable) {
      healthcareSec += 'Your discharge type (' + d.dischargeType + ') may limit VA healthcare eligibility. Apply anyway — the VA makes individual determinations. You can also request a Character of Discharge review.';
    } else if (ratingNum >= 50) {
      healthcareSec += 'ELIGIBLE — Priority Group 1. No copays for service-connected conditions. You likely qualify for free VA healthcare.';
    } else if (ratingNum >= 10) {
      healthcareSec += 'ELIGIBLE — Priority Group 2-3. Low or no copays for service-connected conditions.';
    } else {
      healthcareSec += 'LIKELY ELIGIBLE — Priority Group 5-8 based on income. Apply at va.gov/health-care/apply.';
    }

    var educationSec = 'GI Bill Education Benefits: ';
    if (d.education === 'Fully used') {
      educationSec += 'You\'ve fully used your GI Bill benefits. Check if you qualify for VR&E (Chapter 31) if you have a service-connected disability.';
    } else if (d.education === 'Partially used') {
      educationSec += 'You have remaining GI Bill benefits. Check your balance at va.gov. Benefits expire 15 years after discharge for Post-9/11 GI Bill (some exceptions apply).';
    } else if (d.education === 'No — haven\'t used any') {
      educationSec += 'You have unused GI Bill benefits. Post-9/11 GI Bill provides tuition, housing allowance, and book stipend. Apply at va.gov/education.';
    } else {
      educationSec += 'Review your eligibility at va.gov/education.';
    }

    var disabilitySec = '';
    if (ratingNum === 0 && rating !== 'None / Not yet rated') {
      disabilitySec = 'You have a 0% rating. While this doesn\'t provide monthly compensation, it gives you access to VA healthcare and may qualify you for other benefits. Consider filing for an increase if your condition has worsened.';
    } else if (ratingNum >= 30) {
      disabilitySec = 'At ' + ratingNum + '% disability' + (isPT ? ' (Permanent & Total)' : '') + ', you are eligible for:\n• Monthly tax-free compensation\n• Additional compensation for dependents (' + (d.dependents || '0') + ' listed)\n• VA healthcare (Priority Group 1)\n• CHAMPVA for dependents (if 100% P&T)\n' + (ratingNum >= 100 ? '• Individual Unemployability consideration\n• Commissary and exchange privileges\n• Space-A travel eligibility\n• Property tax exemptions (varies by state)' : '• State-specific tax benefits (varies by state)');
    } else if (ratingNum >= 10) {
      disabilitySec = 'At ' + ratingNum + '% disability, you receive monthly compensation and VA healthcare access. Consider whether conditions have worsened — you may be underrated.';
    } else {
      disabilitySec = 'No current disability rating. If you have conditions related to service, consider filing a claim using the AfterAction AI VA Claim Personal Statement template.';
    }

    var employmentSec = 'Employment Benefits:\n';
    if (d.employment === 'Unemployed — looking') {
      employmentSec += '• VOW to Hire Heroes Act: Priority job referrals at American Job Centers\n• Veterans\' preference for federal jobs\n• Veteran Readiness & Employment (VR&E/Chapter 31) if service-connected disability\n• State employment offices often have dedicated veteran representatives\n• Homeless Veterans\' Reintegration Program (if applicable)';
    } else {
      employmentSec += '• Veterans\' preference for federal jobs (if applicable)\n• Veteran Readiness & Employment (VR&E/Chapter 31) for career development\n• Self-employment and small business resources through SBA Veterans programs';
    }

    return {
      title: 'Benefits Eligibility Summary — ' + d.fullName,
      sections: [
        { heading: 'PERSONALIZED BENEFITS ELIGIBILITY SUMMARY', content: 'Name: ' + d.fullName + '\nState: ' + d.state + '\nBranch: ' + d.branch + '\nService Era: ' + d.serviceEra + '\nYears of Service: ' + d.yearsService + '\nDischarge: ' + d.dischargeType + '\nDisability Rating: ' + d.disabilityRating + '\nDate Generated: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) },
        { heading: 'VA Healthcare', content: healthcareSec },
        { heading: 'VA Disability Compensation', content: disabilitySec },
        { heading: 'Education Benefits', content: educationSec },
        { heading: 'Employment', content: employmentSec },
        { heading: 'Home Loan Benefits', content: 'VA Home Loan: Most veterans with honorable or general discharge are eligible for VA-backed home loans with no down payment and no PMI. Check your eligibility at va.gov/housing-assistance. Use the AfterAction AI VA Loan Readiness Checklist for a step-by-step guide.' },
        { heading: 'State Benefits — ' + d.state, content: 'Your state (' + d.state + ') likely offers additional benefits including:\n• Property tax exemptions or reductions\n• State veteran bonus or grant programs\n• Hunting/fishing license discounts or exemptions\n• Vehicle registration benefits\n• State education benefits beyond GI Bill\n\nCheck the AfterAction AI State Benefits page for ' + d.state + '-specific details.' },
        { heading: 'IMPORTANT NOTE', content: 'This is an informational summary based on the information you provided. Actual eligibility is determined by the VA and individual state agencies. Apply directly to confirm your eligibility. When in doubt, apply — you may qualify for more than you think.' },
        { heading: 'Next Steps', content: '1. If no disability rating: consider filing a claim (VA Claim Personal Statement template)\n2. If underrated: file for increase\n3. Enroll in VA healthcare if not already: va.gov/health-care/apply\n4. Check state benefits on AfterAction AI\n5. Contact your county Veterans Service Officer for free local help' }
      ]
    };
  }

  function generateSkillsTranslator(d) {
    var translatedDuties = d.duties
      .replace(/MOS/gi, 'specialized role')
      .replace(/deployed/gi, 'assigned to high-priority operations')
      .replace(/platoon/gi, 'team of 20-40 professionals')
      .replace(/squad/gi, 'team of 9-13 professionals')
      .replace(/fire team/gi, 'small specialized team')
      .replace(/battalion/gi, 'organization of 300-1000 personnel')
      .replace(/company/gi, 'department of 60-200 personnel')
      .replace(/briefed/gi, 'presented to')
      .replace(/OPORD/gi, 'operational plan')
      .replace(/AOR/gi, 'area of responsibility')
      .replace(/SOP/gi, 'standard operating procedures')
      .replace(/PT/gi, 'physical readiness program')
      .replace(/NCOER/gi, 'performance evaluation')
      .replace(/OER/gi, 'performance evaluation')
      .replace(/TDY/gi, 'temporary assignment')
      .replace(/PCS/gi, 'organizational relocation');

    return {
      title: 'Skills Translation — ' + d.fullName,
      sections: [
        { heading: 'MILITARY TO CIVILIAN SKILLS TRANSLATION', content: 'Name: ' + d.fullName + '\nBranch: ' + d.branch + '\nMilitary Job Code: ' + d.mos + '\nMilitary Job Title: ' + d.mosTitle + '\nHighest Rank: ' + d.rank + (d.targetIndustry ? '\nTarget Industry: ' + d.targetIndustry : '') },
        { heading: 'Civilian-Friendly Job Title Equivalents', content: 'Your military role (' + d.mosTitle + ') translates to civilian titles such as:\n\n• Operations Manager / Operations Coordinator\n• Project Manager / Program Manager\n• Logistics Manager / Supply Chain Coordinator\n• Training Manager / Instructional Coordinator\n• Security Manager / Risk Analyst\n• Technical Specialist / Systems Administrator\n\nNote: Use the title that best matches the specific job you\'re applying for. Research the target company\'s job titles on LinkedIn or their careers page.' },
        { heading: 'Duties — Translated', content: 'Original:\n' + d.duties + '\n\nCivilian Translation:\n' + translatedDuties },
        { heading: 'Equipment & Technology — Translated', content: d.equipment ? 'Military: ' + d.equipment + '\n\nFor your resume, translate specific systems to general categories:\n• Communication systems → "enterprise communication platforms"\n• Navigation equipment → "GPS/GIS systems"\n• Weapons systems → "complex technical systems" or "safety-critical equipment"\n• Military vehicles → "fleet management" or "heavy equipment operation"\n• Encryption/COMSEC → "cybersecurity" or "information security"\n• Military software → name civilian equivalents (SAP, Oracle, etc.) if applicable' : 'No equipment listed. Consider adding equipment and systems you used — technical skills are highly valued.' },
        { heading: 'Leadership Translation', content: d.leadership ? 'You supervised ' + d.leadership + ' personnel.\n\nCivilian translation: "Managed and developed a team of ' + d.leadership + ' professionals, including performance evaluations, training, scheduling, and professional development."\n\nIf you managed equipment or budgets, include dollar amounts and quantities.' : 'Consider quantifying your leadership experience — number of people supervised, budget managed, equipment valued at.' },
        { heading: 'Universal Military-to-Civilian Skill Translations', content: '• Leadership under pressure → Crisis management and decision-making\n• Mission planning → Project planning and execution\n• After Action Reviews → Performance analysis and continuous improvement\n• Security clearance → Trusted with sensitive information\n• Training new personnel → Staff development and onboarding\n• Operating in diverse environments → Cross-cultural competency\n• Following/giving orders → Clear communication in hierarchical organizations\n• Adapting to changing situations → Agile methodology and change management\n• Maintaining equipment → Asset management and preventive maintenance\n• Logistics coordination → Supply chain management' },
        { heading: 'Words to Avoid on Your Resume', content: 'AVOID → USE INSTEAD\n• Combat → High-stakes operations\n• Troops → Team members, personnel\n• Warfare → Strategic operations\n• Killed/destroyed → Neutralized, resolved\n• Weapons → Systems, equipment\n• Enemy → Opposing force, competitor\n• Mission → Project, objective, initiative\n• Barracks → Facility\n• Chow → Meals, food service\n• Roger/Copy → Acknowledged, confirmed' },
        { heading: 'Next Steps', content: '1. Use the AfterAction AI Resume Builder with these translated skills\n2. Update your LinkedIn profile with the LinkedIn Profile Builder\n3. Practice explaining your experience in civilian terms with the Interview Prep template\n4. Use O*NET (onetonline.org) to find civilian jobs matching your military code' }
      ]
    };
  }

  function generateSalaryNegotiation(d) {
    var offered = parseFloat(d.offeredSalary.replace(/[^0-9.]/g, '')) || 0;
    var desired = parseFloat(d.desiredSalary.replace(/[^0-9.]/g, '')) || 0;
    var gap = desired - offered;
    var askAmount = Math.round(desired * 1.05);

    return {
      title: 'Salary Negotiation Script — ' + d.fullName,
      sections: [
        { heading: 'SALARY NEGOTIATION PREPARATION', content: 'Candidate: ' + d.fullName + '\nRole: ' + d.targetRole + '\nCompany: ' + d.companyName + '\nOffered: $' + offered.toLocaleString() + '\nYour Target: $' + desired.toLocaleString() + '\nGap: $' + gap.toLocaleString() + '\n\nStrategy: Ask for $' + askAmount.toLocaleString() + ' (5% above target) to leave room to settle at your target.' },
        { heading: 'Opening Script — The Ask', content: '"Thank you so much for the offer — I\'m genuinely excited about this opportunity at ' + d.companyName + '. I\'ve done some research on the market rate for ' + d.targetRole + ' positions, and given my ' + d.yearsExperience + ' years of experience and the specific value I bring, I was hoping we could discuss the compensation.\n\nI\'d be looking for something in the range of $' + askAmount.toLocaleString() + '. Here\'s why I think that\'s justified..."' },
        { heading: 'Your Value Proposition', content: 'Key points to make:\n\n' + d.uniqueValue + '\n\nFrame each point as value to the company, not what you need. Example:\n\n"My security clearance alone saves the company $10,000-50,000 in processing time and costs."\n"My experience managing teams of [X] means I can hit the ground running with no ramp-up time."' },
        { heading: 'If They Push Back', content: '"I understand there may be constraints. I\'m flexible on how we get to a number that works for both of us. Could we explore:\n\n• A signing bonus to bridge the gap?\n• A salary review after 6 months based on performance?\n• Additional PTO or flexible work arrangements?\n' + (d.benefits ? '• ' + d.benefits.split('\n').join('\n• ') : '• Other benefits that might be available?') + '"' },
        { heading: 'Leverage Points', content: d.otherOffers === 'Yes — another offer' ? 'You have a competing offer. Use it carefully:\n\n"I want to be transparent — I do have another offer I\'m considering. I\'d prefer to work with ' + d.companyName + ', but I want to make sure the compensation is competitive."\n\nNever bluff about competing offers. If asked for specifics, you can say you\'d rather not share details but can confirm it\'s competitive.' : d.otherOffers === 'Yes — current job is fine' ? 'Your current position is your leverage:\n\n"I\'m in a good position in my current role, so I want to make sure any move is the right one financially as well as professionally."' : 'Without competing offers, lean harder on your unique value and market research. You can also say:\n\n"I\'ve researched the market rate for this role extensively, and I want to make sure we\'re aligned with what the position commands."' },
        { heading: 'Never Say', content: '• "I need this much because of my bills/mortgage/expenses" (keep it about value, not need)\n• "This is my final offer / take it or leave it" (always leave room)\n• "I\'ll take anything" (this eliminates your leverage)\n• Specific numbers from competing offers (if you don\'t have one)\n• "The minimum I\'d accept is..." (never reveal your floor)' },
        { heading: 'If They Say "This is the Best We Can Do"', content: '"I appreciate you working with me on this. Before I accept, can I take 24-48 hours to review the full package? I want to make a thoughtful decision."\n\nUse this time to:\n1. Evaluate the total compensation (salary + benefits + growth potential)\n2. Consider whether non-salary items close the gap\n3. Decide your true walk-away point\n4. Come back with one final, specific ask if needed' },
        { heading: 'Closing Script — Accepting', content: '"I\'m excited to accept. Thank you for working with me on the compensation. I\'m looking forward to contributing to the team at ' + d.companyName + '. Could you send over the updated offer letter so I can sign?"\n\nAlways get the final agreement in writing before your start date.' }
      ]
    };
  }

  function generateVALoanChecklist(d) {
    var income = parseFloat(d.monthlyIncome.replace(/[^0-9.]/g, '')) || 0;
    var debts = parseFloat(d.monthlyDebts.replace(/[^0-9.]/g, '')) || 0;
    var dti = income > 0 ? Math.round((debts / income) * 100) : 0;
    var maxMortgage = Math.round((income * 0.41 - debts) * 1);
    var dtiStatus = dti <= 41 ? '✓ Good — within VA guidelines' : '⚠ Above 41% — may need compensating factors';

    return {
      title: 'VA Loan Readiness Checklist — ' + d.fullName,
      sections: [
        { heading: 'VA LOAN READINESS CHECKLIST', content: 'Name: ' + d.fullName + '\nState: ' + d.state + '\nDate: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) },
        { heading: 'Eligibility Status', content: 'Service Status: ' + d.serviceStatus + '\n' + (d.serviceStatus === 'Guard/Reserve (never activated)' ? '⚠ Guard/Reserve members who were never activated for 90+ days may have limited VA loan eligibility. Check with the VA.' : '✓ Your service status typically qualifies for VA loan benefits.') + '\n\nCertificate of Eligibility (COE): ' + d.hasCOE + '\n' + (d.hasCOE === 'Yes' ? '✓ You have your COE — you\'re ready for this step.' : '→ ACTION NEEDED: Request your COE at va.gov/housing-assistance/home-loans/how-to-request-coe or through your lender.') },
        { heading: 'Financial Snapshot', content: 'Monthly Gross Income: $' + income.toLocaleString() + '\nMonthly Debt Payments: $' + debts.toLocaleString() + '\nDebt-to-Income Ratio (DTI): ' + dti + '% ' + dtiStatus + '\nEstimated Maximum Monthly Mortgage Payment: $' + maxMortgage.toLocaleString() + ' (based on 41% DTI guideline)\nSavings for Closing Costs: $' + d.savings },
        { heading: 'Credit Score Assessment', content: 'Your Range: ' + d.creditScore + '\n\n' + (d.creditScore === '740+' ? '✓ Excellent — you\'ll qualify for the best rates.' : d.creditScore === '700-739' ? '✓ Good — you should have no issues qualifying.' : d.creditScore === '660-699' ? '✓ Fair — most VA lenders will approve. Shop around for best rates.' : d.creditScore === '620-659' ? '⚠ Marginal — VA has no minimum, but most lenders want 620+. You\'ll likely qualify but may have higher rates.' : d.creditScore === '580-619' ? '⚠ Below average — some VA lenders will work with you. Consider credit repair first. Use the AfterAction AI Credit Dispute Letter if needed.' : d.creditScore === 'Below 580' ? '→ ACTION NEEDED: Focus on credit improvement before applying. Dispute errors, pay down balances, make all payments on time for 6-12 months.' : '→ ACTION NEEDED: Check your credit score at annualcreditreport.com (free).') },
        { heading: 'VA Loan Benefits Recap', content: '• NO down payment required (up to conforming loan limits)\n• NO private mortgage insurance (PMI)\n• Competitive interest rates (typically lower than conventional)\n• Limited closing costs (VA limits what veterans can be charged)\n• No prepayment penalties\n• VA funding fee: ' + (d.firstTimeBuyer === 'No — have used VA loan before' ? '3.3% (subsequent use) — can be financed into loan' : '2.15% (first use) — can be financed into loan') + '\n• Funding fee is WAIVED if you have 10%+ VA disability rating\n\nProperty Type: ' + d.propertyType + '\n' + (d.propertyType === 'Condo' ? '→ The condo must be on the VA-approved list. Check va.gov/gi-bill-comparison-tool.' : d.propertyType === 'Multi-unit (2-4 units)' ? '→ VA allows up to 4-unit properties if you live in one unit. Rental income from other units can count toward qualifying.' : d.propertyType === 'Manufactured home' ? '→ Must be on a permanent foundation and meet VA standards.' : '') },
        { heading: 'Your Readiness Checklist', content: '□ Certificate of Eligibility obtained\n□ Credit score reviewed (target 620+)\n□ Debt-to-income ratio under 41%\n□ Stable income for 2+ years documented\n□ Savings for closing costs ($' + d.savings + ' available)\n□ DD-214 or proof of service ready\n□ Recent pay stubs (30 days)\n□ W-2s and tax returns (2 years)\n□ Bank statements (2 months)\n□ Pre-approval from VA-approved lender\n□ Real estate agent selected (consider a veteran-friendly agent)\n□ ' + d.state + ' state veteran housing benefits researched' },
        { heading: 'Next Steps', content: '1. Get your COE if you don\'t have it\n2. Check and improve your credit if below 620\n3. Get pre-approved by 2-3 VA-approved lenders (compare rates)\n4. Find a veteran-friendly real estate agent\n5. Start house hunting within your budget\n6. Remember: VA appraisal is required and protects you from overpaying\n7. Use the AfterAction AI Budget/Financial Recovery Plan to plan monthly costs' }
      ]
    };
  }

  function generateRentalPacket(d) {
    return {
      title: 'Rental Application Packet — ' + d.fullName,
      sections: [
        { heading: 'RENTAL APPLICATION COVER LETTER', content: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '\n\nDear Property Manager,\n\nMy name is ' + d.fullName + ' and I am writing to express my interest in renting the property at [address]. I am a ' + d.veteranStatus.toLowerCase() + ' and I am relocating due to ' + d.reasonForMoving.toLowerCase() + '.\n\nI have a stable monthly income of $' + d.monthlyIncome + ' from ' + d.incomeSource.split('\n')[0] + '. I have a strong rental history, reliable references, and a track record of maintaining properties in excellent condition.\n\n' + (d.additionalInfo ? d.additionalInfo + '\n\n' : '') + 'I would welcome the opportunity to discuss my application with you. I am available at ' + d.phone + ' or ' + d.email + '.\n\nThank you for your consideration.\n\nSincerely,\n' + d.fullName },
        { heading: 'APPLICANT INFORMATION', content: 'Name: ' + d.fullName + '\nPhone: ' + d.phone + '\nEmail: ' + d.email + '\nCurrent Address: ' + d.currentAddress + '\nReason for Moving: ' + d.reasonForMoving + '\nVeteran Status: ' + d.veteranStatus + (d.pets ? '\nPets: ' + d.pets : '\nPets: None') },
        { heading: 'INCOME VERIFICATION', content: 'Monthly Gross Income: $' + d.monthlyIncome + '\n\nIncome Sources:\n' + d.incomeSource + '\n\nDocumentation provided:\n• Recent pay stubs (30 days)\n• ' + (d.veteranStatus === 'Veteran' || d.veteranStatus === 'Active duty' ? 'VA benefits award letter\n• ' : '') + 'Bank statements (2 months)\n• Employment verification letter' },
        { heading: 'REFERENCES', content: 'Reference 1: ' + d.reference1 + '\nReference 2: ' + d.reference2 },
        { heading: 'SUPPORTING DOCUMENTS CHECKLIST', content: '□ This cover letter\n□ Completed rental application (landlord\'s form)\n□ Copy of government-issued photo ID\n□ Proof of income (pay stubs, VA award letter, bank statements)\n□ Prior landlord references\n□ ' + (d.veteranStatus !== 'Military spouse' ? 'Copy of DD-214 or military ID (establishes credibility)' : 'Copy of military spouse ID') + '\n□ Credit report (optional — shows proactive transparency)\n□ Employment verification letter' },
        { heading: 'Tips for Veterans Renting', content: '• The Servicemembers Civil Relief Act (SCRA) provides protections for military tenants including early lease termination for PCS orders or deployment\n• Many landlords view military service favorably — mention it prominently\n• VA disability income counts as income and cannot be discriminated against\n• If you have a service dog, it is not a "pet" under the Fair Housing Act and cannot be subject to pet deposits\n• Consider asking for a military clause in your lease allowing early termination with orders' }
      ]
    };
  }

  function generateEmergencyPlan(d) {
    return {
      title: 'Personal Emergency Action Plan — ' + d.fullName,
      sections: [
        { heading: 'PERSONAL EMERGENCY ACTION PLAN', content: 'Prepared by: ' + d.fullName + '\nHousehold Size: ' + d.householdSize + '\nAddress: ' + d.address + '\nPrimary Risk Focus: ' + d.primaryRisks + '\nDate: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) },
        { heading: 'Household Members', content: d.householdMembers },
        { heading: 'Emergency Contacts', content: 'Contact 1: ' + d.emergencyContact1 + '\nContact 2: ' + d.emergencyContact2 + '\n\nLocal Emergency: 911\nPoison Control: 1-800-222-1222\nVA Crisis Line: 988 (press 1)\nRed Cross: 1-800-733-2767' },
        { heading: 'Evacuation Plan', content: 'Meeting Point: ' + (d.meetingPoint || '[ASSIGN A MEETING POINT — a neighbor\'s house, nearby landmark, or community center]') + '\n\nEvacuation Routes:\n• Route 1 (primary): [Map out your main route from home to meeting point]\n• Route 2 (alternate): [Map out a backup route in case primary is blocked]\n\nTransportation:\n• Vehicle 1: [Make, model, keep at least half tank of gas]\n• Backup: [Know your local evacuation bus routes or shelters]' },
        { heading: 'Go-Bag Checklist (72-Hour Kit)', content: 'Prepare one for each household member:\n\n□ Water (1 gallon per person per day × 3 days)\n□ Non-perishable food (3 days)\n□ First aid kit\n□ Flashlight + extra batteries\n□ Phone charger (portable battery pack)\n□ Cash ($200+ in small bills)\n□ Copies of important documents (in waterproof bag):\n  — IDs and passports\n  — Insurance policies\n  — DD-214\n  — VA disability rating letter\n  — Medication list\n  — Bank account info\n□ Change of clothes and sturdy shoes\n□ Blankets or sleeping bags\n□ Prescription medications (7-day supply)\n□ Personal hygiene items\n' + (d.medicalNeeds ? '□ Medical equipment/supplies: ' + d.medicalNeeds : '') + '\n' + (d.pets ? '□ Pet supplies: food, leash, carrier, vet records for ' + d.pets : '') },
        { heading: 'Medical Needs', content: d.medicalNeeds || 'No critical medical needs listed. Consider documenting:\n• Current medications and dosages\n• Allergies\n• Blood types\n• Doctor and pharmacy contact info\n• Medical device requirements (CPAP, insulin, etc.)' },
        { heading: 'Communication Plan', content: 'In an emergency:\n1. Text first (texts get through when calls can\'t)\n2. Call emergency contacts in order\n3. Check in at meeting point\n4. Post status on family group chat or social media\n5. Designate an out-of-area contact (someone far from your area who can relay information)\n\nOut-of-area contact: [Assign someone — a relative in another state is ideal]' },
        { heading: 'Shelter-in-Place Plan', content: 'If you cannot evacuate:\n• Safest room in home: [identify — usually interior room, no windows, lowest floor]\n• Water shutoff location: [document]\n• Gas shutoff location: [document]\n• Electrical panel location: [document]\n• Emergency supplies stored at: [document]' },
        { heading: 'Financial Preparedness', content: '□ Emergency fund covers 1-3 months of expenses\n□ Insurance policies reviewed and adequate (home/renters, auto, health, life)\n□ Important financial documents accessible or in cloud storage\n□ At least one credit card with available credit for emergencies\n□ Know how to access VA emergency assistance if needed' },
        { heading: 'Review Schedule', content: 'Review and update this plan:\n• Every 6 months\n• When household members change\n• When you move to a new home\n• At the start of severe weather season\n• After any real emergency (lessons learned)\n\nPractice drill: Walk through your evacuation plan with all household members at least once per year.' },
        { heading: 'Veteran-Specific Resources', content: '• VA Crisis Line: 988 (press 1) — 24/7 for any veteran in crisis\n• VA Emergency Financial Assistance: Contact your local VA social worker\n• Red Cross Military Services: redcross.org/military\n• FEMA Resources: ready.gov\n• Salvation Army Veteran Services: Contact local chapter' }
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

    // Legal disclaimer banner
    if (templateData.legal_disclaimer) {
      html += '<div class="tmpl-disclaimer">';
      html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      html += '<span>' + escapeHtml(templateData.legal_disclaimer) + '</span>';
      html += '</div>';
    }

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

    // Action engine recommendations placeholder
    html += '<div id="actionEnginePanel"></div>';

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
            var href = next.phase <= 3 ? 'template-flow.html?id=' + next.id : '#';
            var cls = next.phase <= 3 ? 'tmpl-flow__next-link' : 'tmpl-flow__next-link tmpl-flow__next-link--disabled';
            nextHtml += '<a href="' + href + '" class="' + cls + '">' + escapeHtml(next.title) + (next.phase > 3 ? ' (Coming Soon)' : '') + '</a>';
          }
        });
        linksDiv.innerHTML = nextHtml;
      });
    }

    // Action Engine — analyze completed output for related recommendations
    if (typeof AAAI !== 'undefined' && AAAI.actions) {
      try {
        var fullText = output.sections.map(function(s) { return (s.heading || '') + ' ' + (s.content || ''); }).join(' ');
        var actionPlan = AAAI.actions.getActionPlan(fullText);
        // Remove the current template from recommendations
        var currentId = templateData.id;
        actionPlan.templates.flow = actionPlan.templates.flow.filter(function(id) { return id !== currentId; });
        var panelHtml = AAAI.actions.renderActionPanel(actionPlan, { maxTemplates: 3, maxResources: 3, compact: true });
        if (panelHtml) {
          var panelEl = document.getElementById('actionEnginePanel');
          if (panelEl) {
            panelEl.innerHTML =
              '<div class="tmpl-completion-actions">' +
                '<div class="tmpl-completion-actions__title">Related Actions Based on Your Document</div>' +
                panelHtml +
              '</div>';
          }
        }
      } catch(e) {
        console.error('ActionEngine template completion error:', e);
      }
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

    // Legal disclaimer in PDF
    if (templateData.legal_disclaimer) {
      doc.setFillColor(255, 248, 220);
      doc.roundedRect(mL, y - 3, usableW, 14, 2, 2, 'F');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(120, 80, 0);
      var discLines = doc.splitTextToSize(templateData.legal_disclaimer, usableW - 6);
      var discH = discLines.length * 4 + 4;
      doc.setFillColor(255, 248, 220);
      doc.roundedRect(mL, y - 3, usableW, discH + 2, 2, 2, 'F');
      discLines.forEach(function(dLine) {
        doc.text(dLine, mL + 3, y + 1);
        y += 4;
      });
      y += 6;
    }

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
