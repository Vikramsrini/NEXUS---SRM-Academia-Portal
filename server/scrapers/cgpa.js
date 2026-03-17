import axios from 'axios';

const CGPA_SOURCE_URL = 'https://srmcgpa.netlify.app/js/cgpa-calculator.js';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cache = {
  data: null,
  fetchedAt: 0,
};

function extractRegulationsObject(scriptText) {
  const match = scriptText.match(
    /const\s+regulations\s*=\s*(\{[\s\S]*?\})\s*(?:\/\/\s*Select\s+the\s+regulation|const\s+regulationSelect|let\s+semesterCount|function\s+addSemester)/
  );
  if (!match?.[1]) {
    throw new Error('Could not locate regulations object in CGPA source script');
  }

  // Make parser resilient if upstream script introduces trailing commas.
  const normalized = match[1].replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(normalized);
}

export async function fetchCgpaReference({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return {
      regulations: cache.data,
      sourceUrl: CGPA_SOURCE_URL,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
      cache: 'hit',
    };
  }

  const response = await axios.get(CGPA_SOURCE_URL, {
    timeout: 20000,
    headers: {
      accept: 'application/javascript,text/javascript,*/*;q=0.1',
      'user-agent': 'Mozilla/5.0 (Academia Backend)',
    },
  });

  const scriptText = typeof response.data === 'string' ? response.data : String(response.data || '');
  const regulations = extractRegulationsObject(scriptText);

  cache = {
    data: regulations,
    fetchedAt: now,
  };

  return {
    regulations,
    sourceUrl: CGPA_SOURCE_URL,
    fetchedAt: new Date(now).toISOString(),
    cache: 'miss',
  };
}
