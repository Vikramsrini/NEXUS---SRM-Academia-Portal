import { createClient } from '@supabase/supabase-js';

let cachedClient = null;

function isLikelyPublishableKey(key = '') {
  return key.startsWith('sb_publishable_');
}

export function getSupabaseAdmin() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  // Reject public keys here. Backend OD sync requires an admin/service role key.
  if (isLikelyPublishableKey(serviceRoleKey)) {
    return null;
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}
