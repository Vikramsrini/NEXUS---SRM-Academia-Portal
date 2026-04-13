-- Supabase Schema for Mistral Wordle Game

-- Table to store the daily Generated Word from Mistral
CREATE TABLE IF NOT EXISTS public.daily_wordle (
  date_key TEXT PRIMARY KEY,
  word TEXT NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table to store leaderboard and scores per user
CREATE TABLE IF NOT EXISTS public.wordle_scores (
  netid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  total_score INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  last_played_date TEXT,
  last_played_at TIMESTAMP WITH TIME ZONE
);

-- Add tracking for individual game results if we want detailed history (optional, keeping it simple for now)
-- The leaderboard is just based on `total_score` and `streak`.
