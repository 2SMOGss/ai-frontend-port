import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load configuration from root .env file
dotenv.config({ path: path.resolve("../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENROUTER_API_KEY) {
  console.error("❌ Crucial environment variables are missing! Ensure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENROUTER_API_KEY are configured in the root .env file.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Generate 1536-dimensional vector embeddings using OpenRouter API
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
    const errorText = await response.text();
    throw new Error(`OpenRouter Embedding Generation Failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return result.data[0].embedding;
}

/**
 * Extract rich schema-compliant metadata from raw text using OpenRouter mini model
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
          content: `Extract structured metadata from the user's legacy captured thought. Return JSON containing:
- "people": array of people mentioned (empty if none)
- "action_items": array of implied to-dos (empty if none)
- "dates_mentioned": array of dates YYYY-MM-DD (empty if none)
- "topics": array of 1-3 short topic tags (always at least one)
- "type": one of "observation", "task", "idea", "reference", "person_note"
Only extract what is explicitly there in the text.`,
        },
        { role: "user", content: text },
      ],
    }),
  });

  if (!response.ok) {
    console.warn("⚠️ GPT-4o-mini metadata extraction failed, falling back to default tags.");
    return { topics: ["migration-generic"], type: "observation" };
  }

  const result = await response.json();
  try {
    return JSON.parse(result.choices[0].message.content);
  } catch {
    return { topics: ["migration-generic"], type: "observation" };
  }
}

/**
 * Main migration driver function
 */
async function executeMigration() {
  console.log("🚀 Starting Open Brain (OB1) Memory Ingestion Pipeline...");
  
  const datasetPath = path.resolve("./legacy_memories.json");
  if (!fs.existsSync(datasetPath)) {
    console.error(`❌ Source memories file not found at ${datasetPath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(datasetPath, "utf-8");
  const memories = JSON.parse(rawData);
  console.log(`📝 Loaded ${memories.length} legacy memories for vectorization.\n`);

  let successCount = 0;

  for (let i = 0; i < memories.length; i++) {
    const memory = memories[i];
    console.log(`[Ingestion ${i + 1}/${memories.length}] Content: "${memory.content.substring(0, 60)}..."`);

    try {
      // Step 1 & 2: Generate Vector Embeddings and Extract Metadata in parallel
      const [embedding, metadata] = await Promise.all([
        getEmbedding(memory.content),
        extractMetadata(memory.content)
      ]);

      // Step 3: Call Database-level deduplicating Upsert RPC
      const { data: upsertResult, error: upsertError } = await supabase.rpc("upsert_thought", {
        p_content: memory.content,
        p_payload: { metadata: { ...metadata, source: "memory-migration-v1" } },
      });

      if (upsertError) throw upsertError;

      // Step 4: Inject the generated 1536-dimensional vector embedding
      const { error: embError } = await supabase
        .from("thoughts")
        .update({ embedding })
        .eq("id", upsertResult.id);

      if (embError) throw embError;

      console.log(`✅ Success! Ingested ID: ${upsertResult.id} | Type: ${metadata.type} | Topics: ${metadata.topics.join(", ")}`);
      successCount++;
    } catch (err) {
      console.error(`❌ Failed to ingest entry ${i + 1}:`, err.message);
    }
    console.log("--------------------------------------------------------------------------------");
  }

  console.log(`\n🎉 Ingestion cycle complete! Successfully migrated ${successCount}/${memories.length} memories into your Open Brain.`);
}

executeMigration();
