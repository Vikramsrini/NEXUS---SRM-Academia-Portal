import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CGPA_DATA_URL = 'https://srmcgpa.netlify.app/data/cgpa-regulations.json';
const LOCAL_DATA_PATH = path.join(__dirname, '../data/cgpa-regulations.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cache = {
  data: null,
  fetchedAt: 0,
};

async function ensureDirectoryExists(filePath) {
  const dirname = path.dirname(filePath);
  try {
    await fs.access(dirname);
  } catch (error) {
    await fs.mkdir(dirname, { recursive: true });
  }
}

async function loadFromDisk() {
  try {
    const content = await fs.readFile(LOCAL_DATA_PATH, 'utf-8');
    const data = JSON.parse(content);
    return {
      data,
      stats: await fs.stat(LOCAL_DATA_PATH),
    };
  } catch (e) {
    return null;
  }
}

async function saveToDisk(data) {
  try {
    await ensureDirectoryExists(LOCAL_DATA_PATH);
    await fs.writeFile(LOCAL_DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Warning: Could not save CGPA data to disk:', e.message);
  }
}

export async function fetchCgpaReference({ forceRefresh = false } = {}) {
  const now = Date.now();
  
  // 1. Check in-memory cache
  if (!forceRefresh && cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return {
      regulations: cache.data,
      sourceUrl: CGPA_DATA_URL,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
      cache: 'hit',
      source: 'memory',
    };
  }

  // 2. Try fetching from remote
  try {
    const response = await axios.get(CGPA_DATA_URL, {
      timeout: 10000,
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (Academia Backend)',
      },
    });

    const regulations = response.data;
    if (!regulations || typeof regulations !== 'object') {
      throw new Error('Invalid data format received from CGPA source');
    }

    // Update memory cache and disk backup
    cache = { data: regulations, fetchedAt: now };
    await saveToDisk(regulations);

    return {
      regulations,
      sourceUrl: CGPA_DATA_URL,
      fetchedAt: new Date(now).toISOString(),
      cache: 'miss',
      source: 'remote',
    };
  } catch (e) {
    console.warn(`Remote fetch failed for CGPA reference: ${e.message}. Attempting disk fallback...`);

    // 3. Fallback to disk
    const diskResult = await loadFromDisk();
    if (diskResult) {
      // Update memory cache even from disk fallback
      cache = { data: diskResult.data, fetchedAt: diskResult.stats.mtimeMs };
      
      return {
        regulations: diskResult.data,
        sourceUrl: CGPA_DATA_URL,
        fetchedAt: diskResult.stats.mtime.toISOString(),
        cache: 'miss',
        source: 'disk',
        warning: 'Serving from local disk due to remote fetch failure.',
      };
    }

    // 4. If everything fails, throw
    throw new Error(`Failed to fetch CGPA data from both remote and disk: ${e.message}`);
  }
}


