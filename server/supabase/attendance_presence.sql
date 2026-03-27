-- Optimized Attendance Presence Tracking Table
-- Stores a single row per user to minimize database clutter
CREATE TABLE IF NOT EXISTS public.attendance_presence (
    reg_number TEXT PRIMARY KEY,
    initial_attendance JSONB NOT NULL, -- Recorded at the first sync of the day
    current_attendance JSONB NOT NULL, -- Updated on every sync
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    day_order_date DATE DEFAULT CURRENT_DATE -- To reset initial_attendance every day
);

-- Enable RLS (Assuming admin access for backend)
ALTER TABLE public.attendance_presence DISABLE ROW LEVEL SECURITY;
