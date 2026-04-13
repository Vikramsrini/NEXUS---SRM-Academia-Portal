import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Logs attendance if it has changed since the last snapshot.
 * Call this inside your backend synchronization/scraping loop.
 */
export async function logAttendanceIfChanged(regNumber, courseCode, hoursConducted, hoursAbsent) {
  // Get the most recent snapshot
  const { data: lastSnapshot } = await supabase
    .from('attendance_snapshots')
    .select('*')
    .eq('reg_number', regNumber)
    .eq('course_code', courseCode)
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // If there's no previous snapshot, or the numbers changed, log it.
  if (!lastSnapshot || lastSnapshot.hours_conducted !== hoursConducted || lastSnapshot.hours_absent !== hoursAbsent) {
    await supabase.from('attendance_snapshots').insert({
      reg_number: regNumber,
      course_code: courseCode,
      hours_conducted: hoursConducted,
      hours_absent: hoursAbsent
    });
  }
}

/**
 * Saves the full attendance array as JSON for a user.
 */
export async function saveFullAttendance(regNumber, attendanceData) {
  const { error } = await supabase
    .from('attendance_user_state')
    .upsert({
      reg_number: regNumber,
      attendance_data: attendanceData,
      updated_at: new Date().toISOString()
    }, { onConflict: 'reg_number' });

  if (error) {
    console.error('[Snapshots] Error saving full attendance:', error.message);
  }
}

/**
 * Saves the full marks array as JSON for a user.
 */
export async function saveFullMarks(regNumber, marksData) {
  const { error } = await supabase
    .from('marks_user_state')
    .upsert({
      reg_number: regNumber,
      marks_data: marksData,
      updated_at: new Date().toISOString()
    }, { onConflict: 'reg_number' });

  if (error) {
    console.error('[Snapshots] Error saving full marks:', error.message);
  }
}

/**
 * Logs marks if they have changed since the last snapshot.
 * Call this inside your backend synchronization/scraping loop.
 */
export async function logMarksIfChanged(regNumber, courseCode, assessmentType, marksObtained, maxMarks) {
  const { data: lastSnapshot } = await supabase
    .from('marks_snapshots')
    .select('*')
    .eq('reg_number', regNumber)
    .eq('course_code', courseCode)
    .eq('assessment_type', assessmentType)
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastSnapshot || lastSnapshot.marks_obtained !== marksObtained || lastSnapshot.max_marks !== maxMarks) {
    await supabase.from('marks_snapshots').insert({
      reg_number: regNumber,
      course_code: courseCode,
      assessment_type: assessmentType,
      marks_obtained: marksObtained,
      max_marks: maxMarks
    });
  }
}

/**
 * Fetches recently updated records for a user within the last X days.
 * Use this to serve your frontend GET /api/recent-updates endpoint.
 */
export async function getRecentUpdates(regNumber, days = 7) {
  const dateLimit = new Date();
  dateLimit.setDate(dateLimit.getDate() - days);

  // Fetch recent attendance
  const { data: attendanceUpdates } = await supabase
    .from('attendance_snapshots')
    .select('*')
    .eq('reg_number', regNumber)
    .gte('synced_at', dateLimit.toISOString())
    .order('synced_at', { ascending: false });

  // Fetch recent marks
  const { data: marksUpdates } = await supabase
    .from('marks_snapshots')
    .select('*')
    .eq('reg_number', regNumber)
    .gte('synced_at', dateLimit.toISOString())
    .order('synced_at', { ascending: false });

  return {
    attendanceUpdates: attendanceUpdates || [],
    marksUpdates: marksUpdates || []
  };
}