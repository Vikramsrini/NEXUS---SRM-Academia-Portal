import { getSupabaseAdmin } from '../lib/supabase.js';

// Get the latest SRM session (always id=1)
export async function getSrmSession() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('srm_session')
    .select('csrf_token, cookies')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return data;
}

// Update the SRM session (always id=1)
export async function setSrmSession(csrf_token, cookies) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase
    .from('srm_session')
    .update({ csrf_token, cookies, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw error;
}
