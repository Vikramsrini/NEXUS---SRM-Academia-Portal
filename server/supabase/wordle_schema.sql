-- Supabase Schema for Mistral Wordle Game

-- Table to store the daily Generated Word from Mistral
CREATE TABLE IF NOT EXISTS public.daily_wordle (
  date_key TEXT PRIMARY KEY,
  word TEXT NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table to store weekly leaderboard and scores per user (resets every Monday 12 AM IST)
-- week_key format: YYYY-MM-DD (Monday of that week)
CREATE TABLE IF NOT EXISTS public.wordle_scores (
  netid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  total_score INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  last_played_date TEXT,
  last_played_at TIMESTAMP WITH TIME ZONE,
  week_key TEXT  -- YYYY-MM-DD format of Monday of current week
);

-- Add week_key column if it doesn't exist (for existing installations)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wordle_scores' AND column_name = 'week_key') THEN
    ALTER TABLE public.wordle_scores ADD COLUMN week_key TEXT;
  END IF;
END $$;
