import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ipuahhvzrxvaztqxmgwq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Env variables missing!');
    process.exit(1);
}

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function findRelevantThoughts() {
    console.log('--- SEARCHING THOUGHTS IN DATABASE ---');
    const { data: thoughts, error } = await serviceClient
        .from('thoughts')
        .select('id, content, metadata');

    if (error) {
        console.error('Error fetching thoughts:', error);
        return;
    }

    const keywords = ['elevator', 'pitch', 'navy', 'fire department', 'paramedic', 'front-end', 'veteran'];
    const matches = thoughts.filter(t => {
        const text = (t.content || '').toLowerCase();
        return keywords.some(kw => text.includes(kw));
    });

    console.log(`Found ${matches.length} matching thoughts:`);
    matches.forEach(t => {
        console.log(`\nID: ${t.id}`);
        console.log(`Content: ${t.content}`);
        console.log(`Metadata:`, JSON.stringify(t.metadata));
    });
}

findRelevantThoughts();
