import { getSupabaseAdmin } from '../lib/supabase.js';

/**
 * Get the latest SRM session for a specific user.
 * @param {string} userId - The student's registration number or 'generic'.
 */
export async function getSrmSession(userId = 'generic') {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase not configured');
  
  const { data, error } = await supabase
    .from('srm_session')
    .select('csrf_token, cookies')
    .eq('user_id', userId)
    .maybeSingle(); // Better than .single() if row might not exist yet
    
  if (error) throw error;
  return data || { csrf_token: '', cookies: '' };
}

/**
 * Update or create the SRM session for a specific user.
 * @param {string} userId - The student's registration number or 'generic'.
 * @param {string} csrf_token - The CSRF token.
 * @param {string} cookies - The cookies string.
 */
export async function setSrmSession(csrf_token, cookies, userId = 'generic') {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase not configured');
  
  const { error } = await supabase
    .from('srm_session')
    .upsert(
      { 
        user_id: userId, 
        csrf_token, 
        cookies, 
        updated_at: new Date().toISOString() 
      },
      { onConflict: 'user_id' }
    );
    
  if (error) throw error;
}
