-- Supabase Schema for Mistral Wordle Game

-- Table to store the daily Generated Word from Mistral
CREATE TABLE IF NOT EXISTS public.daily_wordle (
  date_key TEXT PRIMARY KEY,
  word TEXT NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table to store weekly leaderboard and scores per user (weekly reset via cron)
-- week_key format: YYYY-MM-DD (Sunday start of IST week, matches app getWeekKey())
CREATE TABLE IF NOT EXISTS public.wordle_scores (
  netid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  total_score INTEGER DEFAULT 0,  -- Current IST week's score (shown on leaderboard)
  cumulative_score INTEGER DEFAULT 0,  -- Last completed week's final score (for weekly winners podium)
  streak INTEGER DEFAULT 0,
  last_played_date TEXT,
  last_played_at TIMESTAMP WITH TIME ZONE,
  week_key TEXT
);

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

-- Called by cron before notifying users: snapshot weekly totals into cumulative_score, then zero totals.
CREATE OR REPLACE FUNCTION public.reset_wordle_weekly_scores()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.wordle_scores
  SET cumulative_score = COALESCE(total_score, 0),
      total_score = 0;
$$;

COMMENT ON FUNCTION public.reset_wordle_weekly_scores() IS 'Wordle weekly reset: copy total_score to cumulative_score, clear weekly totals.';
