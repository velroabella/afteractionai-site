# AfterAction AI — Security & Compliance Audit
**Date:** March 2026
**Scope:** Full production audit — security, storage, legal, analytics, data architecture

---

## SECTION 1 — SECURITY AUDIT RESULTS

### CRITICAL

**C-01 — Conversation History Contains Sensitive User Data (Stored Indefinitely)**
- `ai_reports.conversation_history` stores the full multi-turn conversation between the user and Claude
- Users commonly share document contents verbally: SSNs, diagnoses, discharge codes, financial data
- This data has no defined retention period and no deletion mechanism
- **Impact:** Sensitive veteran data exposed indefinitely if database is breached
- **Fix:** Add `expires_at` column, implement 90-day scheduled deletion, strip PII fields before storage

**C-02 — Supabase Client Exposed on `window.AAAI.auth.supabase`**
- auth.js line 514: `supabase` exposed in the public API object
- Any user can open DevTools and execute authenticated Supabase queries as themselves
- If RLS is misconfigured on ANY table, this becomes a direct data breach vector
- **Fix:** Remove `supabase` from the public `window.AAAI.auth` object

---

### HIGH

**H-01 — Supabase RLS Policies Not Verified**
- All client-side queries manually filter by `user_id` (correct practice)
- However, RLS enforcement must be confirmed at the database level — code review alone is insufficient
- If RLS is disabled on any table, any authenticated user can read all rows
- **Fix:** Run RLS verification SQL (see 02_schema_upgrade.sql). Confirm all tables have RLS enabled.

**H-02 — Privacy Policy Contains Materially Inaccurate Statements**
- "We use Google Analytics" — **Google Analytics is not implemented in the codebase**
- "Uploaded documents deleted within 24 hours" — **documents are processed in-browser, never stored to disk** — the statement implies server-side storage that doesn't exist
- "AI providers don't retain personal data beyond processing" — Anthropic and OpenAI have their own data policies; this claim requires verification per their terms
- **Fix:** Update privacy policy (see Section 4 below)

**H-03 — No Formal Data Retention Enforcement**
- `ai_reports`, `checklist_items`, `template_outputs`, `newsletter_signups` have no `expires_at` column
- No scheduled deletion jobs exist
- Policy says 90 days for PII — implementation does not enforce this
- **Fix:** Add `expires_at` columns and pg_cron or Netlify scheduled function for deletion

**H-04 — AI Provider Names Not Disclosed**
- Privacy policy says "third-party AI providers" without naming them
- Platform uses: **Anthropic Claude** (text AI via `/api/chat`), **OpenAI GPT-4o Realtime** (voice via `realtime-token`)
- FTC guidelines require accurate disclosure of who processes user data
- **Fix:** Name providers explicitly in privacy policy Section 8

---

### MEDIUM

**M-01 — Supabase Anon Key in Client-Side JavaScript**
- `auth.js` lines 9–10: SUPABASE_URL and SUPABASE_ANON_KEY are hardcoded in client JS
- This is standard Supabase client-side architecture and the anon key is intended to be public
- Risk is NOT the key exposure — risk is RLS misconfiguration (see H-01)
- **Mitigation:** Confirm RLS enforces auth.uid() = user_id on every table. The anon key itself does not need rotation.

**M-02 — File Upload Size and Type Not Validated Server-Side**
- `app.js` handles file uploads client-side only
- No Netlify function validates file size, type, or content before processing
- **Risk:** Large files, malicious content, or binary files could be sent to Claude API
- **Fix:** Add server-side validation in chat.js Netlify function

**M-03 — Password Minimum Length is 6 Characters**
- Supabase default allows 6-character passwords
- Platform handles sensitive veteran data — minimum should be 8+ characters
- **Fix:** Add client-side enforcement of 8-character minimum in `handleSignup()`

**M-04 — No Content Security Policy (CSP) Headers**
- No CSP headers visible in netlify.toml or HTML meta tags
- XSS vulnerabilities would have no mitigation layer
- **Fix:** Add CSP headers via `netlify.toml` `[[headers]]` section

**M-05 — Template Outputs Store Full Document Content**
- `template_outputs.content` stores complete generated documents (resumes, VA claims, POAs)
- No size limit, no expiration, no PII scrubbing
- **Fix:** Add `expires_at`, enforce max content length

---

### LOW

**L-01 — Realtime Voice Session Tokens Not Bound to Authenticated Users**
- `realtime-token.js` generates ephemeral OpenAI tokens for anyone who calls the endpoint
- No authentication check before issuing the token
- **Risk:** Unauthenticated users could consume voice API credits
- **Fix:** Add auth check in `realtime-token.js` before issuing token

**L-02 — No Rate Limiting on Chat Endpoint**
- `/.netlify/functions/chat` has no rate limiting
- **Risk:** API credit exhaustion via abuse
- **Fix:** Add IP-based or user-based rate limiting in chat.js

**L-03 — Conversation History Not Sanitized Before Storage**
- `saveReport()` stores raw `conversationHistory` array as JSON
- Array may contain file content excerpts, names, SSNs mentioned verbally
- **Fix:** Strip or hash PII before storing in conversation_history

**L-04 — Legal Pages Contain Attorney Review Notice (Publicly Visible)**
- `privacy.html` line 167: "Before launching publicly, please have this policy reviewed by a qualified attorney..."
- This notice is visible to the public on the live site
- **Fix:** Remove before production launch
