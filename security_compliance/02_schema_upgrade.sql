-- ══════════════════════════════════════════════════════════════════════════════
-- AfterAction AI — Database Schema Upgrade
-- Phase 2: Secure Storage | Phase 5 (Part 2): Data Intelligence Architecture
-- Run in Supabase SQL Editor → Run all at once or section by section
-- ══════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────────
-- PART A: PHASE 1 — VERIFY RLS ON EXISTING TABLES (run first)
-- ──────────────────────────────────────────────────────────────────────────────

-- Check which tables have RLS enabled
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check existing RLS policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ──────────────────────────────────────────────────────────────────────────────
-- PART B: ENFORCE RLS ON ALL EXISTING TABLES
-- ──────────────────────────────────────────────────────────────────────────────

-- Enable RLS (idempotent — safe to run even if already enabled)
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.template_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.newsletter_signups ENABLE ROW LEVEL SECURITY;

-- profiles: users can only read and update their own profile
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ai_reports: users can only access their own reports
DROP POLICY IF EXISTS "ai_reports_select_own" ON public.ai_reports;
DROP POLICY IF EXISTS "ai_reports_insert_own" ON public.ai_reports;
DROP POLICY IF EXISTS "ai_reports_delete_own" ON public.ai_reports;

CREATE POLICY "ai_reports_select_own"
  ON public.ai_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "ai_reports_insert_own"
  ON public.ai_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ai_reports_delete_own"
  ON public.ai_reports FOR DELETE
  USING (auth.uid() = user_id);

-- checklist_items: users can only access their own items
DROP POLICY IF EXISTS "checklist_select_own" ON public.checklist_items;
DROP POLICY IF EXISTS "checklist_insert_own" ON public.checklist_items;
DROP POLICY IF EXISTS "checklist_update_own" ON public.checklist_items;
DROP POLICY IF EXISTS "checklist_delete_own" ON public.checklist_items;

CREATE POLICY "checklist_select_own"
  ON public.checklist_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "checklist_insert_own"
  ON public.checklist_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "checklist_update_own"
  ON public.checklist_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "checklist_delete_own"
  ON public.checklist_items FOR DELETE
  USING (auth.uid() = user_id);

-- template_outputs: users can only access their own outputs
DROP POLICY IF EXISTS "template_outputs_select_own" ON public.template_outputs;
DROP POLICY IF EXISTS "template_outputs_insert_own" ON public.template_outputs;
DROP POLICY IF EXISTS "template_outputs_delete_own" ON public.template_outputs;

CREATE POLICY "template_outputs_select_own"
  ON public.template_outputs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "template_outputs_insert_own"
  ON public.template_outputs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "template_outputs_delete_own"
  ON public.template_outputs FOR DELETE
  USING (auth.uid() = user_id);

-- newsletter_signups: users can only see their own signup; insert open for anonymous
DROP POLICY IF EXISTS "newsletter_select_own" ON public.newsletter_signups;
DROP POLICY IF EXISTS "newsletter_insert_open" ON public.newsletter_signups;
DROP POLICY IF EXISTS "newsletter_update_own" ON public.newsletter_signups;

CREATE POLICY "newsletter_select_own"
  ON public.newsletter_signups FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "newsletter_insert_open"
  ON public.newsletter_signups FOR INSERT
  WITH CHECK (true); -- open for anonymous email signup

CREATE POLICY "newsletter_update_own"
  ON public.newsletter_signups FOR UPDATE
  USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- PART C: PHASE 2 — SECURE DOCUMENT STORAGE TABLE
-- ──────────────────────────────────────────────────────────────────────────────

-- Table: user_documents
-- Tracks file metadata for documents stored in private Supabase Storage bucket
CREATE TABLE IF NOT EXISTS public.user_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name      text NOT NULL,                          -- Original filename provided by user
  file_path      text NOT NULL,                          -- Path in storage: {user_id}/{timestamp}-{filename}
  file_size      bigint,                                 -- Size in bytes
  file_type      text,                                   -- MIME type: application/pdf, image/jpeg, etc.
  upload_source  text DEFAULT 'chat',                    -- 'chat', 'template', 'profile'
  processed      boolean DEFAULT false,                  -- Whether AI processing is complete
  expires_at     timestamptz NOT NULL
                   DEFAULT (now() + interval '48 hours'), -- Auto-deletion target
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_documents_select_own" ON public.user_documents;
DROP POLICY IF EXISTS "user_documents_insert_own" ON public.user_documents;
DROP POLICY IF EXISTS "user_documents_delete_own" ON public.user_documents;

CREATE POLICY "user_documents_select_own"
  ON public.user_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_documents_insert_own"
  ON public.user_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_documents_delete_own"
  ON public.user_documents FOR DELETE
  USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- PART D: PHASE 2 — ADD EXPIRATION TO EXISTING DATA TABLES
-- ──────────────────────────────────────────────────────────────────────────────

-- Add expires_at to ai_reports (90-day default)
ALTER TABLE public.ai_reports
  ADD COLUMN IF NOT EXISTS expires_at timestamptz
    DEFAULT (now() + interval '90 days');

-- Add category + tags to ai_reports for intelligence system
ALTER TABLE public.ai_reports
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Add expires_at to template_outputs (180-day default)
ALTER TABLE public.template_outputs
  ADD COLUMN IF NOT EXISTS expires_at timestamptz
    DEFAULT (now() + interval '180 days');

-- Add expires_at to checklist_items (365-day default)
ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS expires_at timestamptz
    DEFAULT (now() + interval '365 days');

-- ──────────────────────────────────────────────────────────────────────────────
-- PART E: PHASE 5 (PART 2) — DATA INTELLIGENCE ARCHITECTURE
-- ──────────────────────────────────────────────────────────────────────────────

-- Expand profiles table with intelligence fields
-- NOTE: Existing profiles table has: id, display_name, updated_at, issue_tags, goals
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS state               text,          -- U.S. state for state-specific benefits
  ADD COLUMN IF NOT EXISTS veteran_status      text,          -- 'veteran', 'active_duty', 'guard_reserve', 'caregiver', 'survivor', 'spouse'
  ADD COLUMN IF NOT EXISTS primary_need        text,          -- 'mental_health', 'benefits', 'transition', 'family', 'employment', 'housing', 'legal'
  ADD COLUMN IF NOT EXISTS audience            text,          -- 'veteran', 'spouse', 'caregiver', 'survivor', 'family_member'
  ADD COLUMN IF NOT EXISTS urgency_level       text,          -- 'immediate', 'short_term', 'planning'
  ADD COLUMN IF NOT EXISTS last_activity       timestamptz,   -- Timestamp of last platform interaction
  ADD COLUMN IF NOT EXISTS account_source      text           -- 'organic', 'referral', 'newsletter', 'social'
    DEFAULT 'organic';

-- Table: activity_logs
-- Every significant user action is recorded here for segmentation and reporting
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      text NOT NULL,     -- 'view_page', 'click_resource', 'generate_report', 'complete_checklist', 'upload_document', 'use_template', 'voice_session'
  category    text,              -- 'medical', 'family', 'grants', 'benefits', 'employment', 'housing', 'legal', 'transition', 'crisis'
  tag         text,              -- Specific tag: 'PTSD', 'TBI', 'spouse', 'employment', 'VA_claim', 'discharge', 'transition'
  page        text,              -- URL path or page name
  metadata    jsonb DEFAULT '{}', -- Additional context: resource_id, template_type, report_id, etc.
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_select_own" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_insert_own" ON public.activity_logs;

CREATE POLICY "activity_logs_select_own"
  ON public.activity_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "activity_logs_insert_own"
  ON public.activity_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for performance on common queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id    ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action     ON public.activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_category   ON public.activity_logs(category);
CREATE INDEX IF NOT EXISTS idx_activity_logs_tag        ON public.activity_logs(tag);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- Indexes on ai_reports for intelligence queries
CREATE INDEX IF NOT EXISTS idx_ai_reports_user_id    ON public.ai_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_reports_category   ON public.ai_reports(category);
CREATE INDEX IF NOT EXISTS idx_ai_reports_tags       ON public.ai_reports USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_ai_reports_created_at ON public.ai_reports(created_at DESC);

-- Indexes on profiles for segmentation
CREATE INDEX IF NOT EXISTS idx_profiles_state          ON public.profiles(state);
CREATE INDEX IF NOT EXISTS idx_profiles_veteran_status ON public.profiles(veteran_status);
CREATE INDEX IF NOT EXISTS idx_profiles_primary_need   ON public.profiles(primary_need);
CREATE INDEX IF NOT EXISTS idx_profiles_audience       ON public.profiles(audience);

-- ──────────────────────────────────────────────────────────────────────────────
-- PART F: PHASE 2 — STORAGE BUCKET SETUP
-- NOTE: Run these in Supabase Dashboard → Storage → New Bucket
-- OR use the Supabase Management API
-- ──────────────────────────────────────────────────────────────────────────────

/*
  STORAGE BUCKET: user_uploads
  Configuration (set in Supabase Dashboard → Storage):
  - Name: user_uploads
  - Public: OFF (private bucket)
  - File size limit: 20MB
  - Allowed MIME types: application/pdf, image/jpeg, image/png, image/gif,
                         text/plain, application/msword,
                         application/vnd.openxmlformats-officedocument.wordprocessingml.document

  File path convention:
    {user_id}/{timestamp}-{sanitized_filename}
    Example: a1b2c3d4-e5f6.../1711500000000-dd214.pdf
*/

-- Storage RLS: only authenticated users can upload to their own folder
-- Run in Supabase SQL Editor after creating the bucket:
INSERT INTO storage.buckets (id, name, public)
VALUES ('user_uploads', 'user_uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: allow authenticated users to upload to their own folder
DROP POLICY IF EXISTS "user_uploads_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "user_uploads_select_own" ON storage.objects;
DROP POLICY IF EXISTS "user_uploads_delete_own" ON storage.objects;

CREATE POLICY "user_uploads_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user_uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "user_uploads_select_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user_uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "user_uploads_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user_uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- PART G: PHASE 2 — SCHEDULED DELETION (pg_cron)
-- Enable pg_cron in Supabase: Dashboard → Database → Extensions → pg_cron
-- ──────────────────────────────────────────────────────────────────────────────

-- Enable extension (run once)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule: delete expired documents (runs every 6 hours)
SELECT cron.schedule(
  'delete-expired-documents',
  '0 */6 * * *',
  $$
  DELETE FROM public.user_documents
  WHERE expires_at < now();
  $$
);

-- Schedule: delete expired ai_reports (runs daily at 2am UTC)
SELECT cron.schedule(
  'delete-expired-reports',
  '0 2 * * *',
  $$
  DELETE FROM public.ai_reports
  WHERE expires_at < now();
  $$
);

-- Schedule: delete expired template_outputs (runs daily at 2:30am UTC)
SELECT cron.schedule(
  'delete-expired-template-outputs',
  '30 2 * * *',
  $$
  DELETE FROM public.template_outputs
  WHERE expires_at < now();
  $$
);

-- Schedule: delete expired checklist_items (runs daily at 3am UTC)
SELECT cron.schedule(
  'delete-expired-checklist-items',
  '0 3 * * *',
  $$
  DELETE FROM public.checklist_items
  WHERE expires_at < now();
  $$
);

-- ──────────────────────────────────────────────────────────────────────────────
-- PART H: INTELLIGENCE QUERIES (PART 2 — Step 4)
-- Segmentation and export-ready queries
-- ──────────────────────────────────────────────────────────────────────────────

-- Query 1: All users with profile data
SELECT
  u.id,
  u.email,
  u.created_at,
  p.display_name,
  p.state,
  p.veteran_status,
  p.primary_need,
  p.audience,
  p.urgency_level,
  p.last_activity
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ORDER BY u.created_at DESC;

-- Query 2: Emails only (for newsletter/outreach — consent required)
SELECT
  u.email,
  p.display_name,
  p.state,
  p.veteran_status,
  ns.consent,
  ns.segments,
  ns.created_at AS subscribed_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.newsletter_signups ns ON ns.user_id = u.id
WHERE ns.consent = true
ORDER BY ns.created_at DESC;

-- Query 3: Mental health users (any PTSD/TBI/mental health signal)
SELECT DISTINCT
  u.id,
  u.email,
  p.display_name,
  p.state,
  p.veteran_status
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE
  p.primary_need = 'mental_health'
  OR EXISTS (
    SELECT 1 FROM public.ai_reports r
    WHERE r.user_id = u.id
    AND (r.category = 'mental_health' OR 'mental_health' = ANY(r.tags))
  )
  OR EXISTS (
    SELECT 1 FROM public.activity_logs al
    WHERE al.user_id = u.id AND al.category = 'medical'
  );

-- Query 4: PTSD-tagged users
SELECT DISTINCT
  u.id,
  u.email,
  p.display_name,
  p.state
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE
  EXISTS (
    SELECT 1 FROM public.ai_reports r
    WHERE r.user_id = u.id AND 'PTSD' = ANY(r.tags)
  )
  OR EXISTS (
    SELECT 1 FROM public.activity_logs al
    WHERE al.user_id = u.id AND al.tag = 'PTSD'
  )
  OR (
    p.issue_tags IS NOT NULL
    AND p.issue_tags @> '[{"issue": "PTSD"}]'::jsonb
  );

-- Query 5: Transitioning users
SELECT DISTINCT
  u.id,
  u.email,
  p.display_name,
  p.state,
  p.urgency_level
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE
  p.primary_need = 'transition'
  OR EXISTS (
    SELECT 1 FROM public.ai_reports r
    WHERE r.user_id = u.id AND 'transition' = ANY(r.tags)
  )
  OR EXISTS (
    SELECT 1 FROM public.activity_logs al
    WHERE al.user_id = u.id AND al.tag IN ('transition', 'employment', 'discharge')
  );

-- Query 6: Family / spouse users
SELECT DISTINCT
  u.id,
  u.email,
  p.display_name,
  p.state,
  p.audience
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE
  p.audience IN ('spouse', 'caregiver', 'survivor', 'family_member')
  OR p.primary_need = 'family'
  OR EXISTS (
    SELECT 1 FROM public.ai_reports r
    WHERE r.user_id = u.id AND 'family' = ANY(r.tags)
  );

-- Query 7: Highly active users (5+ actions in last 30 days)
SELECT
  u.id,
  u.email,
  p.display_name,
  COUNT(al.id) AS action_count,
  MAX(al.created_at) AS last_active
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
JOIN public.activity_logs al ON al.user_id = u.id
WHERE al.created_at > now() - interval '30 days'
GROUP BY u.id, u.email, p.display_name
HAVING COUNT(al.id) >= 5
ORDER BY action_count DESC;

-- ──────────────────────────────────────────────────────────────────────────────
-- PART I: CSV EXPORT VIEWS (optional — for Supabase Studio download)
-- ──────────────────────────────────────────────────────────────────────────────

-- View: export_users (run as service role)
CREATE OR REPLACE VIEW public.export_users AS
SELECT
  u.id,
  u.email,
  u.created_at,
  p.display_name,
  p.state,
  p.veteran_status,
  p.primary_need,
  p.audience,
  p.urgency_level,
  p.last_activity
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id;

-- View: export_reports_summary
CREATE OR REPLACE VIEW public.export_reports_summary AS
SELECT
  r.id,
  r.user_id,
  u.email,
  r.category,
  array_to_string(r.tags, ',') AS tags_csv,
  r.created_at,
  r.expires_at,
  LEFT(r.report_content::text, 200) AS report_preview
FROM public.ai_reports r
JOIN auth.users u ON u.id = r.user_id
ORDER BY r.created_at DESC;
