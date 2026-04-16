import { broadcastPushNotification, verifyCronAuth } from '../../server/services/cronHelper.js';
import { getSupabaseAdmin } from '../../server/lib/supabase.js';

export default async function handler(req, res) {
  if (!verifyCronAuth(req, res)) return;

  try {
    console.log('[Cron] Sending daily quote notification...');
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(500).json({ error: 'DB unavailable' });
    }

    // Get today's date key
    const dateKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    // Fetch today's thought from database
    const { data } = await supabase
      .from('daily_thoughts')
      .select('thought, author')
      .eq('date_key', dateKey)
      .maybeSingle();

    const thought = data?.thought || 'Stay motivated and keep grinding!';
    const author = data?.author || 'NEXUS';

    await broadcastPushNotification({
      title: 'Thought of the Day',
      body: `"${thought}" — ${author}`,
      url: '/dashboard'
    });
    res.json({ sent: true, title: 'Thought of the Day', recipients: 'all' });
  } catch (err) {
    console.error('[Cron] Quote error:', err);
    res.status(500).json({ error: err.message });
  }
}
