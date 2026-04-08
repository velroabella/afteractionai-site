-- ══════════════════════════════════════════════════════════
-- After Action AI — Phase 9: Execution State Table
-- Run once in Supabase SQL Editor (project: afteractionai)
--
-- Creates: aios_user_state
--   user_id (uuid, PK, FK → auth.users)
--   state   (jsonb — full ExecutionState._state snapshot)
--   updated_at (timestamptz — auto-updated on upsert)
--
-- NOTE: Current JS implementation persists execution_state as
-- a subkey inside profiles.aios_memory for compatibility with
-- the existing saveAIOSMemory/loadAIOSMemory auth.js methods.
-- This table is the canonical target for future migration when
-- dedicated saveUserState/loadUserState methods are added to auth.js.
-- ══════════════════════════════════════════════════════════

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.aios_user_state (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Auto-update updated_at on every write
CREATE OR REPLACE FUNCTION public._aaai_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aios_user_state_updated_at ON public.aios_user_state;
CREATE TRIGGER trg_aios_user_state_updated_at
  BEFORE UPDATE ON public.aios_user_state
  FOR EACH ROW EXECUTE FUNCTION public._aaai_set_updated_at();

-- 3. Enable Row Level Security
ALTER TABLE public.aios_user_state ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies — each user can only read and write their own row
CREATE POLICY "aios_user_state: select own"
  ON public.aios_user_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "aios_user_state: insert own"
  ON public.aios_user_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "aios_user_state: update own"
  ON public.aios_user_state FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "aios_user_state: delete own"
  ON public.aios_user_state FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Index for fast single-row lookups (PK already covers this,
--    but explicit index makes EXPLAIN plans readable)
CREATE INDEX IF NOT EXISTS idx_aios_user_state_user_id
  ON public.aios_user_state (user_id);

-- ── Validation query (run after migration) ────────────────
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'aios_user_state'
-- ORDER BY ordinal_position;
-- Expected: user_id uuid | state jsonb | updated_at timestamptz
