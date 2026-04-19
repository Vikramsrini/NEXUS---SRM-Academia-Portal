import { Router } from 'express';
import axios from 'axios';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { requireAuth } from '../middleware/authToken.js';

const router = Router();

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = 'mistral-small-latest';
const TIMEZONE = 'Asia/Kolkata';

function getDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getWeekKey() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
  });
  const year = fmt.format(now);
  
  // Get current date in IST
  const istDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m, d] = istDateStr.split('-').map(Number);
  const istDate = new Date(Date.UTC(y, m - 1, d));
  
  // Find Monday of current week (week starts Monday 12 AM IST)
  const dayOfWeek = istDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(istDate);
  monday.setUTCDate(istDate.getUTCDate() - daysSinceMonday);
  
  // Format as YYYY-MM-DD of Monday
  const weekStart = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
  
  return weekStart;
}

async function generateDailyWord(excludeWords = []) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('Mistral API Key missing.');

  const excludeList = excludeWords.length > 0 
    ? `\n\nIMPORTANT: Do NOT use any of these words: ${excludeWords.join(', ')}.`
    : '';

  const response = await axios.post(
    MISTRAL_API_URL,
    {
      model: MISTRAL_MODEL,
      temperature: 0.7, // Increased temperature for more variety
      max_tokens: 30,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a Wordle word generator. Generate exactly one 5-letter English word. Output it in JSON format: {"word": "APPLE"}. The word should be of medium difficulty - not too common/easy (avoid words like APPLE, WATER, SMILE) but not extremely obscure. Use words that require some thought but are still valid English words (e.g., CRANE, SLATE, GHOST, BRAIN, FLASK).${excludeList}`
        },
        {
          role: 'user',
          content: 'Give me a new 5-letter word for today.'
        }
      ]
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }
  );

  const content = response.data?.choices?.[0]?.message?.content || '{}';
  let word = '';
  try {
    const parsed = JSON.parse(content);
    word = String(parsed.word || '').replace(/[^a-zA-Z]/g, '').toUpperCase().trim();
  } catch (e) {
    word = content.replace(/[^a-zA-Z]/g, '').toUpperCase().trim();
  }
  
  if (word.length !== 5) {
    throw new Error(`Mistral generated invalid word: ${word}`);
  }
  return word;
}

// Ensure the daily word exists, otherwise generate it
async function getOrCreateDailyWord(supabase, dateKey) {
  // Try to fetch existing
  const { data } = await supabase
    .from('daily_wordle')
    .select('word')
    .eq('date_key', dateKey)
    .maybeSingle();

  if (data && data.word && data.word.trim().length === 5) return data.word.trim().toUpperCase();

  // Fetch recent words to avoid repeats (last 30 days)
  const { data: recentWordsData } = await supabase
    .from('daily_wordle')
    .select('word')
    .order('generated_at', { ascending: false })
    .limit(30);
  
  const recentWords = (recentWordsData || []).map(row => row.word.toUpperCase());

  // Generate new
  let freshWord = 'NEXUS'; // fallback
  try {
    freshWord = await generateDailyWord(recentWords);
  } catch (err) {
    console.error('[Wordle] Mistral generator error:', err.message);
  }

  // Save to DB (using insert avoids overwriting if a concurrent request just saved it)
  const { error } = await supabase
    .from('daily_wordle')
    .insert({ date_key: dateKey, word: freshWord });

  // If insert fails due to unique constraint (23505), another request beat us to it.
  if (error && error.code === '23505') {
    const { data: retryData } = await supabase
      .from('daily_wordle')
      .select('word')
      .eq('date_key', dateKey)
      .maybeSingle();
    if (retryData && retryData.word) return retryData.word;
  }

  return freshWord;
}

router.get('/daily-word', requireAuth, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(500).json({ error: 'DB unavailable' });

    const dateKey = getDateKey();
    const word = await getOrCreateDailyWord(supabase, dateKey);
    res.json({ word, dateKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/state', requireAuth, async (req, res) => {
  try {
    const netid = req.headers['x-user-netid'];
    if (!netid) return res.status(400).json({ error: 'Missing NetID' });

    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(500).json({ error: 'DB unavailable' });

    const { data } = await supabase
      .from('wordle_scores')
      .select('*')
      .eq('netid', netid)
      .maybeSingle();

    if (!data) return res.json({ playedToday: false, score: 0 });

    const dateKey = getDateKey();
    const playedToday = data.last_played_date === dateKey;

    res.json({ playedToday, score: data.total_score, streak: data.streak });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/submit', requireAuth, async (req, res) => {
  try {
    const netid = req.headers['x-user-netid'];
    const name = req.headers['x-user-name'];
    
    if (!netid) return res.status(400).json({ error: 'Missing NetID' });
    
    const { pointsWon, won } = req.body;
    
    if (typeof pointsWon !== 'number') return res.status(400).json({ error: 'Invalid payload' });

    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(500).json({ error: 'DB unavailable' });

    const dateKey = getDateKey();
    const weekKey = getWeekKey();

    // Check if already played today
    const { data: current } = await supabase
      .from('wordle_scores')
      .select('*')
      .eq('netid', netid)
      .maybeSingle();

    if (current?.last_played_date === dateKey) {
      return res.status(400).json({ error: 'Already played today' });
    }

    // Current weekly score updates
    const newScore = (current?.total_score || 0) + pointsWon;
    
    // We no longer update cumulative_score here as it's now used to store
    // the PREVIOUS week's final score (updated via the weekly reset cron).
    
    let newStreak = won ? (current?.streak || 0) + 1 : 0;

    await supabase
      .from('wordle_scores')
      .upsert({
        netid,
        name: name || current?.name || 'Anonymous',
        total_score: newScore,
        streak: newStreak,
        last_played_date: dateKey,
        last_played_at: new Date().toISOString(),
        week_key: weekKey
      }, { onConflict: 'netid' });

    res.json({ success: true, score: newScore, streak: newStreak });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/leaderboard', requireAuth, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(500).json({ error: 'DB unavailable' });

    // Get leaderboard by total_score - only showing active players with points > 0
    const { data } = await supabase
      .from('wordle_scores')
      .select('name, total_score, streak')
      .gt('total_score', 0)
      .order('total_score', { ascending: false })
      .limit(10);

    const leaderboard = (data || []).map(item => ({
      name: item.name,
      points: item.total_score,
      streak: item.streak
    }));

    res.json({ 
      leaderboard,
      weekKey: getWeekKey()
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/alltime-leaderboard', requireAuth, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(500).json({ error: 'DB unavailable' });

    // Get all-time leaderboard using cumulative_score
    const { data } = await supabase
      .from('wordle_scores')
      .select('name, cumulative_score, streak')
      .order('cumulative_score', { ascending: false })
      .limit(10);

    const allTimeLeaderboard = (data || []).map(item => ({
      name: item.name,
      points: item.cumulative_score,
      streak: item.streak
    }));

    res.json({ allTimeLeaderboard });
  } catch (err) {
    console.error('[Wordle] All-time leaderboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/weekly-winners', requireAuth, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(500).json({ error: 'DB unavailable' });

    // Get last completed week (previous Monday)
    const now = new Date();
    const istDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const [y, m, d] = istDateStr.split('-').map(Number);
    const istDate = new Date(Date.UTC(y, m - 1, d));
    
    // Find Monday of current week
    const dayOfWeek = istDate.getUTCDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const currentMonday = new Date(istDate);
    currentMonday.setUTCDate(istDate.getUTCDate() - daysSinceMonday);
    
    // Get previous Monday (last week's start)
    const prevMonday = new Date(currentMonday);
    prevMonday.setUTCDate(currentMonday.getUTCDate() - 7);
    const lastWeekKey = `${prevMonday.getUTCFullYear()}-${String(prevMonday.getUTCMonth() + 1).padStart(2, '0')}-${String(prevMonday.getUTCDate()).padStart(2, '0')}`;

    // Get top 3 from last week using cumulative_score
    // (This column is populated with the previous week's final total_score during the reset)
    const { data } = await supabase
      .from('wordle_scores')
      .select('name, cumulative_score, streak')
      .gt('cumulative_score', 0)
      .order('cumulative_score', { ascending: false })
      .limit(3);

    // Map to expected format
    const winners = (data || []).map(item => ({
      name: item.name,
      points: item.cumulative_score,
      streak: item.streak
    }));

    res.json({ 
      winners, 
      weekKey: lastWeekKey,
      currentWeek: getWeekKey()
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
