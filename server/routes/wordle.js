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

async function generateDailyWord() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('Mistral API Key missing.');

  const response = await axios.post(
    MISTRAL_API_URL,
    {
      model: MISTRAL_MODEL,
      temperature: 0.4,
      max_tokens: 30,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a Wordle word generator. Generate exactly one 5-letter English word. Output it in JSON format: {"word": "APPLE"}. The word MUST be extremely common, simple, and easy to guess (e.g., HEART, WATER, SMILE, CLOUD). Avoid obscure, rare, or complex words.'
        },
        {
          role: 'user',
          content: 'Give me a 5-letter word for today.'
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

  // Generate new
  let freshWord = 'NEXUS'; // fallback
  try {
    freshWord = await generateDailyWord();
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

    // Check if already played today
    const { data: current } = await supabase
      .from('wordle_scores')
      .select('*')
      .eq('netid', netid)
      .maybeSingle();

    if (current?.last_played_date === dateKey) {
      return res.status(400).json({ error: 'Already played today' });
    }

    let newScore = (current?.total_score || 0) + pointsWon;
    let newStreak = won ? (current?.streak || 0) + 1 : 0;

    await supabase
      .from('wordle_scores')
      .upsert({
        netid,
        name: name || current?.name || 'Anonymous',
        total_score: newScore,
        streak: newStreak,
        last_played_date: dateKey,
        last_played_at: new Date().toISOString()
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

    const { data } = await supabase
      .from('wordle_scores')
      .select('name, total_score, streak')
      .order('total_score', { ascending: false })
      .limit(10);

    res.json({ leaderboard: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
