import { getSupabaseAdmin } from '../lib/supabase.js';

/**
 * Copies weekly totals into cumulative_score (for podium), then zeros total_score.
 * Used by HTTP cron and optional internal node-cron on non-Vercel production hosts.
 */
export async function performWordleWeeklyReset() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('DB unavailable');

  const { error: sqlError } = await supabase.rpc('reset_wordle_weekly_scores');

  if (!sqlError) return;

  console.warn('[Wordle weekly reset] RPC failed, manual fallback:', sqlError.message);

  const { data: allScores } = await supabase.from('wordle_scores').select('netid, total_score');

  if (!allScores?.length) return;

  for (const user of allScores) {
    await supabase
      .from('wordle_scores')
      .update({
        cumulative_score: user.total_score ?? 0,
        total_score: 0,
      })
      .eq('netid', user.netid);
  }
}
