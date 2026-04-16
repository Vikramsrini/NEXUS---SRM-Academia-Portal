import { broadcastPushNotification, verifyCronAuth } from '../../server/services/cronHelper.js';
import { getSupabaseAdmin } from '../../server/lib/supabase.js';

export default async function handler(req, res) {
  if (!verifyCronAuth(req, res)) return;

  try {
    console.log('[Cron] Checking tomorrow\'s day order...');
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(500).json({ error: 'DB unavailable' });
    }

    const { data: calendarData } = await supabase
      .from('global_calendar')
      .select('data')
      .eq('id', 1)
      .maybeSingle();

    if (!calendarData?.data) {
      return res.json({ sent: false, reason: 'No calendar data' });
    }

    // Support both legacy array shape and current object shape { calendar: [...] }.
    const calendarMonths = Array.isArray(calendarData.data)
      ? calendarData.data
      : Array.isArray(calendarData.data?.calendar)
        ? calendarData.data.calendar
        : [];
    if (!calendarMonths.length) {
      return res.json({ sent: false, reason: 'Calendar format invalid' });
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const day = tomorrow.getDate();
    const monthIdx = tomorrow.getMonth();
    const year = tomorrow.getFullYear();

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const searchMonth = `${monthNames[monthIdx]} ${year}`;
    
    const monthObj = calendarMonths.find(m => m.month === searchMonth);
    if (!monthObj) {
      return res.json({ sent: false, reason: 'Month not found' });
    }

    const dayObj = monthObj.days.find(d => parseInt(d.date) === day);
    if (!dayObj) {
      return res.json({ sent: false, reason: 'Day not found' });
    }

    let title = 'Tomorrow\'s Schedule';
    let body = '';

    if (dayObj.dayOrder) {
      body = `Tomorrow is ${dayObj.dayOrder}. Don't forget to pack according to your timetable!`;
    } else if (dayObj.event) {
      body = `Tomorrow is a Holiday: ${dayObj.event}. Enjoy!`;
    } else {
      body = 'Tomorrow is a likely holiday (No day order assigned).';
    }

    await broadcastPushNotification({ title, body, url: '/dashboard' });
    res.json({ sent: true, title, body, recipients: 'all' });
  } catch (err) {
    console.error('[Cron] Day Order error:', err);
    res.status(500).json({ error: err.message });
  }
}
