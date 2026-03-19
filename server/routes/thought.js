import { Router } from 'express';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabaseAdmin } from '../lib/supabase.js';

const router = Router();

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = process.env.THOUGHT_OF_DAY_MISTRAL_MODEL || 'mistral-small-latest';
const CACHE_TIMEZONE = process.env.THOUGHT_OF_DAY_TIMEZONE || 'Asia/Kolkata';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.resolve(__dirname, '../.thought-cache.json');

let dailyThoughtCache = {
  dateKey: null,
  thought: null,
  author: '',
  fetchedAt: null,
};
let hasLoadedCacheFromDisk = false;
let refreshInFlight = null;

function getDateKeyForTimezone(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function cleanText(value) {
  return (value || '')
    .toString()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^"|"$/g, '')
    .trim();
}

function isUsableThought(text) {
  const t = cleanText(text);
  if (!t) return false;
  if (/^```/i.test(t)) return false;
  if (/^\{[\s\S]*\}$/.test(t)) return false;
  if (/^\[\s\S]*\]$/.test(t)) return false;
  if (/^json$/i.test(t)) return false;
  return true;
}

function parseThoughtFromMistralContent(content) {
  if (!content || typeof content !== 'string') {
    return { thought: '', author: '' };
  }

  const stripped = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Extract JSON object embedded inside markdown/text.
  const jsonStart = stripped.indexOf('{');
  const jsonEnd = stripped.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      const raw = stripped.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(raw);
      const thought = cleanText(parsed.thought || parsed.quote || parsed.text || '');
      const author = cleanText(parsed.author || parsed.by || parsed.source || '');
      if (isUsableThought(thought)) return { thought, author };
    } catch {
      // continue to other fallbacks
    }
  }

  // Prefer JSON output if model followed instructions.
  try {
    const parsed = JSON.parse(stripped);
    const thought = cleanText(parsed.thought || parsed.quote || parsed.text || '');
    const author = cleanText(parsed.author || parsed.by || parsed.source || '');
    if (isUsableThought(thought)) return { thought, author };
  } catch {
    // fall through to plain-text parser
  }

  const lines = stripped
    .split('\n')
    .map(line => cleanText(line))
    .filter(line => line && !/^json$/i.test(line) && !/^[{}\[\],:]+$/.test(line));

  if (!lines.length) return { thought: '', author: '' };

  const first = cleanText(lines[0]);
  const second = lines[1] || '';
  const author = cleanText(second.replace(/^(-|—)\s*/, ''));

  if (!isUsableThought(first)) {
    return { thought: '', author: '' };
  }

  return { thought: first, author };
}

async function loadCacheFromDiskOnce() {
  if (hasLoadedCacheFromDisk) return;

  try {
    const raw = await fs.readFile(CACHE_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      dailyThoughtCache = {
        dateKey: parsed.dateKey || null,
        thought: parsed.thought || null,
        author: parsed.author || '',
        fetchedAt: parsed.fetchedAt || null,
      };
    }
  } catch {
    // Ignore missing/invalid cache file and continue with in-memory defaults.
  } finally {
    hasLoadedCacheFromDisk = true;
  }
}

async function saveCacheToDisk() {
  const payload = JSON.stringify(dailyThoughtCache, null, 2);
  const tmpPath = `${CACHE_FILE_PATH}.tmp`;
  await fs.writeFile(tmpPath, payload, 'utf8');
  await fs.rename(tmpPath, CACHE_FILE_PATH);
}

async function fetchThoughtFromMistral() {
  const apiKey = process.env.MISTRAL_API_KEY || process.env.THOUGHT_OF_DAY_MISTRAL_API_KEY;

  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY (or THOUGHT_OF_DAY_MISTRAL_API_KEY) is not configured on the server');
  }

  const response = await axios.post(MISTRAL_API_URL, {
    model: MISTRAL_MODEL,
    temperature: 0.8,
    max_tokens: 120,
    messages: [
      {
        role: 'system',
        content: `You generate a daily quote. 
- Topic: Varies daily (discipline, science, resilience, kindness, technology, or philosophy). 
- Goal: Keep it diverse and avoid repetitive "sunrise" or "good morning" themes. 
- Format: Under 160 characters. Provide strictly JSON: {"thought":"...","author":"..."}.`,
      },
      {
        role: 'user',
        content: `Give me today's thought for ${getDateKeyForTimezone(CACHE_TIMEZONE)}. Use a new topic dissimilar to sunrise.`,
      },
    ],
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  const content = response.data?.choices?.[0]?.message?.content || '';
  const { thought, author } = parseThoughtFromMistralContent(content);
  if (!thought) {
    throw new Error('Mistral response did not include a usable thought');
  }

  return { thought, author };
}

router.get('/thought-of-the-day', async (req, res) => {
  await loadCacheFromDiskOnce();

  const dateKey = getDateKeyForTimezone(CACHE_TIMEZONE);
  const forceRefresh = req.query.refresh === '1';
  const supabase = getSupabaseAdmin();

  // 1. Try local cache (fastest)
  const localCacheValid = isUsableThought(dailyThoughtCache.thought) && dailyThoughtCache.dateKey === dateKey;
  if (!forceRefresh && localCacheValid) {
    return res.json({
      ...dailyThoughtCache,
      fromCache: true,
      timezone: CACHE_TIMEZONE,
    });
  }

  // 2. Try Supabase Shared Cache (sync across all users)
  if (!forceRefresh && supabase) {
    try {
      const { data, error } = await supabase
        .from('daily_thoughts')
        .select('*')
        .eq('date_key', dateKey)
        .maybeSingle();

      if (data && isUsableThought(data.thought)) {
        dailyThoughtCache = {
          dateKey,
          thought: data.thought,
          author: data.author || '',
          fetchedAt: data.fetched_at || null,
        };
        await saveCacheToDisk().catch(() => {});
        return res.json({
          ...dailyThoughtCache,
          fromCache: true,
          fromDatabase: true,
          timezone: CACHE_TIMEZONE,
        });
      }
    } catch (e) {
      console.error('[DB Sync Check Error]', e.message);
    }
  }

  // 3. Otherwise, fetch new and sync to both DB and local cache
  try {
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        const fresh = await fetchThoughtFromMistral();

        dailyThoughtCache = {
          dateKey,
          thought: fresh.thought,
          author: fresh.author,
          fetchedAt: new Date().toISOString(),
        };

        // Save to DB for other users
        if (supabase) {
          try {
            await supabase.from('daily_thoughts').upsert({
              date_key: dateKey,
              thought: fresh.thought,
              author: fresh.author,
              fetched_at: dailyThoughtCache.fetchedAt,
            }, { onConflict: 'date_key' });
          } catch (dbSaveErr) {
            console.error('[DB Shared Save Error]', dbSaveErr.message);
          }
        }

        await saveCacheToDisk().catch(() => {});
        return dailyThoughtCache;
      })().finally(() => {
        refreshInFlight = null;
      });
    }

    const refreshed = await refreshInFlight;

    return res.json({
      ...refreshed,
      fromCache: false,
      timezone: CACHE_TIMEZONE,
    });
  } catch (e) {
    console.error('Thought of the day API error:', e.message);

    // Serve stale quote if available to avoid blank UI during upstream outages.
    if (isUsableThought(dailyThoughtCache.thought)) {
      return res.json({
        ...dailyThoughtCache,
        fromCache: true,
        stale: true,
        timezone: CACHE_TIMEZONE,
      });
    }

    return res.status(503).json({
      error: 'Thought of the day unavailable',
      detail: e.message,
    });
  }
});

export default router;