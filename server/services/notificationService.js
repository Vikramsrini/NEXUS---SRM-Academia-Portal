import webPush from 'web-push';
import cron from 'node-cron';
import { getSupabaseAdmin } from '../lib/supabase.js';

/**
 * Sends a notification to all subscribed devices for a specific user
 */
export async function sendPushNotification(regNumber, payload) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('reg_number', regNumber);

  if (!subs || subs.length === 0) return;

  const results = await Promise.all(subs.map(sub => {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    };
    return webPush.sendNotification(pushSubscription, JSON.stringify(payload)).catch(e => {
      if (e.statusCode === 410 || e.statusCode === 404) {
        return supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
      console.warn('[Push Service] Send error for sub:', sub.id, e.message);
    });
  }));

  return results;
}

/**
 * Broadcast to ALL users
 */
export async function broadcastPushNotification(payload) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*');

  if (!subs || subs.length === 0) return;

  await Promise.allSettled(subs.map(sub => {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    };
    return webPush.sendNotification(pushSubscription, JSON.stringify(payload)).catch(e => {
      if (e.statusCode === 410 || e.statusCode === 404) {
        return supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    });
  }));
}

/**
 * Initializes daily check for Tomorrow's Day Order and Wordle
 */
export function initNotificationCrons() {
  // 1. Tomorrow's Day Order (Run every day at 8:00 PM)
  cron.schedule('0 20 * * *', async () => {
    console.log('[Cron] Checking tomorrow\'s day order...');
    try {
      const supabase = getSupabaseAdmin();
      const { data: calendarData } = await supabase.from('global_calendar').select('data').eq('id', 1).maybeSingle();
      if (!calendarData?.data) return;

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const day = tomorrow.getDate();
      const monthIdx = tomorrow.getMonth(); // 0-11
      const year = tomorrow.getFullYear();

      // Find tomorrow in calendar
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const searchMonth = `${monthNames[monthIdx]} ${year}`;
      
      const monthObj = calendarData.data.find(m => m.month === searchMonth);
      if (!monthObj) return;

      const dayObj = monthObj.days.find(d => parseInt(d.date) === day);
      if (!dayObj) return;

      let title = 'Tomorrow\'s Schedule';
      let body = '';

      if (dayObj.dayOrder) {
        body = `Tomorrow is ${dayObj.dayOrder}. Don't forget to pack according to your timetable!`;
      } else if (dayObj.event) {
        body = `Tomorrow is a Holiday: ${dayObj.event}. Enjoy!`;
      } else {
        body = 'Tomorrow is a likely holiday (No day order assigned).';
      }

      await broadcastPushNotification({
        title,
        body,
        url: '/dashboard'
      });
    } catch (err) {
      console.error('[Cron] Day Order Notification error:', err.message);
    }
  });

  // 2. Wordle Refresh (Run every day at Midnight 00:01)
  cron.schedule('1 0 * * *', async () => {
    console.log('[Cron] New Wordle word notification...');
    await broadcastPushNotification({
      title: 'New Wordle Word!',
      body: 'Today\'s 5-letter word is now available. Can you guess it in 6 tries?',
      url: '/dashboard/wordle'
    });
  });

  console.log('[Push Service] Notification crons initialized');
}
