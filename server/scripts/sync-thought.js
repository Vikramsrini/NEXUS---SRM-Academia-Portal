import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in server/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  try {
    const cachePath = path.resolve(__dirname, '../.thought-cache.json');
    const raw = await fs.readFile(cachePath, 'utf8');
    const data = JSON.parse(raw);

    if (!data.dateKey || !data.thought) {
      throw new Error('Invalid cache data');
    }

    console.log(`🚀 Syncing thought for ${data.dateKey} to Supabase...`);
    
    const { error } = await supabase
      .from('daily_thoughts')
      .upsert({
        date_key: data.dateKey,
        thought: data.thought,
        author: data.author || '',
        fetched_at: data.fetchedAt || new Date().toISOString()
      }, { onConflict: 'date_key' });

    if (error) throw error;

    console.log('✅ Success! Database is now updated for today.');
  } catch (err) {
    console.error('❌ Failed to sync to database:', err.message);
    process.exit(1);
  }
}

main();
