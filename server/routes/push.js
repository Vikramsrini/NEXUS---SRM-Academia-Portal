import { Router } from 'express';
import webPush from 'web-push';
import { requireAuth } from '../middleware/authToken.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

const router = Router();

// VAPID keys should be in .env. 
// If not present, this will error on startup if we don't handle it.
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

if (publicVapidKey && privateVapidKey) {
  webPush.setVapidDetails(
    'mailto:nexus-portal@example.com',
    publicVapidKey,
    privateVapidKey
  );
}

// Get public key for frontend
router.get('/push/key', requireAuth, (req, res) => {
  if (!publicVapidKey) return res.status(500).json({ error: 'VAPID keys not configured on server' });
  res.json({ publicKey: publicVapidKey });
});

// Register subscription
router.post('/push/subscribe', requireAuth, async (req, res) => {
  const { subscription, regNumber } = req.body;
  
  if (!subscription || !regNumber) {
    return res.status(400).json({ error: 'Missing subscription or regNumber' });
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(500).json({ error: 'DB unavailable' });

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        reg_number: regNumber,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      }, { onConflict: 'endpoint' });

    if (error) throw error;

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('[Push] Subscribe error:', err.message);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Admin endpoint to trigger a test notification
router.post('/push/test', requireAuth, async (req, res) => {
  const { regNumber, title, body } = req.body;
  
  try {
    const supabase = getSupabaseAdmin();
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('reg_number', regNumber);

    if (!subs || subs.length === 0) return res.status(404).json({ error: 'No subscriptions found' });

    const results = await Promise.all(subs.map(sub => {
      const payload = JSON.stringify({ title, body, url: '/' });
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };
      return webPush.sendNotification(pushSubscription, payload).catch(e => {
        if (e.statusCode === 410 || e.statusCode === 404) {
          // Subscription expired/invalid, remove it
          return supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
        throw e;
      });
    }));

    res.json({ success: true, count: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
