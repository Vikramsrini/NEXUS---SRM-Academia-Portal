import webPush from 'web-push';
import { getSupabaseAdmin } from '../lib/supabase.js';

// Configure web-push with VAPID keys
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

if (publicVapidKey && privateVapidKey) {
  webPush.setVapidDetails(
    'mailto:nexus-portal@example.com',
    publicVapidKey,
    privateVapidKey
  );
}

/**
 * Broadcast push notification to all subscribers
 */
export async function broadcastPushNotification(payload) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('DB unavailable');

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*');

  if (!subs || subs.length === 0) {
    console.log('[Push] No subscriptions found');
    return { sent: 0 };
  }

  const results = await Promise.allSettled(subs.map(sub => {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    };
    return webPush.sendNotification(pushSubscription, JSON.stringify(payload)).catch(e => {
      if (e.statusCode === 410 || e.statusCode === 404) {
        // Subscription expired, remove it
        return supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
      throw e;
    });
  }));

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  console.log(`[Push] Sent to ${succeeded}/${subs.length} subscribers`);
  return { sent: succeeded, total: subs.length };
}

/**
 * Verify cron request authorization
 */
export function verifyCronAuth(req, res) {
  const authHeader = req.headers.authorization;
  const expectedSecret = process.env.CRON_SECRET;
  
  if (!expectedSecret) {
    res.status(500).json({ error: 'CRON_SECRET not configured' });
    return false;
  }
  
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (token !== expectedSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  
  return true;
}
