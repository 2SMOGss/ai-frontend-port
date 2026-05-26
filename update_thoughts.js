import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ipuahhvzrxvaztqxmgwq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Env variables missing!');
    process.exit(1);
}

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const updates = [
    {
        id: 'c308db4e-0901-4164-980f-531797f18f56',
        content: "Work Experience: Rob Chich served as a Paramedic with Baltimore City Fire for 20 years (Dec 2004 – May 2025). In addition to life-saving procedures, he managed and updated departmental data related to operations and resources using web development skills.",
        metadata: { type: "reference", people: ["Rob Chich"], source: "mcp", topics: ["Work Experience", "Paramedic", "Data Management"], action_items: [], dates_mentioned: ["2004-12", "2025-05"] }
    },
    {
        id: '7aa5cd2a-9386-4a8d-8b4e-1cf34f5ce5fe',
        content: "Rob served as a Paramedic with the Baltimore City Fire Department for 20 years (2004-2025). This extensive tenure in a high-intensity, high-stakes emergency environment is the core of his professional identity and his commitment to operational resilience.",
        metadata: { type: "observation", people: ["Rob"], source: "mcp", topics: ["paramedic", "emergency services", "operational resilience"], action_items: [], dates_mentioned: ["2004-12-01", "2025-05-31"] }
    },
    {
        id: '92be69a1-da7b-4c44-9261-c642ec066a09',
        content: "Rob Chich is a US Navy submarine veteran (1993–1999) that served as an electronics technician. This foundational military submarine training in electronics underpins his technical expertise.",
        metadata: { type: "reference", people: ["Rob Chich"], source: "mcp", topics: ["US Navy", "Submarine Veteran", "Electronics", "Electronics Technician"], action_items: [], dates_mentioned: [] }
    },
    {
        id: '9eb19221-7543-4d48-ac75-d68aa1ed09a3',
        content: "Rob Chich served as a Paramedic Firefighter with the Baltimore City Fire Department for 20 years (retired), where he managed high-pressure emergency medical services and trained recruits.",
        metadata: { type: "observation", people: ["Rob Chich"], source: "mcp", topics: ["Paramedic", "Firefighter", "Emergency Services"], action_items: [], dates_mentioned: [] }
    },
    {
        id: '1704f9e6-33b3-4482-aa53-bb08c0f5325b',
        content: "Military Background: Rob is a U.S. Navy submarine veteran that served as an electronics technician, and is a graduate of the U.S. Navy Electronics Technician School.",
        metadata: { type: "person_note", people: ["Rob"], source: "mcp", topics: ["military background", "U.S. Navy", "submarine veteran", "electronics technician"], action_items: [], dates_mentioned: [] }
    },
    {
        id: 'f4f88b34-599a-4b00-98b6-1d0a072137da',
        content: "Rob was employed by the Baltimore City Fire Department as a Paramedic (December 2004 - May 2025). This 20-year tenure is one of his primary professional work history experiences, establishing his baseline of operational resilience under extreme pressure.",
        metadata: { type: "observation", people: ["Rob"], source: "linkedin", topics: ["Baltimore City Fire Department", "companies", "employment", "work history", "paramedic", "experience"], action_items: [], dates_mentioned: ["2004-12-01", "2025-05-31"] }
    },
    {
        id: '86ee829c-afb1-491d-890c-0b77a71a9040',
        content: "Rob's professional work history and employment background spans six main companies and organizations: Tennova Healthcare (Telemetry Monitor Technician, May 2025 - Present), Baltimore City Fire Department (Paramedic, Dec 2004 - May 2025), Conham Defense Electronic Systems (Engineering Technician, May 2003 - Dec 2004), Cobham Defense (Quality Assurance Tester, May 2001 - Dec 2003), Honeywell Aerospace Technologies Toulouse (Electronic Engineering Technician, Dec 1999 - May 2003), and the US Navy (Submarine Electronics Technician, 1993 - 1999).",
        metadata: { type: "reference", people: ["Rob"], source: "linkedin", topics: ["companies", "employers", "work history", "employment", "experience", "organizations"], action_items: [], dates_mentioned: [] }
    }
];

async function updateThoughts() {
    console.log('--- STARTING DATABASE UPDATE ---');
    for (const item of updates) {
        console.log(`Updating Thought ID: ${item.id}...`);
        const { error } = await serviceClient
            .from('thoughts')
            .update({ content: item.content, metadata: item.metadata })
            .eq('id', item.id);

        if (error) {
            console.error(`❌ Failed to update ${item.id}:`, error);
        } else {
            console.log(`✅ Successfully updated ${item.id}!`);
        }
    }
    console.log('--- DATABASE UPDATE COMPLETED ---');
}

updateThoughts();
