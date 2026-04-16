import { broadcastPushNotification, verifyCronAuth } from '../../server/services/cronHelper.js';

export default async function handler(req, res) {
  if (!verifyCronAuth(req, res)) return;

  try {
    console.log('[Cron] New Wordle word notification...');
    await broadcastPushNotification({
      title: 'New Wordle Word!',
      body: 'Today\'s 5-letter word is now available. Can you guess it in 6 tries?',
      url: '/dashboard/wordle'
    });
    res.json({ sent: true, title: 'New Wordle Word!', recipients: 'all' });
  } catch (err) {
    console.error('[Cron] Wordle error:', err);
    res.status(500).json({ error: err.message });
  }
}
