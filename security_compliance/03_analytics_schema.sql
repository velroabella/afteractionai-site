-- AfterAction AI — Analytics + Segmentation Schema Migration
-- Run after 02_schema_upgrade.sql
-- Date: March 2026
-- ──────────────────────────────────────────────────────────────────────────────

-- PART A: EXTEND activity_logs WITH SEGMENTATION COLUMNS
-- Current: id, user_id, action, metadata, created_at
-- Adding:  page_slug, event_type, category, tags, session_id

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS page_slug TEXT,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS session_id TEXT;

-- Backfill event_type from action for existing rows
UPDATE public.activity_logs
SET event_type = action
WHERE event_type IS NULL;

-- Additional indexes for segmentation queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_event_type ON public.activity_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON public.activity_logs(category);
CREATE INDEX IF NOT EXISTS idx_activity_logs_page_slug ON public.activity_logs(page_slug);
CREATE INDEX IF NOT EXISTS idx_activity_logs_tags ON public.activity_logs USING gin(tags);

-- ──────────────────────────────────────────────────────────────────────────────
-- PART B: EXTEND profiles WITH CONSENT + SEGMENTATION FIELDS
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS consent_email BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_analytics BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS audience_type TEXT,
  ADD COLUMN IF NOT EXISTS secondary_needs TEXT[],
  ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_sessions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_events INTEGER DEFAULT 0;

-- ──────────────────────────────────────────────────────────────────────────────
-- PART C: EXTEND newsletter_signups WITH RICHER CAPTURE FIELDS
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.newsletter_signups
  ADD COLUMN IF NOT EXISTS audience_type TEXT,
  ADD COLUMN IF NOT EXISTS page_slug TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS ip_country TEXT;

CREATE INDEX IF NOT EXISTS idx_newsletter_audience ON public.newsletter_signups(audience_type);

-- ──────────────────────────────────────────────────────────────────────────────
-- PART D: SEGMENTATION VIEWS
-- ──────────────────────────────────────────────────────────────────────────────

-- D1: Users by audience type
CREATE OR REPLACE VIEW seg_by_audience AS
SELECT
  COALESCE(p.audience_type, p.audience, 'unknown') AS audience_type,
  COUNT(DISTINCT p.id) AS user_count,
  COUNT(DISTINCT CASE WHEN p.consent_email = true THEN p.id END) AS email_opted_in,
  AVG(p.engagement_score) AS avg_engagement,
  MAX(p.last_activity) AS latest_activity
FROM public.profiles p
GROUP BY COALESCE(p.audience_type, p.audience, 'unknown')
ORDER BY user_count DESC;

-- D2: Users by primary need
CREATE OR REPLACE VIEW seg_by_primary_need AS
SELECT
  COALESCE(p.primary_need, 'not specified') AS primary_need,
  COUNT(DISTINCT p.id) AS user_count,
  COUNT(DISTINCT CASE WHEN p.consent_email = true THEN p.id END) AS email_opted_in,
  ARRAY_AGG(DISTINCT COALESCE(p.audience_type, p.audience)) FILTER (WHERE COALESCE(p.audience_type, p.audience) IS NOT NULL) AS audience_mix
FROM public.profiles p
GROUP BY COALESCE(p.primary_need, 'not specified')
ORDER BY user_count DESC;

-- D3: Engagement tiers
CREATE OR REPLACE VIEW seg_by_engagement AS
SELECT
  p.id AS user_id,
  u.email,
  p.display_name,
  p.state,
  COALESCE(p.audience_type, p.audience) AS audience_type,
  p.primary_need,
  p.consent_email,
  p.engagement_score,
  p.total_events,
  p.last_activity,
  CASE
    WHEN p.engagement_score >= 20 THEN 'high'
    WHEN p.engagement_score >= 5 THEN 'medium'
    ELSE 'low'
  END AS engagement_tier,
  p.created_at AS joined_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
ORDER BY p.engagement_score DESC;

-- D4: Email-opted-in users (for outreach)
CREATE OR REPLACE VIEW seg_opted_in_emails AS
SELECT
  u.email,
  p.display_name,
  p.state,
  COALESCE(p.audience_type, p.audience) AS audience_type,
  p.primary_need,
  p.last_activity,
  p.engagement_score,
  p.created_at AS joined_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.consent_email = true
ORDER BY p.last_activity DESC NULLS LAST;

-- D5: Newsletter opted-in emails (separate from account holders)
CREATE OR REPLACE VIEW seg_newsletter_subscribers AS
SELECT
  n.email,
  n.source,
  n.page_slug,
  n.audience_type,
  n.tags,
  n.segments,
  n.created_at AS subscribed_at,
  p.display_name,
  COALESCE(pa.audience_type, pa.audience) AS profile_audience_type,
  pa.primary_need
FROM public.newsletter_signups n
LEFT JOIN public.profiles pa ON pa.id = n.user_id
LEFT JOIN auth.users p ON p.id = n.user_id
ORDER BY n.created_at DESC;

-- D6: Category interest (derived from activity_logs)
CREATE OR REPLACE VIEW seg_category_interest AS
SELECT
  category,
  COUNT(*) AS event_count,
  COUNT(DISTINCT user_id) AS unique_users,
  ARRAY_AGG(DISTINCT unnested_tag) FILTER (WHERE unnested_tag IS NOT NULL) AS all_tags
FROM (
  SELECT
    al.category,
    al.user_id,
    unnest(al.tags) AS unnested_tag
  FROM public.activity_logs al
  WHERE al.category IS NOT NULL
) sub
GROUP BY category
ORDER BY event_count DESC;

-- D7: Page engagement summary
CREATE OR REPLACE VIEW seg_page_engagement AS
SELECT
  page_slug,
  COUNT(*) AS total_views,
  COUNT(DISTINCT user_id) AS unique_visitors,
  COUNT(DISTINCT CASE WHEN event_type = 'resource_click' THEN user_id END) AS resource_clickers,
  COUNT(DISTINCT CASE WHEN event_type = 'filter_used' THEN user_id END) AS filter_users,
  MAX(created_at) AS last_seen
FROM public.activity_logs
WHERE page_slug IS NOT NULL
GROUP BY page_slug
ORDER BY total_views DESC;

-- ──────────────────────────────────────────────────────────────────────────────
-- PART E: REPORTING VIEWS
-- ──────────────────────────────────────────────────────────────────────────────

-- E1: Monthly usage summary (nonprofit reporting)
CREATE OR REPLACE VIEW report_monthly_usage AS
SELECT
  DATE_TRUNC('month', al.created_at) AS month,
  COUNT(*) AS total_events,
  COUNT(DISTINCT al.user_id) AS active_users,
  COUNT(DISTINCT CASE WHEN al.event_type = 'page_view' THEN al.user_id END) AS page_view_users,
  COUNT(DISTINCT CASE WHEN al.event_type = 'audit_started' THEN al.user_id END) AS audits_started,
  COUNT(DISTINCT CASE WHEN al.event_type = 'report_generated' THEN al.user_id END) AS reports_generated,
  COUNT(DISTINCT CASE WHEN al.event_type = 'email_capture' THEN al.user_id END) AS email_captures,
  COUNT(DISTINCT CASE WHEN al.event_type = 'resource_click' THEN al.user_id END) AS resource_clickers
FROM public.activity_logs al
GROUP BY DATE_TRUNC('month', al.created_at)
ORDER BY month DESC;

-- E2: Report generation counts by category
CREATE OR REPLACE VIEW report_by_category AS
SELECT
  r.category,
  r.tags,
  COUNT(*) AS report_count,
  COUNT(DISTINCT r.user_id) AS unique_users,
  DATE_TRUNC('month', r.created_at) AS month
FROM public.ai_reports r
WHERE r.category IS NOT NULL
GROUP BY r.category, r.tags, DATE_TRUNC('month', r.created_at)
ORDER BY month DESC, report_count DESC;

-- E3: Highly engaged users for outreach (combined account + newsletter)
CREATE OR REPLACE VIEW report_high_engagement AS
SELECT
  u.email,
  p.display_name,
  p.state,
  COALESCE(p.audience_type, p.audience) AS audience_type,
  p.primary_need,
  p.engagement_score,
  p.total_events,
  p.last_activity,
  p.consent_email,
  'account' AS source
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.engagement_score >= 10
UNION ALL
SELECT
  n.email,
  NULL AS display_name,
  NULL AS state,
  n.audience_type,
  NULL AS primary_need,
  0 AS engagement_score,
  0 AS total_events,
  n.created_at AS last_activity,
  true AS consent_email,
  'newsletter' AS source
FROM public.newsletter_signups n
WHERE n.user_id IS NULL
ORDER BY engagement_score DESC;

-- E4: Complete export view with all user data (for nonprofit reporting)
CREATE OR REPLACE VIEW report_full_user_export AS
SELECT
  p.id,
  u.email,
  p.display_name,
  p.state,
  COALESCE(p.audience_type, p.audience) AS audience_type,
  p.primary_need,
  p.secondary_needs,
  p.veteran_status,
  p.urgency_level,
  p.consent_email,
  p.consent_analytics,
  p.engagement_score,
  p.total_events,
  p.total_sessions,
  p.account_source,
  p.last_activity,
  p.created_at AS joined_at,
  (SELECT COUNT(*) FROM public.ai_reports r WHERE r.user_id = p.id) AS report_count,
  (SELECT COUNT(*) FROM public.template_outputs t WHERE t.user_id = p.id) AS document_count,
  (SELECT COUNT(*) FROM public.checklist_items c WHERE c.user_id = p.id AND c.is_completed = true) AS completed_actions
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
ORDER BY p.last_activity DESC NULLS LAST;

-- ──────────────────────────────────────────────────────────────────────────────
-- PART F: FUNCTION — increment engagement score on activity log insert
-- Keeps engagement_score current without batch queries
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_engagement_on_activity()
RETURNS TRIGGER AS $func$
DECLARE
  score_delta INTEGER;
BEGIN
  -- Score different events differently
  score_delta := CASE NEW.event_type
    WHEN 'page_view'        THEN 1
    WHEN 'resource_click'   THEN 2
    WHEN 'filter_used'      THEN 1
    WHEN 'audit_started'    THEN 5
    WHEN 'audit_completed'  THEN 10
    WHEN 'report_generated' THEN 10
    WHEN 'save_progress'    THEN 3
    WHEN 'email_capture'    THEN 5
    WHEN 'button_click'     THEN 1
    WHEN 'document_saved'   THEN 5
    ELSE 1
  END;

  -- Update profile engagement counters
  UPDATE public.profiles
  SET
    engagement_score = COALESCE(engagement_score, 0) + score_delta,
    total_events = COALESCE(total_events, 0) + 1,
    last_activity = NOW()
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to activity_logs
DROP TRIGGER IF EXISTS trg_increment_engagement ON public.activity_logs;
CREATE TRIGGER trg_increment_engagement
  AFTER INSERT ON public.activity_logs
  FOR EACH ROW EXECUTE FUNCTION increment_engagement_on_activity();

-- ──────────────────────────────────────────────────────────────────────────────
-- PART G: VERIFICATION QUERIES
-- ──────────────────────────────────────────────────────────────────────────────

-- Verify activity_logs columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'activity_logs' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verify profiles columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verify all views created
SELECT viewname
FROM pg_views
WHERE schemaname = 'public'
AND viewname LIKE 'seg_%' OR viewname LIKE 'report_%' OR viewname LIKE 'export_%'
ORDER BY viewname;
