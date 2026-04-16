import { Router } from 'express';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { broadcastPushNotification } from '../services/notificationService.js';

const router = Router();

// Verify cron secret to ensure only authorized callers (Vercel) can trigger
function verifyCronAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }

  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

// Tomorrow's Day Order - 8:00 PM
router.get('/day-order', verifyCronAuth, async (req, res) => {
  try {
    console.log('[Cron] Checking tomorrow\'s day order...');
    const supabase = getSupabaseAdmin();
    const { data: calendarData } = await supabase.from('global_calendar').select('data').eq('id', 1).maybeSingle();
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

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
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
      body = `Tomorrow is Day Order ${dayObj.dayOrder}. Don't forget to pack according to your timetable!`;
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
});

// Daily Quote - 8:00 AM
router.get('/quote', verifyCronAuth, async (req, res) => {
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
});

// Wordle Refresh - 12:01 AM
router.get('/wordle', verifyCronAuth, async (req, res) => {
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
});


export default router;
