import { getSupabaseAdmin } from '../lib/supabase.js';

console.log('✅ [Attendance DB] New Presence tracking system initialized.');

/**
 * Saves or updates a single row per user to track attendance changes for the current day.
 * This satisfies the "one row for one user" requirement.
 * @param {string} regNumber 
 * @param {Array} attendance Array of { courseCode, hoursConducted, hoursAbsent, courseTitle, ... }
 */
export async function saveAttendanceSnapshot(regNumber, attendance) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn('[Attendance DB] Supabase client could not be initialized');
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];

  try {
    // Check if we have an existing row for this user
    const { data: existing, error } = await supabase
      .from('attendance_presence')
      .select('*')
      .eq('reg_number', regNumber)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
       console.error('[Attendance DB] Query error:', error.message);
       return;
    }

    // Determine if we should reset the "initial" state (it's a new day or new user)
    const isNewDay = !existing || existing.day_order_date !== todayStr;

    if (isNewDay) {
      console.log(`[Attendance DB] New day snapshot for ${regNumber}. Setting initial base.`);
      const { error: insErr } = await supabase.from('attendance_presence').upsert({
        reg_number: regNumber,
        initial_attendance: attendance,
        current_attendance: attendance,
        day_order_date: todayStr,
        last_synced_at: new Date().toISOString(),
      });
      if (insErr) console.error('[Attendance DB] Upsert initial error:', insErr.message);
    } else {
      console.log(`[Attendance DB] Updating current snapshot for ${regNumber}.`);
      const { error: updErr } = await supabase.from('attendance_presence').update({
        current_attendance: attendance,
        last_synced_at: new Date().toISOString(),
      }).eq('reg_number', regNumber);
      if (updErr) console.error('[Attendance DB] Update error:', updErr.message);
    }

  } catch (err) {
    console.error('[Attendance DB] Unexpected error:', err.message);
  }
}

/**
 * Determines if a course was attended today by comparing current vs initial counts from the same row.
 * @param {string} regNumber 
 * @param {string} courseCode 
 * @returns {Promise<'present' | 'absent' | 'pending' | 'not_tracked'>}
 */
export async function getPresenceForCourse(regNumber, courseCode) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 'not_tracked';

  try {
    const { data, error } = await supabase
      .from('attendance_presence')
      .select('*')
      .eq('reg_number', regNumber)
      .limit(1)
      .single();

    if (error || !data) return 'pending';

    const findItem = (list) => list.find(it => 
      (it.courseCode === courseCode) || 
      (it.courseTitle && it.courseTitle.includes(courseCode))
    );

    const first = findItem(data.initial_attendance || []);
    const last = findItem(data.current_attendance || []);

    if (!first || !last) return 'pending';

    const conductedDiff = parseInt(last.hoursConducted) - parseInt(first.hoursConducted);
    const absentDiff = parseInt(last.hoursAbsent) - parseInt(first.hoursAbsent);

    // Only return present/absent if there is a detected shift in conducted hours
    if (conductedDiff > 0) {
      return absentDiff > 0 ? 'absent' : 'present';
    }

    // Default to pending (which means "no update yet" or "not yet occurred")
    return 'pending';
  } catch (err) {
    console.error('[Presence] Logic error:', err.message);
    return 'pending';
  }
}
