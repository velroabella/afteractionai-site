# AfterAction AI — Compliance Confirmation Checklist
**Date:** March 2026
**Purpose:** Track implementation status of all security, legal, and data architecture upgrades

---

## HOW TO USE THIS DOCUMENT

- ✅ = Implemented (code/file exists and is deployed)
- ⚙️ = Implemented but NOT YET DEPLOYED (code exists locally, needs Netlify deploy)
- 📋 = SQL ready, needs to be run in Supabase dashboard
- ❌ = Not yet started
- 🔵 = Requires manual action (Supabase dashboard, Netlify settings)

---

## PART 1 — SECURITY AUDIT FIXES

### CRITICAL

| ID | Issue | Fix | Status | File |
|----|-------|-----|--------|------|
| C-01 | conversation_history stored indefinitely | expires_at + pg_cron deletion | 📋 | 02_schema_upgrade.sql Part G |
| C-02 | supabase client exposed on window.AAAI.auth | Removed from public API | ⚙️ | js/auth.js line ~504 |

**Action required for C-01:** Run Part G of `02_schema_upgrade.sql` in Supabase SQL Editor to create pg_cron jobs.
**Action required for C-02:** Deploy auth.js (Netlify deploy command).

---

### HIGH

| ID | Issue | Fix | Status | File |
|----|-------|-----|--------|------|
| H-01 | Supabase RLS policies not verified | RLS verification + enforcement SQL | 📋 | 02_schema_upgrade.sql Parts A & B |
| H-02 | Privacy policy materially inaccurate | Full privacy policy rewrite | ⚙️ | privacy.html |
| H-03 | No data retention enforcement | expires_at columns + pg_cron | 📋 | 02_schema_upgrade.sql Parts D & G |
| H-04 | AI providers not disclosed | Named Anthropic + OpenAI in privacy/terms | ⚙️ | privacy.html, terms.html |

**Action required for H-01, H-03:** Run `02_schema_upgrade.sql` Parts A, B, D in Supabase SQL Editor.
**Action required for H-02, H-04:** Deploy updated HTML files.

---

### MEDIUM

| ID | Issue | Fix | Status | Notes |
|----|-------|-----|--------|-------|
| M-01 | Supabase anon key in client JS | No action needed — anon key is public by design | ✅ | RLS is the actual protection (see H-01) |
| M-02 | No server-side file upload validation | Add to chat.js Netlify function | ❌ | Future task |
| M-03 | Password minimum 6 characters | Add 8-char validation in handleSignup() | ❌ | Future task |
| M-04 | No Content Security Policy headers | Add to netlify.toml | ❌ | Future task |
| M-05 | Template outputs no size limit or expiry | expires_at + max length | 📋 | 02_schema_upgrade.sql Part D |

---

### LOW

| ID | Issue | Fix | Status | Notes |
|----|-------|-----|--------|-------|
| L-01 | Realtime token not auth-gated | Add auth check to realtime-token.js | ❌ | Future task |
| L-02 | No rate limiting on chat endpoint | Add IP/user rate limit to chat.js | ❌ | Future task |
| L-03 | Conversation history not sanitized | PII stripping before storage | ❌ | Future task |
| L-04 | Attorney review notice publicly visible | Removed from privacy.html and terms.html | ⚙️ | privacy.html, terms.html |

---

## PART 2 — LEGAL AUDIT FIXES

| ID | Issue | Fix | Status | File |
|----|-------|-----|--------|------|
| LA-01 | False Google Analytics claim | Removed entirely | ⚙️ | privacy.html |
| LA-02 | False "24 hours deleted" claim | Replaced with accurate browser-only language | ⚙️ | privacy.html, terms.html, disclaimer.html |
| LA-03 | AI providers unnamed | Named Anthropic + OpenAI with policy links | ⚙️ | privacy.html, terms.html |
| LA-04 | conversation_history storage undisclosed | Added to privacy policy Section 1 | ⚙️ | privacy.html |
| LA-05 | Data retention table missing | Full table added to privacy policy Section 3 | ⚙️ | privacy.html |
| LA-06 | Attorney review notice visible | Removed from privacy.html and terms.html | ⚙️ | privacy.html, terms.html |
| LA-07 | AI data retention guaranteed on behalf of providers | Replaced with "review their policies" language | ⚙️ | privacy.html, terms.html |
| LA-08 | Terms AI document disclaimer inadequate | Existing Section 6 is already strong — adequate | ✅ | terms.html |
| LA-09 | Disclaimer not cross-referenced to privacy policy | Added cross-reference in Section 11 | ⚙️ | disclaimer.html |

---

## PART 3 — SECURE STORAGE IMPLEMENTATION

| Item | Status | File |
|------|--------|------|
| user_documents table with RLS | 📋 | 02_schema_upgrade.sql Part C |
| Storage bucket (user_uploads, private) | 📋 | 02_schema_upgrade.sql Part F |
| Storage RLS policies (user owns files) | 📋 | 02_schema_upgrade.sql Part F |
| Signed URL Netlify function (5–10 min expiry) | ⚙️ | netlify/functions/signed-url.js |
| Auth check on realtime-token.js | ❌ | netlify/functions/realtime-token.js |

---

## PART 4 — DATA ARCHITECTURE

| Item | Status | File |
|------|--------|------|
| ai_reports: expires_at (90 days), category, tags | 📋 | 02_schema_upgrade.sql Part D |
| template_outputs: expires_at (180 days) | 📋 | 02_schema_upgrade.sql Part D |
| checklist_items: expires_at (365 days) | 📋 | 02_schema_upgrade.sql Part D |
| profiles: expanded columns (state, veteran_status, etc.) | 📋 | 02_schema_upgrade.sql Part E |
| activity_logs table with RLS | 📋 | 02_schema_upgrade.sql Part E |
| pg_cron: 4 scheduled deletion jobs | 📋 | 02_schema_upgrade.sql Part G |
| 7 segmentation queries | 📋 | 02_schema_upgrade.sql Part H |
| export_users and export_reports_summary views | 📋 | 02_schema_upgrade.sql Part I |

---

## DEPLOY ORDER (Recommended)

### Step 1 — Deploy Supabase SQL (run once in Supabase SQL Editor)

Run the entire `02_schema_upgrade.sql` file in sequence, or run by part:

1. **Part A** — RLS verification (read-only — safe to run anytime)
2. **Part B** — Enable RLS on existing tables
3. **Part C** — Create user_documents table
4. **Part D** — Add expires_at, category, tags columns
5. **Part E** — Expand profiles table, create activity_logs
6. **Part F** — Create storage bucket + RLS policies
7. **Part G** — pg_cron scheduled deletion jobs *(requires pg_cron extension enabled in Supabase)*
8. **Part H** — Segmentation queries (read-only views — run whenever)
9. **Part I** — Export views

**To enable pg_cron in Supabase:**
> Supabase Dashboard → Project → Database → Extensions → Search "pg_cron" → Enable

### Step 2 — Set Environment Variables in Netlify

New variable needed for signed-url.js:
```
SUPABASE_SERVICE_ROLE_KEY = <your service role key from Supabase Settings > API>
```
Note: This is different from the anon key. Never expose this in client-side code.

> Netlify Dashboard → Site → Environment Variables → Add variable

### Step 3 — Deploy Site Files

Run from your terminal:
```
cd ~/Desktop/After_Action_AI_Project/04_Technology/site && netlify deploy --prod --dir=.
```

Files changed in this compliance pass:
- `js/auth.js` (C-02 fix)
- `css/styles.css` (policy-table CSS)
- `privacy.html` (full rewrite)
- `terms.html` (sections 9, 10, attorney notice)
- `disclaimer.html` (section 11 + privacy cross-reference)
- `netlify/functions/signed-url.js` (new file)

### Step 4 — Verify After Deploy

- [ ] Visit afteractionai.org/privacy — confirm no Google Analytics language, no attorney notice
- [ ] Visit afteractionai.org/terms — confirm AI providers named (Anthropic, OpenAI), no "24 hours" claim
- [ ] Visit afteractionai.org/disclaimer — confirm "browser only" document language
- [ ] Open browser DevTools console on any page → type `AAAI.auth.supabase` → confirm it returns `undefined` (C-02 verified)
- [ ] Test signed URL endpoint: POST to `/.netlify/functions/signed-url` without auth → confirm 401 response
- [ ] In Supabase SQL Editor, run Part A of `02_schema_upgrade.sql` to verify RLS status on all tables

---

## REMAINING WORK (Future Tasks)

These are real security gaps not yet fixed:

1. **M-02** — Server-side file upload validation in chat.js (type, size, content)
2. **M-03** — 8-character minimum password enforcement in auth.js `handleSignup()`
3. **M-04** — Content Security Policy headers in netlify.toml
4. **L-01** — Auth gate on realtime-token.js to prevent unauthenticated voice API usage
5. **L-02** — Rate limiting on `/netlify/functions/chat` (IP or user-based)
6. **L-03** — PII stripping from conversation_history before storage
7. **CPRA** — Self-service data deletion UI (currently requires emailing hello@afteractionai.org)
8. **Activity logging** — JS function to log to activity_logs table from app.js

---

## CONTACTS FOR COMPLIANCE

- **Platform maintainer:** Mike Jackson, hello@afteractionai.org
- **Supabase project:** Accessible at supabase.com under your account
- **Netlify site:** afteractionai.org — accessible at app.netlify.com
- **Legal review:** Recommend annual review of privacy policy by a nonprofit/data privacy attorney
