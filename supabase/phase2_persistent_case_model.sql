-- ══════════════════════════════════════════════════════════
-- AfterAction AI — Phase 2: Persistent Case Model
-- PHASE 2 - PERSISTENT CASE MODEL
--
-- Run this entire file in the Supabase SQL editor.
--
-- Design principles:
--   - Cases are the top-level container for all veteran work.
--   - Missions belong to a case (many per case, fixing the
--     single-mission limitation identified in audit Finding E2-1).
--   - Checklist items belong to a mission (linking action steps
--     to the mission that generated them).
--   - Documents belong to a case, optionally linked to a mission.
--   - Reports belong to a case (audit Finding J1-2 — no
--     orchestration between data sources; this fixes the root).
--   - All tables use RLS: users can only access their own rows.
--   - Backward-compatible: existing tables (ai_reports,
--     checklist_items, template_outputs) are NOT modified.
--
-- Existing tables (unchanged):
--   profiles, ai_reports, checklist_items, template_outputs,
--   legal_acknowledgments, newsletter_signups, activity_logs
-- ══════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────────────────
-- 1. CASES
--    Top-level container for a veteran's work in the system.
--    Each case represents one focused engagement (e.g., "File
--    disability claim for knee + tinnitus"). A veteran may
--    have multiple cases over time.
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cases (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Human-readable label auto-generated or set by user
  title        TEXT        NOT NULL DEFAULT 'My Case',

  -- Overall case status
  -- Values: active | paused | complete | archived
  status       TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'paused', 'complete', 'archived')),

  -- Free-form notes or summary (AI-generated or user-written)
  notes        TEXT,

  -- Timestamps
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast user lookup (the most common query pattern)
CREATE INDEX IF NOT EXISTS idx_cases_user_id ON cases(user_id);
CREATE INDEX IF NOT EXISTS idx_cases_status  ON cases(user_id, status);

-- RLS: users can only see and modify their own cases
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cases_select_own" ON cases
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "cases_insert_own" ON cases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cases_update_own" ON cases
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cases_delete_own" ON cases
  FOR DELETE USING (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 2. MISSIONS
--    Persistent version of the in-memory MissionManager.
--    Each case can have MULTIPLE missions (fixes audit
--    Finding E2-1: single-mission limitation).
--    Mirrors the MissionManager object shape exactly so the
--    in-memory and DB representations stay in sync.
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS missions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Mission type — matches MissionManager MISSION_TYPES keys
  -- Values: disability_claim | education_path | state_benefits_search
  --         | housing_path | employment_transition
  mission_type TEXT        NOT NULL
                           CHECK (mission_type IN (
                             'disability_claim',
                             'education_path',
                             'state_benefits_search',
                             'housing_path',
                             'employment_transition'
                           )),

  -- Human-readable name (e.g., "VA Disability Claim")
  name         TEXT        NOT NULL,

  -- Mission status — matches MissionManager VALID_STATUSES
  status       TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'paused', 'complete', 'blocked')),

  -- Step tracking (audit Finding E1-1: no completion tracking)
  current_step TEXT,
  next_step    TEXT,

  -- Obstacles blocking progress (jsonb array of strings)
  blockers     JSONB       NOT NULL DEFAULT '[]',

  -- Arbitrary mission-specific data (flexible for future needs)
  data         JSONB       NOT NULL DEFAULT '{}',

  -- When the mission was first created (immutable in MissionManager)
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Timestamps
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_missions_case_id ON missions(case_id);
CREATE INDEX IF NOT EXISTS idx_missions_user_id ON missions(user_id);
CREATE INDEX IF NOT EXISTS idx_missions_status  ON missions(user_id, status);

-- RLS: users can only access their own missions
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "missions_select_own" ON missions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "missions_insert_own" ON missions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "missions_update_own" ON missions
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "missions_delete_own" ON missions
  FOR DELETE USING (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 3. CASE_CHECKLIST_ITEMS
--    Persistent checklist items linked to a specific mission.
--    Named case_checklist_items (not checklist_items) to avoid
--    conflict with the existing checklist_items table that
--    stores report-level items (backward-compatible).
--    Adds mission_id FK — the key relationship missing from
--    the current schema (audit Part E: missions and checklists
--    are disconnected).
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS case_checklist_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id    UUID        NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  case_id       UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Item content
  title         TEXT        NOT NULL,
  description   TEXT,
  category      TEXT        NOT NULL DEFAULT 'general',
                            -- immediate | short_term | strategic | optional | general

  -- Completion state
  is_completed  BOOLEAN     NOT NULL DEFAULT FALSE,
  completed_at  TIMESTAMPTZ,

  -- Status for richer tracking
  -- Values: not_started | in_progress | completed | blocked | skipped
  status        TEXT        NOT NULL DEFAULT 'not_started'
                            CHECK (status IN (
                              'not_started', 'in_progress', 'completed', 'blocked', 'skipped'
                            )),

  -- Display order within its category
  sort_order    INTEGER     NOT NULL DEFAULT 0,

  -- Priority (1 = highest, matches existing CHECKLIST_PRIORITY mapping)
  priority      INTEGER     NOT NULL DEFAULT 2
                            CHECK (priority BETWEEN 1 AND 4),

  -- Where this item originated
  source        TEXT        NOT NULL DEFAULT 'ai_report',
                            -- ai_report | manual | resource_matcher | mission

  -- Optional deep-link to an internal page or external resource
  resource_link TEXT,
  due_context   TEXT,

  -- Timestamps
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ccl_mission_id ON case_checklist_items(mission_id);
CREATE INDEX IF NOT EXISTS idx_ccl_case_id    ON case_checklist_items(case_id);
CREATE INDEX IF NOT EXISTS idx_ccl_user_id    ON case_checklist_items(user_id);
CREATE INDEX IF NOT EXISTS idx_ccl_status     ON case_checklist_items(user_id, status);

-- RLS
ALTER TABLE case_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ccl_select_own" ON case_checklist_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ccl_insert_own" ON case_checklist_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ccl_update_own" ON case_checklist_items
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ccl_delete_own" ON case_checklist_items
  FOR DELETE USING (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 4. DOCUMENTS
--    Tracks uploaded or analyzed documents linked to a case,
--    and optionally to the specific mission that used them.
--    Currently document analysis results only exist in-memory
--    and in template_outputs. This table gives them a home
--    with proper case linkage.
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  mission_id      UUID        REFERENCES missions(id) ON DELETE SET NULL,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Original file name as uploaded
  file_name       TEXT        NOT NULL,

  -- Detected document type (DD-214, rating_decision, medical_record, etc.)
  -- Populated by document-analyzer skill
  document_type   TEXT,

  -- Supabase Storage path (if file is stored; nullable if text-only)
  storage_path    TEXT,

  -- MIME type (application/pdf, image/jpeg, etc.)
  mime_type       TEXT,

  -- Size in bytes
  file_size       INTEGER,

  -- Full text extracted from the document (for AI context reuse)
  extracted_text  TEXT,

  -- Structured analysis output from document-analyzer skill (jsonb)
  analysis_result JSONB       NOT NULL DEFAULT '{}',

  -- Processing status
  -- Values: pending | processing | complete | failed
  status          TEXT        NOT NULL DEFAULT 'complete'
                              CHECK (status IN ('pending', 'processing', 'complete', 'failed')),

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_case_id    ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_documents_mission_id ON documents(mission_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id    ON documents(user_id);

-- RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select_own" ON documents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "documents_insert_own" ON documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "documents_update_own" ON documents
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "documents_delete_own" ON documents
  FOR DELETE USING (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 5. REPORTS
--    Persistent After Action Reports linked to a case.
--    The existing ai_reports table (user_id, report_content,
--    conversation_history) has no case linkage — audit
--    Finding J1-2. This table replaces it for new work while
--    leaving ai_reports intact for backward compatibility.
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reports (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id              UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Report classification
  -- Values: after_action | eligibility | legal | intake_summary
  report_type          TEXT        NOT NULL DEFAULT 'after_action'
                                   CHECK (report_type IN (
                                     'after_action', 'eligibility', 'legal', 'intake_summary'
                                   )),

  -- Report title (auto-generated or user-set)
  title                TEXT,

  -- Full report text content
  content              TEXT        NOT NULL,

  -- The conversation history that generated this report
  -- (stored as jsonb array of {role, content} objects)
  conversation_history JSONB       NOT NULL DEFAULT '[]',

  -- Generation metadata
  model_used           TEXT,
  token_count          INTEGER,

  -- Timestamps
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_case_id    ON reports(case_id);
CREATE INDEX IF NOT EXISTS idx_reports_user_id    ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_type       ON reports(user_id, report_type);
CREATE INDEX IF NOT EXISTS idx_reports_created    ON reports(user_id, created_at DESC);

-- RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_select_own" ON reports
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "reports_insert_own" ON reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reports_update_own" ON reports
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reports_delete_own" ON reports
  FOR DELETE USING (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- AUTO-UPDATE updated_at TRIGGER
-- Automatically keeps updated_at current on all new tables.
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_missions_updated_at
  BEFORE UPDATE ON missions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_ccl_updated_at
  BEFORE UPDATE ON case_checklist_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ──────────────────────────────────────────────────────────
-- VERIFICATION QUERY
-- Run after migration to confirm all tables and policies exist.
-- ──────────────────────────────────────────────────────────

SELECT
  t.tablename,
  COUNT(p.policyname) AS rls_policy_count
FROM pg_tables t
LEFT JOIN pg_policies p ON p.tablename = t.tablename
WHERE t.schemaname = 'public'
  AND t.tablename IN ('cases', 'missions', 'case_checklist_items', 'documents', 'reports')
GROUP BY t.tablename
ORDER BY t.tablename;
