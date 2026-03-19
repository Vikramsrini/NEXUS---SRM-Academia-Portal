import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('daily_thoughts')
    .select('*')
    .eq('date_key', '2026-03-19')
    .maybeSingle();

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Database Thought for 2026-03-19:', JSON.stringify(data, null, 2));
  }
}

main();
