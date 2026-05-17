import { getSupabaseAdmin } from '../lib/supabase.js';

const TIMEZONE = 'Asia/Kolkata';

/** IST week start (Sunday) as YYYY-MM-DD — must match server/routes/wordle.js getWeekKey(). */
export function getIstWeekKey(date = new Date()) {
  const istDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const [y, m, d] = istDateStr.split('-').map(Number);
  const istDate = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = istDate.getUTCDay();
  const sunday = new Date(istDate);
  sunday.setUTCDate(istDate.getUTCDate() - dayOfWeek);
  return `${sunday.getUTCFullYear()}-${String(sunday.getUTCMonth() + 1).padStart(2, '0')}-${String(sunday.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Snapshots IST-week totals into cumulative_score (weekly winners podium), then zeros total_score.
 * Uses DB guard so duplicate Vercel cron invocations cannot wipe cumulative_score.
 */
export async function performWordleWeeklyReset() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('DB unavailable');

  const weekKey = getIstWeekKey();

  const { data: ran, error: guardedError } = await supabase.rpc('reset_wordle_weekly_scores_guarded', {
    p_week_key: weekKey,
  });

  if (!guardedError) {
    if (ran === false) {
      console.log(`[Wordle weekly reset] Already completed for IST week ${weekKey}, skipping`);
    }
    return { weekKey, ran: ran !== false };
  }

  console.warn('[Wordle weekly reset] Guarded RPC failed, trying base RPC:', guardedError.message);

  const { error: sqlError } = await supabase.rpc('reset_wordle_weekly_scores');

  if (!sqlError) return { weekKey, ran: true };

  console.warn('[Wordle weekly reset] RPC failed, manual fallback:', sqlError.message);

  const { data: allScores } = await supabase.from('wordle_scores').select('netid, total_score, cumulative_score');

  if (!allScores?.length) return { weekKey, ran: true };

  for (const user of allScores) {
    const weekly = user.total_score ?? 0;
    await supabase
      .from('wordle_scores')
      .update({
        cumulative_score: weekly > 0 ? weekly : (user.cumulative_score ?? 0),
        total_score: 0,
      })
      .eq('netid', user.netid);
  }

  return { weekKey, ran: true };
}
