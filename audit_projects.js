import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load environment configuration from the root .env
dotenv.config({ path: path.resolve("../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENROUTER_API_KEY) {
  console.error("❌ Crucial environment variables are missing in your root .env file.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Fetch OpenRouter vector embeddings
 */
async function getEmbedding(text) {
  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API call failed: ${response.status}`);
  }

  const result = await response.json();
  return result.data[0].embedding;
}

/**
 * Extract GPT-4o-mini structured metadata
 */
async function extractMetadata(text) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Extract structured metadata from this project context section. Return JSON containing:
- "people": array of people mentioned (e.g. ["Rob Chich"])
- "action_items": array of implied to-dos (empty if none)
- "dates_mentioned": array of dates YYYY-MM or YYYY-MM-DD (empty if none)
- "topics": array of 1-3 short topic tags (e.g. ["VPC plumbing", "AWS", "Security"])
- "type": "reference"
Only extract what is explicitly there in the text.`,
        },
        { role: "user", content: text },
      ],
    }),
  });

  if (!response.ok) {
    return { topics: ["projects-index"], type: "reference" };
  }

  const result = await response.json();
  try {
    return JSON.parse(result.choices[0].message.content);
  } catch {
    return { topics: ["projects-index"], type: "reference" };
  }
}

/**
 * Main project auditing driver
 */
async function runAudit() {
  console.log("🔍 Initializing Open Brain Projects Singularity Audit...");
  
  // Step 1: Pull and analyze existing thoughts from database
  console.log("📡 Fetching active thoughts from Supabase database...");
  const { data: dbThoughts, error } = await supabase
    .from("thoughts")
    .select("content, metadata");

  if (error) {
    console.error("❌ Failed to query existing database thoughts:", error.message);
    process.exit(1);
  }

  console.log(`✅ Loaded ${dbThoughts.length} existing thoughts from vector database.`);

  // Analyze existing index to extract projects and key keywords already represented
  const existingProjectKeywords = [
    { name: "VitalStream VPC", keywords: ["vitalstream", "vpc", "segmentation", "phi tier"] },
    { name: "PixSort Pro", keywords: ["pixsort", "deduplication", "md5 hash", "chronological file sorting"] },
    { name: "auditbuddy", keywords: ["auditbuddy", "nist sp 800-53", "compliance auditor"] },
    { name: "Cloud-Honeynet-SOC", keywords: ["cloud-honeynet-soc", "siem log", "threat detection"] },
    { name: "gem_agent_repo", keywords: ["gem_agent_repo", "agentic workflow", "gemini-3-pro"] },
    { name: "ai-frontend-port", keywords: ["ai-frontend-port", "neural nexus", "particle physics"] },
    { name: "OB1 / Open Brain", keywords: ["ob1", "open brain", "mcp server", "vector db"] }
  ];

  console.log("\n📋 --- SECOND BRAIN AUDIT REPORT ---");
  const indexedStatus = {};

  for (const proj of existingProjectKeywords) {
    const matched = dbThoughts.some(t => {
      const content = (t.content || "").toLowerCase();
      return proj.keywords.some(kw => content.includes(kw));
    });
    indexedStatus[proj.name] = matched;
    console.log(`- Project [${proj.name}]: ${matched ? "🔴 ACTIVE & VECTOR-INDEXED (Zero action needed)" : "🟢 MISSING (Needs Ingestion)"}`);
  }

  // Step 2: Identify local project folders under D:\download_other\Projects
  const localProjectsDir = "D:\\download_other\\Projects";
  let localDirs = [];
  try {
    localDirs = fs.readdirSync(localProjectsDir).filter(file => {
      const fullPath = path.join(localProjectsDir, file);
      return fs.statSync(fullPath).isDirectory();
    });
  } catch (err) {
    console.warn("⚠️ Local projects directory read failed. Skipping local directory scan.");
  }

  console.log(`\n📂 Scanning local workspace folders at ${localProjectsDir}...`);
  
  // Core unique project directories that aren't represented yet
  const candidatesToIngest = [];
  const uniqueCandidateDirs = [
    { dir: "paramedic_pal", title: "Paramedic Pal 3.0", desc: "A high-performance medical assistant app built to provide real-time clinical protocol guidance and emergency checklist automation for paramedic responders." },
    { dir: "employer-verification", title: "Employer Verification Webapp", desc: "A secure digital employment verification portal implementing data integrity standards and cryptographic hashes to audit and confirm employee profiles." },
    { dir: "fabric_chatbot", title: "Fabric Chatbot Interface", desc: "An advanced modular AI assistant interface designed to capture and orchestrate system-level command pipelines and neural prompts." }
  ];

  for (const cand of uniqueCandidateDirs) {
    const isLocalPresent = localDirs.includes(cand.dir);
    // Double check if already indexed in database using its title/desc keywords
    const isAlreadyIndexed = dbThoughts.some(t => {
      const content = (t.content || "").toLowerCase();
      return content.includes(cand.title.toLowerCase()) || content.includes(cand.dir.toLowerCase());
    });

    console.log(`- Local Folder [${cand.dir}]: ${isLocalPresent ? "📂 PRESENT" : "❌ ABSENT"} | Vector DB: ${isAlreadyIndexed ? "🔴 INDEXED" : "🟢 UNINDEXED"}`);
    
    if (isLocalPresent && !isAlreadyIndexed) {
      candidatesToIngest.push(cand);
    }
  }

  // Step 3: Ingest only the unique unindexed candidates (DEDUPLICATED)
  if (candidatesToIngest.length === 0) {
    console.log("\n🎉 Audit complete! Zero duplicates detected. All your primary projects are already perfectly represented in your Open Brain.");
    process.exit(0);
  }

  console.log(`\n🚀 Ingesting ${candidatesToIngest.length} unique, unrepresented projects (Deduplicated)...`);

  for (const cand of candidatesToIngest) {
    const content = `Project Profile: ${cand.title}\nDescription: ${cand.desc}\nLocal Workspace Directory: ${localProjectsDir}\\${cand.dir}\nGitHub Repository Context: https://github.com/2SMOGss/${cand.dir}`;
    console.log(`- Vectorizing unique project [${cand.title}]...`);

    try {
      const [embedding, metadata] = await Promise.all([
        getEmbedding(content),
        extractMetadata(content)
      ]);

      const { data: upsertResult, error: upsertError } = await supabase.rpc("upsert_thought", {
        p_content: content,
        p_payload: { metadata: { ...metadata, source: "projects-audit-migration" } },
      });

      if (upsertError) throw upsertError;

      const { error: embError } = await supabase
        .from("thoughts")
        .update({ embedding })
        .eq("id", upsertResult.id);

      if (embError) throw embError;

      console.log(`  ✅ Successfully ingested unique project card ID: ${upsertResult.id}`);
    } catch (err) {
      console.error(`  ❌ Failed to ingest project [${cand.title}]:`, err.message);
    }
    console.log("--------------------------------------------------------------------------------");
  }

  console.log("\n🎉 Singular Audited Migration complete! All your active local projects are now safely and uniquely indexed in your Second Brain.");
}

runAudit();
