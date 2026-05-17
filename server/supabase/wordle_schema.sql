-- Supabase Schema for Mistral Wordle Game

-- Table to store the daily Generated Word from Mistral
CREATE TABLE IF NOT EXISTS public.daily_wordle (
  date_key TEXT PRIMARY KEY,
  word TEXT NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- IST week leaderboard + snapshot for podium (cron copies total → cumulative, then clears total).
-- week_key format: YYYY-MM-DD (Sunday start of IST week, matches app getWeekKey())
CREATE TABLE IF NOT EXISTS public.wordle_scores (
  netid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  total_score INTEGER DEFAULT 0,  -- Current IST week (sidebar leaderboard during the week)
  cumulative_score INTEGER DEFAULT 0,  -- Last IST week finalized total (weekly winners podium after cron)
  streak INTEGER DEFAULT 0,
  last_played_date TEXT,
  last_played_at TIMESTAMP WITH TIME ZONE,
  week_key TEXT
);

-- Prevents duplicate Vercel cron invocations in the same IST week
CREATE TABLE IF NOT EXISTS public.wordle_meta (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_reset_week_key TEXT,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.wordle_meta (id, last_reset_week_key)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

-- Add columns if they don't exist (for existing installations)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wordle_scores' AND column_name = 'week_key') THEN
    ALTER TABLE public.wordle_scores ADD COLUMN week_key TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wordle_scores' AND column_name = 'cumulative_score') THEN
    ALTER TABLE public.wordle_scores ADD COLUMN cumulative_score INTEGER DEFAULT 0;
  END IF;
END $$;

-- Snapshot active weekly totals → cumulative_score, then zero total_score.
-- If total_score is already 0 (second cron), cumulative_score is left unchanged.
CREATE OR REPLACE FUNCTION public.reset_wordle_weekly_scores()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.wordle_scores
  SET cumulative_score = CASE
        WHEN COALESCE(total_score, 0) > 0 THEN total_score
        ELSE cumulative_score
      END,
      total_score = 0;
$$;

COMMENT ON FUNCTION public.reset_wordle_weekly_scores() IS
  'Wordle weekly rollover: copy total_score to cumulative_score when > 0, then zero weekly totals. Safe if cron runs twice.';

CREATE OR REPLACE FUNCTION public.reset_wordle_weekly_scores_guarded(p_week_key TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  already_done BOOLEAN;
BEGIN
  SELECT last_reset_week_key = p_week_key INTO already_done
  FROM public.wordle_meta
  WHERE id = 1;

  IF already_done IS TRUE THEN
    RETURN FALSE;
  END IF;

  PERFORM public.reset_wordle_weekly_scores();

  UPDATE public.wordle_meta
  SET last_reset_week_key = p_week_key,
      updated_at = timezone('utc'::text, now())
  WHERE id = 1;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.reset_wordle_weekly_scores_guarded(TEXT) IS
  'Runs weekly Wordle rollover at most once per p_week_key (IST Sunday YYYY-MM-DD).';
