import { getSupabaseAdmin } from '../../server/lib/supabase.js';
import { verifyCronAuth } from '../../server/services/cronHelper.js';
import { performWordleWeeklyReset } from '../../server/services/wordleWeeklyReset.js';

export default async function handler(req, res) {
  if (!verifyCronAuth(req, res)) return;

  try {
    console.log('[Cron] Performing weekly Wordle reset...');
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(500).json({ error: 'DB unavailable' });

    const { data: winners } = await supabase
      .from('wordle_scores')
      .select('name, total_score')
      .gt('total_score', 0)
      .order('total_score', { ascending: false })
      .limit(3);

    const { weekKey, ran } = await performWordleWeeklyReset();

    res.json({
      success: true,
      weekKey,
      ran,
      winnersFound: winners?.length || 0,
    });
  } catch (err) {
    console.error('[Cron] Weekly Reset error:', err);
    res.status(500).json({ error: err.message });
  }
}
