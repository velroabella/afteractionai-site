# AfterAction AI — Legal & Privacy Policy Audit
**Date:** March 2026
**Scope:** Privacy Policy, Terms of Service, Disclaimer — accuracy, FTC compliance, state law alignment

---

## SECTION 1 — AUDIT FINDINGS SUMMARY

| ID | Severity | Document | Issue | Status |
|----|----------|----------|-------|--------|
| LA-01 | CRITICAL | Privacy Policy | False claim: "We use Google Analytics" | ❌ Not fixed |
| LA-02 | CRITICAL | Privacy Policy | False claim: documents "deleted within 24 hours" | ❌ Not fixed |
| LA-03 | HIGH | Privacy Policy | AI providers not named (FTC disclosure requirement) | ❌ Not fixed |
| LA-04 | HIGH | Privacy Policy | conversation_history storage not disclosed | ❌ Not fixed |
| LA-05 | HIGH | Privacy Policy | Data retention table missing / inaccurate | ❌ Not fixed |
| LA-06 | HIGH | Privacy Policy | Attorney review notice publicly visible | ❌ Not fixed |
| LA-07 | MEDIUM | Privacy Policy | AI data retention claims not verified against provider terms | ❌ Not fixed |
| LA-08 | MEDIUM | Terms of Service | AI-generated documents described without adequate disclaimer | ❌ Not fixed |
| LA-09 | LOW | Disclaimer | Disclaimer not cross-referenced with corrected privacy terms | ❌ Not fixed |

---

## SECTION 2 — DETAILED FINDINGS

### LA-01 — FALSE CLAIM: Google Analytics [CRITICAL]

**Location:** Privacy Policy, Section 5 (Analytics)
**Current text (approximate):** "We use Google Analytics to collect information about how you use our website."
**Reality:** Google Analytics is NOT present in the codebase. No `gtag.js`, no `analytics.js`, no GA4 measurement ID. The site has zero analytics implementation.
**Legal risk:** Making affirmative false statements about data collection to users is deceptive under the FTC Act Section 5 (15 U.S.C. § 45) and California CPRA. This is not a technicality — it is a materially inaccurate representation about third-party data sharing.
**Fix:** Remove all Google Analytics references entirely. If analytics are added in the future, update the policy before implementation.

---

### LA-02 — FALSE CLAIM: "Documents deleted within 24 hours" [CRITICAL]

**Location:** Privacy Policy, Section 3 or 4 (Document Handling)
**Current text (approximate):** "Uploaded documents are deleted within 24 hours."
**Reality:** Documents are processed **entirely in the browser (client-side)**. They are never transmitted to AfterActionAI.org servers or stored to any disk. The content is read via JavaScript's `FileReader` API, sent to Claude for processing, and the memory is released when the session ends. There is no server-side storage of uploaded documents — and therefore there is nothing to "delete within 24 hours."
**Legal risk:** The current language implies server-side storage exists and is being deleted on a 24-hour schedule. This is a double inaccuracy: (1) it falsely implies data was stored in the first place, and (2) it implies a deletion process that doesn't exist.
**Fix:** Replace with accurate language: "Documents you upload are processed entirely within your browser. Document content is sent to our AI provider (Anthropic Claude) for processing only. Neither AfterActionAI.org nor its servers store the content of your uploaded documents."

---

### LA-03 — AI PROVIDERS NOT DISCLOSED BY NAME [HIGH]

**Location:** Privacy Policy, Section 8 (Third-Party Services / AI Providers)
**Current text (approximate):** "We use third-party AI providers to process your queries."
**Reality:** The platform uses two specific providers:
- **Anthropic Claude** (text AI, all conversation and document processing) — via `/netlify/functions/chat`
- **OpenAI GPT-4o Realtime** (voice AI) — via `/netlify/functions/realtime-token`
**Legal risk:** FTC guidelines on AI disclosure and California AB 2013 (AI transparency) require reasonable disclosure of what AI systems process user data. Naming "third-party AI providers" without identification is insufficient when those providers receive user data including potentially sensitive veteran information.
**Fix:** Name both providers explicitly, link to their privacy policies, and describe what data each receives.

---

### LA-04 — CONVERSATION HISTORY STORAGE NOT DISCLOSED [HIGH]

**Location:** Privacy Policy — not addressed anywhere
**Reality:** `ai_reports.conversation_history` stores the full multi-turn conversation between users and Claude as a JSONB array. This includes anything the user said verbally — which may include SSNs, diagnoses, discharge information, financial data. This data:
- Is stored in Supabase (PostgreSQL) hosted on Supabase.com servers
- Has a 90-day retention target (but was not enforced until 02_schema_upgrade.sql)
- Is associated with the user's account
**Legal risk:** Storing sensitive personal data without disclosure violates multiple state privacy laws including CPRA, Virginia CDPA, Colorado CPA. Veterans sharing sensitive information have a reasonable expectation that if data is stored, they will be told.
**Fix:** Add explicit disclosure of conversation storage: what is stored, where, for how long, and user's right to request deletion.

---

### LA-05 — DATA RETENTION TABLE MISSING / INACCURATE [HIGH]

**Location:** Privacy Policy — no retention table present
**What is actually retained:**

| Data | Storage Location | Retention | User-Deletable? |
|------|-----------------|-----------|-----------------|
| Account credentials | Supabase Auth | Until account deleted | Yes |
| User profile | `profiles` table | Until account deleted | Via account deletion |
| Conversation history | `ai_reports.conversation_history` | 90 days (automated) | Yes (request) |
| AI reports / plans | `ai_reports` | 90 days (automated) | Yes (request) |
| Generated documents | `template_outputs` | 180 days (automated) | Yes (request) |
| VA checklists | `checklist_items` | 365 days (automated) | Yes (request) |
| Newsletter signups | `newsletter_signups` | Indefinite | Yes (unsubscribe) |
| Uploaded documents | Not stored | N/A — browser only | N/A |
| Voice session tokens | Not stored | Ephemeral (15 min) | N/A |

**Fix:** Add this table to Privacy Policy.

---

### LA-06 — ATTORNEY REVIEW NOTICE PUBLICLY VISIBLE [HIGH]

**Location:** `privacy.html` line 167 (approximate)
**Current text:** "Before launching publicly, please have this policy reviewed by a qualified attorney..."
**Impact:** This notice is visible to site visitors. It signals the legal documents are drafts, undermining user trust and potentially voiding reliance on the policy.
**Fix:** Remove immediately. The note was intended for internal review only.

---

### LA-07 — AI PROVIDER DATA RETENTION NOT VERIFIED [MEDIUM]

**Location:** Privacy Policy, AI provider section
**Current claim:** States AI providers don't retain personal data beyond processing (paraphrased).
**Reality:** Anthropic's privacy policy (effective 2024) states that by default, prompts and outputs sent via the API are NOT used for training and ARE NOT retained beyond the API request. However, this should not be stated as an absolute guarantee in our policy — users should be directed to provider policies.
**OpenAI:** Similar policy for API usage — inputs/outputs not used for training by default.
**Fix:** Do not make guarantees on behalf of third-party providers. Instead, state the providers' policies apply and link to them.

---

### LA-08 — TERMS OF SERVICE: AI DOCUMENT DISCLAIMER INADEQUATE [MEDIUM]

**Location:** Terms of Service, section on AI-generated content
**Issue:** The site generates legal templates (Power of Attorney, VA Appeal Letters, etc.) and financial documents. The Terms of Service must explicitly state:
- These are templates only, not legal or financial advice
- The platform is not a law firm and does not provide attorney-client relationships
- Users must consult licensed attorneys before using legal templates
- Templates may not be current for user's jurisdiction
**Fix:** Add explicit AI document disclaimer section to Terms of Service.

---

### LA-09 — DISCLAIMER NOT CROSS-REFERENCED [LOW]

**Location:** Disclaimer page
**Issue:** The disclaimer page exists but does not reference the Privacy Policy for data handling disclosures. In the event of a claim, the disclaimer should cross-reference the complete privacy disclosures.
**Fix:** Minor — add one sentence directing readers to the Privacy Policy.

---

## SECTION 3 — FTC COMPLIANCE CHECKLIST

| Requirement | Status |
|-------------|--------|
| Disclose all data collected | ⚠️ Incomplete (conversation history missing) |
| Name third-party data processors | ❌ Not done (AI providers unnamed) |
| Provide opt-out mechanisms | ⚠️ Partial (no self-service deletion UI) |
| Data retention disclosed | ❌ Not present |
| No materially false statements | ❌ Fails (Google Analytics, 24hr deletion) |
| AI transparency disclosure | ❌ Fails (providers unnamed) |

---

## SECTION 4 — STATE LAW EXPOSURE

**California CPRA** (applies if any CA users — almost certainly yes)
- Right to know what data is collected ✓ (partially met)
- Right to delete ⚠️ (no self-service mechanism)
- Right to correct ⚠️ (profile update only)
- Sensitive data treatment (health, financial) ❌ (conversation_history not classified)

**Virginia CDPA / Colorado CPA** — similar disclosure and opt-out requirements, same gaps

**Note:** This platform handles veteran health data (self-disclosed diagnoses, PTSD disclosures, mental health information) within conversations. While this isn't covered health data under HIPAA (not a covered entity), state privacy laws increasingly treat self-disclosed health data as sensitive data requiring additional disclosure and protection.

---

## SECTION 5 — RECOMMENDED IMMEDIATE ACTIONS

Priority order:

1. **Remove attorney review notice** from privacy.html (30 seconds)
2. **Remove Google Analytics claim** from privacy policy (5 minutes)
3. **Replace 24-hour deletion claim** with accurate browser-processing language (5 minutes)
4. **Name AI providers** — Anthropic and OpenAI — with links to their privacy policies (10 minutes)
5. **Add conversation history disclosure** — what is stored, retention period, deletion rights (10 minutes)
6. **Add data retention table** to Privacy Policy (10 minutes)
7. **Add AI document disclaimer** to Terms of Service (15 minutes)
8. **Add CPRA rights section** to Privacy Policy — right to know, right to delete, right to correct (20 minutes)

Items 1–6 should be completed before any further marketing or user acquisition.
