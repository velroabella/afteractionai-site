/* ══════════════════════════════════════════════════════════
   AfterAction AI — AIOS Checklist Schema Extension
   File: 05_aios_checklist_schema.sql
   Safe to run on existing data — only ADDs columns, no drops.
   ══════════════════════════════════════════════════════════ */

-- ── PART A: Extend checklist_items with full task model ──
ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS status        TEXT        NOT NULL DEFAULT 'not_started'
                                         CHECK (status IN ('not_started','in_progress','completed','skipped')),
  ADD COLUMN IF NOT EXISTS priority      INTEGER     NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS due_context   TEXT,
  ADD COLUMN IF NOT EXISTS source        TEXT        NOT NULL DEFAULT 'ai_report'
                                         CHECK (source IN ('ai_report','template_flow','manual','resource')),
  ADD COLUMN IF NOT EXISTS resource_link TEXT,
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();

-- ── PART B: Migrate existing boolean is_completed → status ──
-- Rows that were marked complete get status = completed.
-- All others stay not_started (the column default).
UPDATE public.checklist_items
  SET status = 'completed'
  WHERE is_completed = TRUE
    AND status = 'not_started';

-- ── PART C: Map category labels → priority integers ──
-- Lower number = higher priority.  immediate=1, short_term=2, strategic=3, optional=4
UPDATE public.checklist_items SET priority = 1 WHERE category = 'immediate';
UPDATE public.checklist_items SET priority = 2 WHERE category = 'short_term';
UPDATE public.checklist_items SET priority = 3 WHERE category = 'strategic';
UPDATE public.checklist_items SET priority = 4 WHERE category = 'optional';

-- ── PART D: updated_at auto-refresh trigger ──
CREATE OR REPLACE FUNCTION public.update_checklist_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS
$func$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_checklist_updated_at ON public.checklist_items;
CREATE TRIGGER trg_checklist_updated_at
  BEFORE UPDATE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_checklist_updated_at();

-- ── PART E: Index for fast next-step queries ──
CREATE INDEX IF NOT EXISTS idx_checklist_user_priority
  ON public.checklist_items (user_id, priority, sort_order)
  WHERE status NOT IN ('completed', 'skipped');

-- ── PART F: v_active_checklist — active tasks per user ──
-- Used by the "Next Step" + returning user logic.
CREATE OR REPLACE VIEW public.v_active_checklist AS
SELECT
  ci.id,
  ci.user_id,
  ci.report_id,
  ci.title,
  ci.description,
  ci.category,
  ci.priority,
  ci.status,
  ci.source,
  ci.resource_link,
  ci.due_context,
  ci.sort_order,
  ci.created_at,
  ci.updated_at,
  p.display_name,
  p.audience_type,
  p.primary_need
FROM public.checklist_items ci
LEFT JOIN public.profiles p ON p.id = ci.user_id
WHERE ci.status NOT IN ('completed', 'skipped')
ORDER BY ci.user_id, ci.priority ASC, ci.sort_order ASC;

-- ── PART G: RLS — ensure new columns are protected ──
-- Existing RLS policies already cover all columns on the table;
-- no new policy needed.  Verify with:
-- SELECT policyname FROM pg_policies WHERE tablename = 'checklist_items';

-- ── VERIFICATION QUERY ──
-- Run this after executing the above to confirm:
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'checklist_items'
ORDER BY ordinal_position;
