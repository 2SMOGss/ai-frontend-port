import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ipuahhvzrxvaztqxmgwq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('⚠️ Environment variables missing! Please specify SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Fetches the latest live context updates sent from management interfaces like Discord.
 */
export async function fetchLatestProfileContext() {
  try {
    const { data, error } = await supabase
      .from('thoughts')
      .select('metadata, content, created_at')
      .eq('metadata->>type', 'profile_context') // Fast query targeting our custom tag
      .order('created_at', { ascending: false }) // Target the latest update
      .limit(1);

    if (error) throw error;
    if (!data || data.length === 0) return null;

    // Isolate the structured profile modifications
    const latestUpdate = data[0];
    const profileData = latestUpdate.metadata?.profile_data || {};
    
    return {
      rawContent: latestUpdate.content,
      profileVariables: profileData, // Contains dynamic variables like { employment_date: "2026-05-25" }
      updatedAt: latestUpdate.created_at
    };
  } catch (err) {
    console.error("Failed to query live profile overrides from Open Brain:", err);
    return null;
  }
}

async function run() {
  console.log('🧠 Querying latest Discord profile context overrides...');
  const contextOverride = await fetchLatestProfileContext();
  if (contextOverride) {
    console.log('\n✅ Latest Context Found:');
    console.log(`- Content: "${contextOverride.rawContent}"`);
    console.log(`- Extracted Profile Variables:`, contextOverride.profileVariables);
    console.log(`- Updated At: ${contextOverride.updatedAt}`);
  } else {
    console.log('\nℹ️ No active profile context overrides found in thoughts.');
  }
}

run();
