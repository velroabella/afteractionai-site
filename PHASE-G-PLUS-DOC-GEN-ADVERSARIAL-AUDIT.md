# Phase G+ — Document Generation Adversarial Audit
**Auditor role:** Senior QA Architect / Adversarial Auditor / Document-Generation Test Lead
**Target:** AfterAction AI — document generation pipelines
**Date:** 2026-04-10
**Scope:** Every code path that creates, saves, or retrieves a document on afteractionai.org
**Method:** Source-level static audit, cross-referenced against prior Phase F and Phase G fixes
**Verdict bias:** Hard. Evidence-driven. No soft conclusions.

---

## EXECUTIVE ONE-LINER (before the long form)

**Document generation on AfterAction AI is NOT production-ready.** It is fast because it does almost no real work. The "AI-generated" resume and career documents are built by static string concatenation with literal `[PHONE]`, `[EMAIL]`, `[AMOUNT]`, and `[NOT PROVIDED]` tokens baked directly into the code. Context ingestion is shallow and one-directional. Uploaded documents are mined for six DD-214 fields only. Prior generated outputs, dashboard state, and session chat history are not used for any template-driven document. Every generated document contains at least two duplicated disclaimer blocks. There is no post-generation verification pass anywhere in the pipeline. The earlier Phase F and Phase G work materially improved chat response quality but DID NOT TOUCH document generation. Prior audits created false confidence by focusing on router/RIL/memory plumbing while the document engine quietly printed placeholder text to Word files.

---

## PART 1 — DOCUMENT PATH INVENTORY

The system has **four independent document generation paths**. They do not share a generator, a data model, or a completeness pass. They disagree on output format, disclaimers, and context usage.

### Path A — Chat-driven AI template engine
- **File:** `js/template-engine.js` (1,400+ lines)
- **Trigger:** "Start Task" button on a checklist item, or `detectTemplateForTask()` keyword match
- **Flow:** `launchTemplate(templateId, context, itemIndex)` → builds `contextMsg` from profile → opens a template chat screen → `callTemplateAPI()` → `/api/chat` → saves LAST assistant message to Supabase `template_outputs`
- **Registry:** 18 templates (resume, va_claim, transition_plan, business_launch, financial_plan, daily_mission, will, poa, medical_poa, living_will, hipaa_auth, emergency_contacts, dependent_care, burial_preferences, digital_assets, family_letter, financial_overview, insurance_summary, asset_list, emergency_action, va_contact_auth)
- **Generation model:** Freeform AI (Claude via server proxy, `skip_tools: true`)
- **Save format:** Plain-text of the last AI message (NOT the full conversation, NOT a structured object, NOT a .docx)
- **Download format:** `.txt` only (see `downloadTemplateOutput` at line 1249 — `new Blob([lastTemplateOutput], { type: 'text/plain' })`)

### Path B — Text-chat "force path" resume template
- **File:** `js/app.js` lines 3451-3967 (`_handleResumeGeneration`, `_buildResumeData`, `_mineUploadedDocsForProfile`)
- **Trigger:** Any typed phrase matching `/\b(build|generate|create|write|make|draft|prepare)\b.{0,30}\b(my\s+)?(resume|cv)\b/i`
- **Flow:** Acquires `_resumeExecutionLock` → waits on `_dashboardContextReady` → mines six fields from uploaded docs → reads `AIOS.Memory.getProfile()` → calls `window.AAAI.legalDocx.generateFromData('resume-builder', resumeData)` → saves `result.contentText` (DIFFERENT from the .docx body) to Supabase → auto-downloads the `.docx`
- **Generation model:** Static template filled from profile fields — NO AI ROUND-TRIP
- **Data source:** Only `_buildResumeData()` object (13 fields; most default to `'[NOT PROVIDED]'`)

### Path C — Voice-chat document generation
- **File:** `js/app.js` lines 3030-3077 (`RealtimeVoice.onUserTranscript`)
- **Trigger:** `_earlyGenRegex` matches spoken transcript — detects a large set of verbs × document nouns
- **Flow:** `endVoiceSession()` → if request mentions "resume/cv" → forks to Path B; **otherwise** dumps a generic string (`"The veteran just asked via voice: ... Generate the requested document now in full using all context from our conversation."`) into `sendToAI()` as a FAKE user turn and trusts the AI to synthesize a document freeform
- **Generation model (non-resume):** 100% AI freeform with no template, no schema, no completion check
- **Known quirk:** `_lastAIMessageText` dedupe, `endVoiceSession()` race conditions with overlapping transcripts

### Path D — Direct template intake form (`template-flow.html`)
- **File:** `js/template-flow.js` (1,048 lines)
- **Trigger:** User navigates to `/template-flow.html?id=<templateId>` via `document-templates.html`
- **Flow:** Loads `data/document-templates.json` → renders intake form per `templateData.intake[]` → user fills form (optionally uploads files) → `buildOutput(templateId, data)` returns a literal `{ title, sections: [{heading, content}] }` object from a hand-written generator (`generateResume`, `generateWill`, ...) → `AAAI.auth.saveTemplateOutput()`
- **Generation model:** Pure string concatenation — 25 generator functions, one per template. No AI. No context awareness.
- **Uploaded-file handling:** `uploadedFileText` variable (line 11) is DECLARED but grep shows it is never used to populate any generator output. The files get uploaded and the text is extracted, but the text never reaches `buildOutput()`. Silent context-ingestion failure at the source.

### Path E (degenerate) — Legal docx fallback via `legal-docx-generator.js`
Called from Paths B and D when a `.docx` download is needed. Contains 25+ form builders, each with its OWN hardcoded `[BRACKETED]` placeholders and its own inline `TEMPLATE NOTICE:` bold paragraph duplicated on top of the separately-built `buildCareerNoticeSection()` / `buildNoticeSection()` / `buildFinancialNoticeSection()`.

### Path F (orphaned) — `js/template-flow.js` directly calling `AAAI.auth.saveTemplateOutput` at line 1029
Separate save path from the one `template-engine.js` uses. Different metadata shape, different title format, different content structure. Neither path reconciles with the other — two saves of the "same" document type will not look alike in the dashboard.

### Inventory of trigger surfaces

| Surface | Path | Document types | Save? | Download? |
|---|---|---|---|---|
| Chat button "Start Task" on checklist | A | 18 AI templates | Yes (last msg) | .txt |
| Chat picker modal (`showTemplatePicker`) | A | 18 AI templates | Yes | .txt |
| Typed "build my resume" | B | resume only | Yes (truncated) | .docx auto-download |
| Typed "write my will" | AI freeform via sendToAI | any | No (dashboard-handoff save only) | None |
| Voice "build my resume" | B (via fork) | resume only | Yes | .docx auto-download |
| Voice "build my will" | C | any | No (AI freeform into chat) | None |
| `/template-flow.html?id=...` | D | 25 static generators | Yes | .docx via legal-docx-generator |
| `/document-templates.html` card click | D (link to template-flow.html) | same as D | same as D | same as D |

Four paths that look to the user like "the same feature" produce four different outputs.

---

## PART 2 — TEST MATRIX

This audit is static (source-level). Where I could not run the UI, I mark the result from the code path rather than a browser screenshot. Every entry below is derived from the source, not assumed.

| Doc type | Text chat | Voice chat | Direct template page | Button click | Save | Re-open match |
|---|---|---|---|---|---|---|
| **Resume / CV** | FAIL — static template + literal `[PHONE]`/`[EMAIL]`/`[AMOUNT]` in body; generic hardcoded bullets | FAIL — forks to the same broken Path B | FAIL — `generateResume()` produces 6 terse sections, zero context | FAIL — checklist "Start Task" routes to Path A (AI chat); produces a different artifact than Path B/D, saved as .txt only | PARTIAL — Path B saves a DIFFERENT markdown version than the .docx body | FAIL — saved contentText and downloaded .docx disagree |
| **Federal resume** | Not wired in Path A registry | Not in early-gen regex for resume fork; falls to AI freeform | Path D `generateFederalResume()` — mostly form echo | Path D only | Yes | Untested (no re-open comparator) |
| **LinkedIn profile** | Path A has no `linkedin` template; falls to AI freeform | AI freeform | Path D `generateLinkedIn()` — one-paragraph echo of form fields | Path D only | Yes | N/A |
| **Cover letter** | No template exists anywhere in registry | No template | No template in `template-flow.js` generators | Fails silently — returns "Template generator not yet implemented." | No | N/A |
| **Last Will** | Path A `will` template — AI freeform with disclaimer at top | AI freeform via sendToAI | Path D `generateWill()` — string concat with `[PHONE]`-free but contains hardcoded "Next Steps" + "IMPORTANT DISCLAIMER" body sections | Path A for chat button, Path D for direct page | Yes (mismatched between paths) | FAIL — text saved by A is shorter than text produced by D |
| **POA (General/Durable/Medical)** | Path A AI | AI freeform | Path D static generators with duplicate disclaimers | A vs D produce different outputs | Yes | FAIL |
| **VA claim personal statement** | Path A `va_claim` AI | AI freeform | Path D `generateVAClaim()` | A vs D | Yes | FAIL |
| **Debt hardship / credit dispute / budget** | Path A has `financial_plan` only (different from form IDs) | AI freeform | Path D static + legal-docx-generator inline notice | A produces `financial_plan`, D produces a specific letter — misaligned | Yes | FAIL |
| **Nexus letter prep** | Not in Path A | AI freeform | Path D `generateNexusLetterPrep` — static | D only | Yes | FAIL |
| **Legal/readiness (15 docs)** | Path A has them as AI templates | AI freeform | Path D static generators for ~10 of them | Divergent between A and D | Yes | FAIL |

**Pass rate (any definition of "works end-to-end with user context"): 0 of 25 document types.**

---

## PART 3 — GENERATED DOCUMENT QUALITY REVIEW

### 3.1 Resume — Path B (typed / voice "build my resume") — CRITICAL FAIL

**Evidence file:** `js/legal-docx-generator.js:1642-1741`, function `buildResumeFromData`.

Reading the code, here is what the .docx body contains for EVERY veteran, regardless of context:

```
[Header band: "DRAFT TEMPLATE — FOR CAREER PREPARATION"]
[Header sub: "This document is a starting point only and requires review before use."]

IMPORTANT NOTICE                                    ← buildCareerNoticeSection body para
This document is for informational and guidance purposes only.
It does not guarantee employment, hiring decisions, or salary outcomes.
Use this as a starting point and customize based on your experience.

{fullName or [NOT PROVIDED]}                        ← heading
{state + ' | '}Phone: [PHONE] | Email: [EMAIL]      ← LINE 1683 — LITERAL PLACEHOLDERS

Professional Summary
Results-driven professional with {years} years of military service in the
{branch} ({mos}). Proven track record of leadership, mission execution,
and team development. Seeking to leverage military expertise in a civilian
{targetRole} role.                                  ← SAME SENTENCE FOR EVERY VETERAN

Core Competencies
{keySkills split on ,|;}                            ← from profile OR the 8-keyword fallback list

Professional Experience
{branch} — {rank}, {mos}
{entryDate} – {sepDate}
Key accomplishments and responsibilities:
• Led and managed teams in support of mission-critical operations          ← HARDCODED
• Developed and executed training programs for personnel readiness         ← HARDCODED
• Maintained accountability for equipment and resources valued at $[AMOUNT] ← HARDCODED + LITERAL PLACEHOLDER
• [ADD YOUR SPECIFIC ACCOMPLISHMENTS — quantify results where possible]    ← HARDCODED LITERAL INSTRUCTION TO SELF

Education
{education or [NOT PROVIDED]}

Certifications & Training
[LIST RELEVANT CERTIFICATIONS AND MILITARY TRAINING TRANSLATED TO CIVILIAN EQUIVALENTS]  ← LITERAL INSTRUCTION

{if vaRating:}
Veteran Status
VA Disability Rating: {vaRating}%
Eligible for veterans' preference in federal hiring.

Resume Tips
• Translate all military jargon into civilian language
• Quantify results: "Managed team of 30" not "Led platoon"
• ...

[Footer: "Generated by AfterAction AI — Career guidance template. Verify before use."]
```

**Defects in this single document:**

| # | Defect | Location | Severity |
|---|---|---|---|
| D1 | Literal `[PHONE]` in contact line no matter what | legal-docx-generator.js:1683 | CRITICAL |
| D2 | Literal `[EMAIL]` in contact line no matter what | legal-docx-generator.js:1683 | CRITICAL |
| D3 | Literal `$[AMOUNT]` in experience bullet | legal-docx-generator.js:1710 | CRITICAL |
| D4 | Literal `[ADD YOUR SPECIFIC ACCOMPLISHMENTS — ...]` in experience | 1714 | CRITICAL |
| D5 | Literal `[LIST RELEVANT CERTIFICATIONS AND MILITARY TRAINING ...]` in Certifications | 1723 | CRITICAL |
| D6 | Three identical hardcoded "military experience" bullets for every veteran | 1700-1707 | HIGH (uniformity) |
| D7 | Single-sentence Professional Summary string concat — no variation, no targeting | 1664-1668 | HIGH |
| D8 | `keySkills` falls back to a fixed 8-keyword pipe-delimited string if profile MOS present but no skills | 3701-3705 | HIGH |
| D9 | Duplicate notice: body notice section + (possibly) inline `TEMPLATE NOTICE` + docx header band | multiple | HIGH |
| D10 | No email / phone anywhere in AIOS profile schema, so D1 & D2 can NEVER be filled by this path | implicit | CRITICAL |

**Reality check:** The resume builder emits literal `[PHONE]` and `[EMAIL]` because the only place those fields could come from is `data.phone` / `data.email` — but `_buildResumeData()` at line 3709-3723 **does not populate them at all**. There is no `phone` or `email` key in the resume data object. The `[PHONE]` and `[EMAIL]` in the docx body are not placeholders waiting for interpolation — they are hardcoded literal text.

This is the most important finding in the entire audit. It is not a bug, it is a design defect. The resume engine does not interpolate contact info. It prints the placeholder. No prior phase touched this.

### 3.2 Resume — Path A (chat-driven AI template)

`template-engine.js` system prompt for `resume`:
> "If metrics are unknown, write strong impact-based bullets"
> "NAME + CONTACT (use placeholder if not provided)"

The system prompt **tells the AI to use placeholders**. Any resume produced by this path will contain placeholders whenever any field is unknown, because that is the instruction. The AI is doing what it was told. The defect is upstream.

Also: `extractTemplateOutput()` (line 1159) loops the conversation from the end and grabs the LAST assistant message only. If Claude paginated a long resume across two messages (common when verbosity is high), the earlier half is silently discarded.

### 3.3 Resume — Path D (direct template page)

`template-flow.js:234-246` `generateResume(d)`:
- Six sections, 200 words total
- No bullets, no accomplishments, no civilian translation
- "Next Steps" section tells the user to tailor it themselves
- `uploadedFileText` variable declared at line 11 but grep shows it is **never read** inside any generator function — uploaded files are silently ignored by this path

### 3.4 Legal / readiness docs (will, POA, medical POA, etc.) — Path D

All 25 generators in `template-flow.js` follow the same shape:
```js
function generateX(d) {
  return { title: '...', sections: [
    { heading: 'Heading', content: 'Fixed prose ' + d.field + ' more prose' },
    ...
    { heading: 'IMPORTANT DISCLAIMER', content: 'This document was generated as a starting template...' }
  ]};
}
```

- Each generator hard-codes an `IMPORTANT DISCLAIMER` section at the bottom
- Each generator also relies on the downstream `legal-docx-generator.js` to add `buildNoticeSection()` / `buildCareerNoticeSection()` at the top
- Each specific builder in `legal-docx-generator.js` ALSO inserts its own inline `boldPara(D, 'TEMPLATE NOTICE: ...')` at the top of the form content

Result: every single legal document contains **THREE independent disclaimer blocks** — `TEMPLATE NOTICE:` inline, `IMPORTANT NOTICE` section, and `IMPORTANT DISCLAIMER` body-closing section. Plus a fourth if the user counts the red "DRAFT TEMPLATE — NOT LEGAL ADVICE" docx page header.

### 3.5 Grade sheet

| Document | Accuracy | Completeness | Formatting | Placeholder leak | Repeated notices | Header-only? | Used context? |
|---|---|---|---|---|---|---|---|
| Resume (Path B) | F | F | C | YES — [PHONE], [EMAIL], [AMOUNT] | 2 blocks in body | NO — notice is in body | Partial (6 fields only) |
| Resume (Path A) | D | D | C | Possible per system prompt | 1 block | N/A (plain text) | Very shallow |
| Resume (Path D) | F | F | D | d.fullName/etc can be empty strings | 1 inline notice | NO | NONE |
| Will (Path A) | D | D | C | Possible | 1 in AI body | N/A | Shallow |
| Will (Path D) | D | C | C | d.fullName etc | 3 blocks | NO | NONE |
| POA (Path D) | D | C | C | similar | 3 blocks | NO | NONE |
| Any Legal docx (Path E) | D | C | C | [BRACKETED] fields throughout | 3 blocks | NO | NONE |

---

## PART 4 — CONTEXT USAGE AUDIT

This is the single most damning section.

### 4.1 What context exists in the system

`window.AIOS._dashboardContext` is populated by `_loadDashboardContext()` (`app.js:1101-1220`) with:
- `missions[]` — active missions with step/blocker
- `checklist` — counts + first 10 items
- `reports[]` — first 5 reports
- `generatedDocs[]` — first 10 prior template_outputs (type/title/createdAt only — **not content**)
- `uploadedDocs[]` — first 10 uploads with `extracted_text`

`AIOS.Memory.profile` stores: `name`, `branch`, `rank`, `mos`, `serviceEntryDate`, `separationDate`, `state`, `vaRating`, `employmentStatus`, `goals[]`, plus a handful of chat-extracted keys.

### 4.2 What each document path ACTUALLY reads

| Path | Uploaded docs | Dashboard state | Saved memory | Prior generated outputs | Session chat history |
|---|---|---|---|---|---|
| A — chat template engine | NO | NO | profile display_name/branch/rank/mos/years/goals only | NO | NO (only the template-screen conversation, which starts empty) |
| B — typed resume | 6 fields via regex-mining of `extracted_text` | NO (loaded but unused beyond the mining trigger) | getProfile() for 13 fields | NO | YES — scrapes `conversationHistory` with three regexes for `targetRole`, `skills`, `education` |
| C — voice non-resume | NO (Realtime session's own transcript only) | NO | NO | NO | YES (the Realtime session) |
| C — voice resume fork | same as B | same as B | same as B | NO | partial |
| D — template-flow.html | `uploadedFileText` captured but never passed into any generator | NO | NO | NO | NO |

**Conclusion on Hypothesis A:**

> Hypothesis A: AIOS is NOT fully reviewing dashboard state, uploaded files, saved documents, or prior chat/session context before generating documents.

**CONFIRMED.** With one asterisk: Path B mines **six fields** from uploaded docs (branch, name, rank, MOS, entry date, sep date). That is the entirety of "uploaded-document context usage" in the whole product. Nothing else. Prior generated documents are never re-ingested anywhere. Dashboard state is never read by any generator. Session chat history is scraped by three regexes in Path B and is entirely ignored by the other three paths.

### 4.3 The "we pass context to the AI" illusion

`_loadDashboardContext()` stores context on `window.AIOS._dashboardContext`, and comments at line 1090 claim "RequestBuilder injects it into every system prompt." That is the chat endpoint, not the document generators. Path B bypasses the AI entirely. Path D bypasses the AI entirely. Path A opens a fresh template chat with its own system prompt and only 6 profile fields in `contextMsg`. The dashboard context never reaches the document generators.

### 4.4 Specific context-ingestion failures identified

| Field | Available in system | Used by doc generators? |
|---|---|---|
| User email (Supabase auth) | YES | NO — resume prints `[EMAIL]` literal |
| User phone | NO (never collected) | NO — resume prints `[PHONE]` literal |
| User full name | YES (profile.name + auth user) | Partial — Path B uses profile.name; Paths A/C/D rely on form input |
| Uploaded DD-214 extracted text | YES | Only 6 fields mined in Path B |
| Uploaded resume extracted text | YES (stored) | NO — never parsed for work history |
| Prior `generatedDocs[]` content | NO — only type/title/createdAt are loaded; content field is not fetched | NO |
| Checklist progress | YES | NO |
| Active missions and blockers | YES | NO |
| Prior AI reports | YES (title only) | NO |
| Dashboard state snapshot | YES | NO |
| Chat conversationHistory | YES | Only in Path B via 3 regex matches |

**Verdict:** The system collects context. The document generators do not use it. This is a plumbing failure, not a model failure.

---

## PART 5 — BUTTON / SAVE / RETRIEVAL AUDIT

### 5.1 Button inventory

| Button / trigger | File | Target | Status |
|---|---|---|---|
| `document-templates.html` card link | HTML | `/template-flow.html?id=X` | Works — but enters Path D |
| `template-flow.html` "Generate Document" submit | template-flow.js:125 | `generateDocument()` | Works — Path D |
| Checklist "Start Task" | app.js → template-engine.launchTemplate | Path A | Works — opens template chat |
| "Download as Text" in template-engine | template-engine.js:1249 | `.txt` download | Works — but only `.txt`, no `.docx` from this path |
| "Copy to Clipboard" in template-engine | 1262 | navigator.clipboard | Works |
| "Improve / Create Another Version" | 1273 | `iterateTemplate()` | Works — re-opens chat, but does NOT re-trigger save; iterations are not re-saved |
| Typed "build my resume" | app.js:3462 | Path B | Works end-to-end mechanically; output is defective |
| Voice "build my resume" | app.js:3042-3068 | Path B via `endVoiceSession()` fork | Race-prone; works most of the time |
| Voice "build my will" | app.js:3071 | Generic prompt into sendToAI | Produces whatever the AI freeform returns; no save, no .docx |
| Dashboard "Generated Documents" page | profile.html → auth.loadGeneratedDocuments | Loads Supabase `template_outputs` rows | Works — but shows whatever text was saved by each path, which is inconsistent |
| "Delete AI document" | auth.js:575 | `template_outputs` delete | Works |

### 5.2 Save behavior

Three distinct save functions exist, all targeting the same `template_outputs` table with different payload shapes:

1. `template-engine.js:1176` — saves `{template_type, title, content, metadata:{conversation_length, generated_at}}` where `content` is the last AI message as plain text.
2. `app.js:3895-3906` — saves `{template_type:'resume-builder', title, content:result.contentText, metadata:{source:'template_driven', action, prefilled_fields, generated_at}}` where `contentText` is a HAND-BUILT MARKDOWN SUMMARY assembled at `legal-docx-generator.js:1801-1809` that is **structurally different** from the .docx content.
3. `template-flow.js:1029` — saves something else again (different metadata).

**Result:** The dashboard "Generated Documents" list is a heterogeneous pile of artifacts. A resume saved via typed chat will look different from a resume saved via `template-flow.html`. A resume saved via checklist button will look different from both. There is no single source of truth.

### 5.3 Re-open / retrieval fidelity

`auth.js:536-566` loads `template_outputs` rows. The client shows `content` as plain text. **There is no re-hydration path** — the saved string is treated as the full artifact. Which means:

- If a user re-opens a Path B resume, they see the truncated markdown summary **NOT the .docx they downloaded**.
- If a user re-opens a Path A `.txt` resume, they see the last AI message only.
- If a user re-opens a Path D resume, they see whatever `buildOutput()` returned, serialized.
- If any path stored content with a completion marker or a system prompt prefix, it is in the database verbatim.

**The saved version and the downloaded version of the same "resume generation" event are different files with different content.** The dashboard lies to the user about what they generated.

### 5.4 Reopen-parity test result

Based on code inspection alone (no live test needed):

| Document generation → saved content comparison | Matches downloaded artifact? |
|---|---|
| Path A (.txt download vs saved content) | YES — both are the last AI message |
| Path B (.docx download vs saved markdown) | **NO — completely different content** |
| Path D (no .docx from template-flow.js in the core path; `legal-docx-generator.js` optionally called — save content matches sections) | Partial |

---

## PART 6 — ROOT CAUSE ANALYSIS (ranked by severity × confidence)

### R1 — Literal placeholder strings in template code (CRITICAL, 100% confidence)
`legal-docx-generator.js` writes `[PHONE]`, `[EMAIL]`, `[AMOUNT]`, `[ADD YOUR SPECIFIC ACCOMPLISHMENTS — ...]`, and `[LIST RELEVANT CERTIFICATIONS ...]` directly into the Word document via `para(D, 'Phone: [PHONE] | Email: [EMAIL]')`. These are not template variables. They are literal strings. No data flow can ever fill them.

**Fix scope:** Code change in 20+ `buildX` builders. Touches `legal-docx-generator.js` and a profile schema extension.

### R2 — No post-generation QA / verification pass (CRITICAL, 100% confidence)
No path runs a scan for residual placeholders, unfilled brackets, empty sections, or duplicated notices before saving or downloading. The "[pending]" and placeholder-guard logic added to the RIL layer in Phase E does NOT run on template-engine / legal-docx-generator / template-flow outputs. It only runs on chat text responses.

**Fix scope:** Add a `validateGeneratedDocument()` pass that scans for `/\[[A-Z][A-Z0-9 _\-]+\]/`, `/\[NOT PROVIDED\]/`, and `/\[pending\]/` and refuses to save or download until resolved or user-acknowledged.

### R3 — Disclaimer triplication across independent layers (HIGH, 100% confidence)
Every legal docx has (a) a red docx header band, (b) a `buildNoticeSection()` / `buildCareerNoticeSection()` / `buildFinancialNoticeSection()` block as first body paragraph, (c) an inline `boldPara(D, 'TEMPLATE NOTICE: ...')` at the top of the form content, and (d) sometimes a closing `IMPORTANT DISCLAIMER` body section added by `template-flow.js`. These four layers do not know about each other.

User's explicit rule: notice exists in header only, should not repeat. **Rule is violated on every generation.**

**Fix scope:** Delete the inline `boldPara` TEMPLATE NOTICE from every builder. Move the notice from body into an actual docx Header construct. Remove `IMPORTANT DISCLAIMER` from template-flow.js generators.

### R4 — Context-ingestion is opt-in and shallow (HIGH, 100% confidence)
`_loadDashboardContext()` fires on login and stores a rich context object — but the document generators never read it. Path B reads six profile fields. Path A reads six profile fields. Paths C/D read nothing. Prior generated documents and chat history are essentially unused.

**Fix scope:** Introduce a `DocumentContextBuilder` module that every path must call before generation. Responsibilities: merge profile + uploaded extracted_text + generated docs content + current chat summary into one structured object. Every generator reads from that object.

### R5 — Four independent generation paths with no shared data model (HIGH, 100% confidence)
`template-engine.js`, `template-flow.js`, `legal-docx-generator.js`, `app.js` `_buildResumeData` all implement document generation independently. No shared schema, no shared generator, no shared save shape. Phase F/G did not touch any of this.

**Fix scope:** Consolidate into one generator with path-specific adapters. Long-term refactor.

### R6 — `extractTemplateOutput()` truncates multi-message AI output (MEDIUM, 100% confidence)
`template-engine.js:1159` only grabs the last assistant message. If the AI sent the resume across two messages, the earlier part is silently discarded.

**Fix scope:** Walk the conversation backward and concatenate assistant messages until the completion marker is found.

### R7 — `.docx` vs saved-content divergence (HIGH, 100% confidence)
`generateFromData` returns `{fileName, blob, contentText}` where `contentText` is a minimal, hand-built markdown string in `legal-docx-generator.js:1801-1809` that omits most of the `.docx` body. The user downloads the .docx and the system saves the markdown. Re-opening from the dashboard is misleading.

**Fix scope:** Save the same structured source-of-truth for both; regenerate the .docx from the stored version on download.

### R8 — Voice non-resume path has no template at all (HIGH, 100% confidence)
`app.js:3071` dumps a generic "Generate the requested document now in full using all context from our conversation" prompt into `sendToAI` for every non-resume voice doc request. There is no structure. The AI's chat response is shown inline. No save, no .docx, no verification.

**Fix scope:** Route voice non-resume intents through Path A or a new voice-to-template flow.

### R9 — `uploadedFileText` captured in `template-flow.js` but never used in generators (MEDIUM, 100% confidence)
Line 11 declares `var uploadedFileText = '';`. Grep shows it is assigned on upload but never read inside any `generateX(d)` function. The user can upload a DD-214 to the intake form and the system ignores it silently.

**Fix scope:** Pass `uploadedFileText` to each generator and expose it in `d`.

### R10 — System prompt telling the AI to use placeholders when data is missing (MEDIUM, 100% confidence)
`template-engine.js:45-47` (resume template): "NAME + CONTACT (use placeholder if not provided)". The system prompt is literally instructing the model to emit placeholders. Then the save function trusts the output.

**Fix scope:** Rewrite system prompts to ask the user for missing info in-chat instead of emitting placeholders.

### R11 — No email / phone in profile schema (MEDIUM, 100% confidence)
The resume generator prints `[PHONE]` / `[EMAIL]` because no phone/email field exists in `AIOS.Memory.profile` or `_buildResumeData`. The user's email is in Supabase auth but is never forwarded to the generator.

**Fix scope:** Extend profile schema, collect phone during onboarding, pull email from Supabase auth.

---

## PART 7 — COMPARISON TO PRIOR SYSTEM WORK

### 7.1 What Phases A–G actually fixed

| Phase | Scope | Touched document generation? |
|---|---|---|
| Routing / Intent phases | `app.js` router, `router.js` | NO |
| Memory / Phase 12-19 | `memory-manager.js`, `profile`, extraction | Indirectly — added fields that the generators don't use |
| Phase 35-36 voice | Realtime voice wiring | NO |
| RIL (Phase E) | `response-shaper.js`, `response-catalog.js` | NO — only chat text responses |
| Phase F — catalog UX fixes | `response-catalog.js` content edits | NO |
| Phase G — production hardening | `aios-engine.js`, `response-shaper.js`, `memory-manager.js`, `app.js` logs + VERSION tag | NO |

**None of the last 7 phases touched `template-engine.js`, `template-flow.js`, or `legal-docx-generator.js`.** Zero commits. Zero edits. The `[AIOS][RIL]` hardening work made chat responses more deterministic and cleaner; it did nothing for the document generators.

### 7.2 What prior audits claimed vs reality

- **FINAL-PRODUCTION-AUDIT.md** exists in the workspace. Its claims about document generation are built on router/RIL instrumentation, not on opening a generated .docx.
- **AIOS_FUNCTIONAL_AUDIT.md** exists. Same pattern.
- **MAXIMAL_SYSTEM_AUDIT.md** exists. Same pattern.

These audits produced "READY FOR PRODUCTION" verdicts for the chat pipeline. They were **correct for chat**. They created **false confidence** by carrying the verdict over to the document engine, which was never under test.

### 7.3 Intended end-state vs actual state for doc generation

Intended (stated and implied by prior planning):
- Accurate, personalized documents
- Context-aware (uploads, profile, dashboard, history)
- Low placeholder leakage
- Self-consistent across paths
- Retrievable fidelity (what you see in dashboard is what you downloaded)
- Usable by real veterans without attorney-level rewriting

Actual:
- Resume: literal `[PHONE]` `[EMAIL]` `[AMOUNT]` placeholders in body
- Context: six fields mined from uploaded docs, nothing else
- Placeholder leakage: pervasive, by design
- Four paths, four output shapes, not self-consistent
- Saved content ≠ downloaded file in the primary resume path
- Requires heavy rewriting before any real use

### 7.4 What earlier audits got right
- Router correctness
- Memory persistence to Supabase
- RIL tone gating and slot discipline
- Log standardization
- Feature flag control

### 7.5 What earlier audits missed
- They never opened a generated `.docx`
- They never diffed the saved content against the downloaded file
- They never greps for `[PHONE]` / `[EMAIL]` in the codebase
- They never counted disclaimer duplications per generated document
- They never asked whether `_loadDashboardContext()` was actually being read by generators
- They trusted that "template-driven" means "template-filled with data"

### 7.6 Human-auditor difference vs AI-led audit
A human auditor would have done ONE thing that the AI-led audits did not: **generate a resume in the product, open the .docx, and read it.** They would have found `[PHONE]` in the first line. The entire audit tree would have pivoted on that single artifact inspection. The AI-led audits instrumented the scaffolding around the generator and declared the generator healthy because the scaffolding reported healthy.

---

## PART 8 — HUMAN-STYLE AUDIT FINDINGS

- **What is broken:** Every document generator in the product is broken for the "context-aware personalized document" use case. The resume generator is broken in the most visible and concrete way: it prints `[PHONE]` on line 2 of every resume.

- **What is deceptively passing:** The chat pipeline. RIL works. Memory persists. Router routes. Logs are clean. The Phase F/G work IS real and DID land. This is why the product feels "almost there" — because one half of it really is almost there. The other half is not.

- **What is fast but inaccurate:** The typed-resume fork. Users see a .docx download within 1-2 seconds of asking. It feels magical. Then they open it and see `[PHONE] | [EMAIL]` and generic bullets. The speed is the fingerprint of the problem: it's fast because no AI round-trip or context ingestion is happening.

- **What appears complete but is actually unusable:** Legal / readiness documents via Path D. They look long. They have sections. They have `IMPORTANT DISCLAIMER` footers that feel professional. They contain TEMPLATE NOTICE at the top, IMPORTANT NOTICE as first body, and IMPORTANT DISCLAIMER at the bottom. A veteran who prints one and tries to use it as a Will will be holding a document with three disclaimers and fifteen `[BRACKETED]` fields telling them to write their own content.

- **What gave false confidence in earlier cycles:** The router-first auditing mindset. Once the router correctly detected "user wants a resume" and called `_handleResumeGeneration`, the test was marked PASS. The test never verified that the generated artifact was correct.

- **What a tough auditor would say:** "Stop shipping until someone opens the file."

- **What the codebase tells me about institutional habit:** The team has a strong bias toward scaffolding and plumbing (routing, memory, state, flags) over artifact quality. Every phase has been about what happens BEFORE the document is built. Nothing has been about what happens AFTER the document is built.

---

## PART 9 — DEFECT LIST

Numbering continues from Phase F/G style.

### DEFECT-G+01 — Literal `[PHONE]` in every generated resume
- **Severity:** CRITICAL
- **Repro:** Any path that reaches `buildResumeFromData` in `legal-docx-generator.js:1642` — typed or voice "build my resume"
- **Expected:** Resume shows user's phone or nothing at all
- **Actual:** Resume contact line is `state | Phone: [PHONE] | Email: [EMAIL]` verbatim
- **Root cause:** R1 — hardcoded string
- **Fix scope:** Code. Add phone/email to profile and `_buildResumeData`. Change the literal to a variable.

### DEFECT-G+02 — Literal `[EMAIL]` in every generated resume
- **Severity:** CRITICAL
- **Repro:** same as G+01
- **Expected:** User's email from Supabase auth
- **Actual:** Literal `[EMAIL]` token
- **Root cause:** R1 + R11
- **Fix scope:** Code. Pull `AAAI.auth.getUser().email` into `_buildResumeData`.

### DEFECT-G+03 — Literal `$[AMOUNT]` in experience bullet
- **Severity:** CRITICAL
- **Repro:** `buildResumeFromData` line 1710 — fires on every resume
- **Expected:** Either a real number or the bullet is omitted
- **Actual:** "Maintained accountability for equipment and resources valued at $[AMOUNT]"
- **Root cause:** R1
- **Fix scope:** Code. Remove the bullet or make it conditional on a real `equipmentValue` field.

### DEFECT-G+04 — Hardcoded generic experience bullets shared across all veterans
- **Severity:** HIGH
- **Repro:** Every Path B resume. Lines 1700-1707.
- **Expected:** Experience bullets derived from veteran's actual role and uploaded DD-214
- **Actual:** Same three hardcoded bullets for every single veteran, regardless of MOS, rank, or background
- **Root cause:** R1 + R4 (no context ingestion)
- **Fix scope:** Code + context plumbing. Requires a real MOS → civilian translation layer and/or AI generation with context.

### DEFECT-G+05 — `[ADD YOUR SPECIFIC ACCOMPLISHMENTS — ...]` literal in body
- **Severity:** CRITICAL
- **Repro:** `buildResumeFromData` line 1714
- **Expected:** This is a self-directed instruction. It should never reach the user's document.
- **Actual:** Printed verbatim as the fourth bullet of every resume's Professional Experience section
- **Root cause:** R1
- **Fix scope:** Delete the line.

### DEFECT-G+06 — `[LIST RELEVANT CERTIFICATIONS AND MILITARY TRAINING ...]` literal
- **Severity:** CRITICAL
- **Repro:** line 1723
- **Expected:** Either actual certifications or the section is omitted
- **Actual:** Literal instruction-to-self printed in body
- **Root cause:** R1
- **Fix scope:** Delete the line or gate on `data.certifications`.

### DEFECT-G+07 — Disclaimer triplication in every legal docx
- **Severity:** HIGH
- **Repro:** Any generation that goes through `legal-docx-generator.js` buildX function with a `buildCareerNoticeSection` / `buildNoticeSection` / `buildFinancialNoticeSection` prefix
- **Expected:** Notice exists in header only (user's explicit rule)
- **Actual:** Notice appears in (a) red header band, (b) body section first paragraph, (c) inline `TEMPLATE NOTICE:` bold paragraph in the form content, and sometimes (d) a closing `IMPORTANT DISCLAIMER` section from `template-flow.js`
- **Root cause:** R3
- **Fix scope:** Delete inline `boldPara` TEMPLATE NOTICE from every builder (20+ call sites). Move `NOTICE_LINES` into an actual `D.Header` construct. Delete closing IMPORTANT DISCLAIMER from `template-flow.js` generators.

### DEFECT-G+08 — Uploaded files ignored in Path D (template-flow.html)
- **Severity:** HIGH
- **Repro:** Go to `/template-flow.html?id=resume-builder`, upload a DD-214, fill the form, generate
- **Expected:** DD-214 data (name, branch, rank, MOS, dates) populates the generator automatically
- **Actual:** `uploadedFileText` variable captures the text but is never read by any `generateX` function. The upload is a no-op.
- **Root cause:** R4 + R9
- **Fix scope:** Code. Pass `uploadedFileText` into the generator signature and mine it the same way Path B does.

### DEFECT-G+09 — Path A saves only the last AI message, discarding earlier output
- **Severity:** MEDIUM
- **Repro:** Use a chat-driven template where the AI output is long enough to span two assistant turns
- **Expected:** The full document is saved
- **Actual:** `extractTemplateOutput` at line 1159 grabs only the last assistant message; the earlier half is discarded silently
- **Root cause:** R6
- **Fix scope:** Code. Walk backward and concatenate until the completion marker is found.

### DEFECT-G+10 — Saved resume content ≠ downloaded .docx
- **Severity:** HIGH
- **Repro:** "Build my resume" → open Generated Documents page → click the resume → compare to the downloaded .docx
- **Expected:** The saved version matches what was downloaded
- **Actual:** The saved `contentText` (built at `legal-docx-generator.js:1801`) is a 6-line markdown summary. The .docx has 30+ lines with three disclaimers, experience bullets, education, certifications, resume tips.
- **Root cause:** R7
- **Fix scope:** Code. Save the structured data and regenerate the .docx on open, or save the full text representation.

### DEFECT-G+11 — `_loadDashboardContext()` never reaches generators
- **Severity:** HIGH
- **Repro:** Inspect `_loadDashboardContext()` at `app.js:1101`, note it populates `window.AIOS._dashboardContext`, then grep for reads in `template-engine.js` / `template-flow.js` / `legal-docx-generator.js` / `_buildResumeData`
- **Expected:** Generators read dashboard state
- **Actual:** `_dashboardContext` is read in exactly one place — `_mineUploadedDocsForProfile`'s entry condition — and only for the `uploadedDocs` array, for six regex-based field mines
- **Root cause:** R4
- **Fix scope:** Architecture. New `DocumentContextBuilder` module.

### DEFECT-G+12 — Prior generated documents are never re-ingested
- **Severity:** MEDIUM
- **Repro:** Generate a will, then generate a POA. The POA does not see the will.
- **Expected:** Later documents reference context from earlier ones (e.g., agent name carries forward)
- **Actual:** `_loadDashboardContext` loads `generatedDocs[]` with type+title only. `content` is never fetched. No generator reads this list.
- **Root cause:** R4
- **Fix scope:** Code + Supabase query. Fetch `content` for generatedDocs and pass into DocumentContextBuilder.

### DEFECT-G+13 — No post-generation verification pass anywhere
- **Severity:** CRITICAL
- **Repro:** Every path
- **Expected:** Before saving, the system scans for unresolved placeholders, instructions-to-self, empty sections, and duplicate notices
- **Actual:** No such scan exists. Output is trusted verbatim.
- **Root cause:** R2
- **Fix scope:** New module `validateGeneratedDocument(doc)` that runs on every save and download. On placeholder detection: fail loudly, surface the missing fields to the user, do not save.

### DEFECT-G+14 — Voice non-resume "generation" is freeform AI chat only
- **Severity:** HIGH
- **Repro:** Say "write me a will" in voice mode
- **Expected:** Structured document that gets saved and downloaded
- **Actual:** `app.js:3071` dumps `"The veteran just asked via voice: <transcript>. Generate the requested document now in full using all context from our conversation. Use proper headings and formatting."` into `sendToAI()`. The AI response is shown inline in chat. No .docx, no save, no template.
- **Root cause:** R8
- **Fix scope:** Route voice non-resume doc requests through Path A (template engine) or a new voice-template flow.

### DEFECT-G+15 — Path A system prompts tell the AI to emit placeholders
- **Severity:** HIGH
- **Repro:** `template-engine.js:46-47` resume template: "NAME + CONTACT (use placeholder if not provided)"
- **Expected:** System prompt tells the AI to ask, not emit placeholders
- **Actual:** The AI is explicitly instructed to use placeholders, then the save function trusts the output
- **Root cause:** R10
- **Fix scope:** Rewrite system prompts across the 18 templates.

### DEFECT-G+16 — Three independent save paths to `template_outputs` with incompatible shapes
- **Severity:** MEDIUM
- **Repro:** Compare rows in `template_outputs` saved by (a) `template-engine.js:1180`, (b) `app.js:3906`, (c) `template-flow.js:1029`
- **Expected:** One consistent row shape per `template_type`
- **Actual:** Three different shapes, three different metadata schemas, three different content formats
- **Root cause:** R5
- **Fix scope:** Normalize save schema via a shared writer.

### DEFECT-G+17 — `_mineUploadedDocsForProfile` extracts only six fields
- **Severity:** MEDIUM
- **Repro:** Upload a DD-214 containing decorations, units, training, awards
- **Expected:** All relevant fields populate the profile
- **Actual:** Only branch, name, rank, MOS, entry date, sep date are mined
- **Root cause:** R4
- **Fix scope:** Extend the mining regex set to cover unit, awards, decorations, education on DD-214 Item 14, training, etc.

### DEFECT-G+18 — No phone field in profile schema
- **Severity:** MEDIUM (enabler for G+01)
- **Repro:** Inspect profile schema; `phone` does not exist
- **Expected:** Phone is collected during onboarding or the resume generator prompts for it
- **Actual:** Profile has no phone field; resume generator prints literal `[PHONE]`
- **Root cause:** R11
- **Fix scope:** Schema + onboarding flow.

### DEFECT-G+19 — No email field propagation from Supabase auth to profile
- **Severity:** MEDIUM
- **Repro:** Supabase auth holds the email; `AIOS.Memory.profile` does not expose it; `_buildResumeData` does not read it
- **Expected:** Email plumbed through to generators
- **Actual:** Literal `[EMAIL]` in output
- **Root cause:** R11
- **Fix scope:** One-liner in `_buildResumeData`: `email: (window.AAAI && AAAI.auth && AAAI.auth.getUser && AAAI.auth.getUser()?.email) || _ph`

### DEFECT-G+20 — Cover letter template does not exist anywhere
- **Severity:** MEDIUM (completeness gap)
- **Repro:** Ask for a cover letter in any path
- **Expected:** Cover letter exists as a template
- **Actual:** No template in `template-engine.js` registry, no generator in `template-flow.js`, no builder in `legal-docx-generator.js`. Falls back to AI freeform chat.
- **Fix scope:** Add the template.

---

## PART 10 — EXECUTIVE VERDICT

### Is document generation production-ready?
**NO.** It is acceptable for the chat-response pipeline but unacceptable for any user who will actually open a generated document. The resume generator alone has five CRITICAL placeholder-leak defects visible on the first page of every output. Real veterans will see `[PHONE]` on line 2 of their resume.

### Is it using context well enough?
**NO.** Six fields are mined from uploaded DD-214s. Nothing else from the available context — dashboard state, prior generated documents, chat history, mission context — is used by any generator. The `_loadDashboardContext()` machinery is plumbing that dead-ends before it reaches the document builders.

### Is voice generation usable?
**NO.** For resumes, voice forks to the same broken Path B. For everything else, voice dumps a generic prompt into the chat endpoint and shows the AI response inline. No save. No .docx. No structure. It is not a document generation path — it is a chat conversation in voice clothing.

### Are saved documents trustworthy?
**NO.** In the primary resume flow, the saved content and the downloaded .docx are structurally different files. The dashboard shows the user a markdown summary; the downloaded .docx has three disclaimers, hardcoded bullets, and literal placeholders. Reopening a document from the dashboard does not show the user what they generated.

### What must be fixed before real users rely on this?
In order of stop-the-line priority:

1. **DEFECT-G+01 through G+06 and G+13** — remove every hardcoded `[BRACKET]` placeholder from `legal-docx-generator.js` buildX functions; add `validateGeneratedDocument` that refuses to save anything containing `/\[[A-Z][A-Z0-9 _\-]+\]/` or `/\[NOT PROVIDED\]/`.

2. **DEFECT-G+18 and G+19** — plumb phone/email into the profile and into `_buildResumeData`. Without this, G+01/G+02 cannot be fixed.

3. **DEFECT-G+07** — collapse the disclaimer triplication. One notice in the actual docx Header construct, zero in body.

4. **DEFECT-G+10** — make saved content match downloaded content. Either save structured data and regenerate on download, or serialize the full docx text.

5. **DEFECT-G+11 and G+12** — build `DocumentContextBuilder` that reads uploadedDocs, generatedDocs content, dashboard state, chat summary — and force every generator to call it.

6. **DEFECT-G+14** — give voice non-resume requests a real template path.

7. **DEFECT-G+17** — extend DD-214 mining regexes.

8. **DEFECT-G+15 and G+20** — rewrite Path A system prompts; add missing templates.

9. **DEFECT-G+16** — consolidate save paths into one writer.

### Hypothesis verdicts

- **Hypothesis A** (AIOS is NOT fully reviewing dashboard state, uploaded files, saved documents, or prior chat/session context before generating documents): **CONFIRMED.** Six fields mined from uploads in one path; zero context ingestion in the other three.

- **Hypothesis B** (AIOS generates templates quickly but does not run a completion/verification pass before finalizing or saving): **CONFIRMED.** No validation layer anywhere. Output is saved verbatim.

- **Hypothesis C** (Document generation paths are inconsistent across voice, text, template page, button-based, saved retrieval): **CONFIRMED.** Four independent paths, four output formats, three incompatible save shapes, one path's saved content differs from its own downloaded artifact.

### Bottom line

Prior audits established that the chat pipeline is sound and the Phase F/G hardening was real. **Those audits do not transfer to the document engine.** The document engine has been sitting in a blind spot the entire time. Phase G+ is not about "polishing" — it is about fixing a feature that, upon honest inspection, does not actually do what it advertises.

Ship the chat pipeline. Do not ship the document generator. Fix the generator, then re-audit with a manual step: open the file.

---

## APPENDIX A — Evidence index

| Finding | File | Lines |
|---|---|---|
| Literal `[PHONE]` in resume | `js/legal-docx-generator.js` | 783, 913, 1043, 1683 |
| Literal `[EMAIL]` in resume | `js/legal-docx-generator.js` | 914, 1683 |
| Literal `$[AMOUNT]` in resume | `js/legal-docx-generator.js` | 1225, 1232-1237, 1252-1254, 1293-1297, 1356, 1375, 1710 |
| `[NOT PROVIDED]` fallback token | `js/app.js` | 3666; `js/legal-docx-generator.js` 1643 |
| Triple notice assembly | `js/legal-docx-generator.js` | 1765-1785 (notice + body for resume); 287, 367, 452, 537, 689, 772, 840, 906, 968, 1035, 1102, 1155, 1217, 1278, 1347, 1414, 1474, 1527, 1595, 1818, 1867 (inline TEMPLATE NOTICE in every builder) |
| `_loadDashboardContext` → never read by generators | `js/app.js` | 1101-1220 |
| `_mineUploadedDocsForProfile` = only 6 fields | `js/app.js` | 568-630 |
| `_buildResumeData` = 13 fields, no phone/email | `js/app.js` | 3661-3724 |
| Path A save (last AI message only) | `js/template-engine.js` | 1159-1195 |
| Path B save (divergent contentText) | `js/app.js` | 3895-3906 + `js/legal-docx-generator.js` 1801-1809 |
| Path D save | `js/template-flow.js` | 1029 |
| Voice non-resume fork to AI freeform | `js/app.js` | 3069-3073 |
| System prompt tells AI to use placeholders | `js/template-engine.js` | 46-47 |
| `uploadedFileText` declared but unused | `js/template-flow.js` | 11 + every `generateX(d)` |
| `extractTemplateOutput` takes last message only | `js/template-engine.js` | 1159-1174 |

## APPENDIX B — What this audit did NOT do (limits of the current audit)

- No live browser test — no generated artifact was opened with a Word viewer. The findings above are derived from source. A live artifact inspection would likely produce additional visual-fidelity defects (spacing, font, header band color rendering, etc.).
- No Supabase row inspection — the exact shape of saved `template_outputs` rows was inferred from the three distinct save functions rather than queried.
- No timing / perceived-latency tests — the user reports "fast" and the code confirms this is because the template paths bypass the AI; no numeric latency measurements were taken.
- No multi-user regression — the audit assumes the defects apply to all veterans; a single tenant variation could shift severity, but the root causes are in static template code and apply identically to every user.
- No screenshots — this audit is text-only. The recommended next step before shipping any fix is a manual generate-and-open pass for every template type.

End of Phase G+ audit.
