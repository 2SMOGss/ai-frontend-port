import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ipuahhvzrxvaztqxmgwq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Env variables missing!');
    process.exit(1);
}

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function listThoughts() {
    console.log('--- FETCHING THOUGHTS FROM DB ---');
    const { data: thoughts, error } = await serviceClient
        .from('thoughts')
        .select('id, content, metadata');

    if (error) {
        console.error('Error fetching thoughts:', error);
    } else {
        console.log(`Retrieved ${thoughts.length} thoughts:`);
        thoughts.forEach((t, i) => {
            console.log(`\n[${i+1}] ID: ${t.id}`);
            console.log(`Content: ${t.content}`);
            console.log(`Metadata:`, JSON.stringify(t.metadata));
        });
    }
}

listThoughts();
