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
  console.error("❌ Environment variables missing in root .env file!");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Generate 1536-dimensional embeddings
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
    throw new Error(`Embedding Generation Failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return result.data[0].embedding;
}

/**
 * Extract rich schema-compliant metadata
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
          content: `Extract structured metadata from this resume/profile context section. Return JSON containing:
- "people": array of people mentioned (e.g. ["Rob Chich"])
- "action_items": array of implied to-dos (empty if none)
- "dates_mentioned": array of dates YYYY-MM-DD or YYYY-MM (empty if none)
- "topics": array of 1-3 short topic tags (e.g. ["Submarine Service", "U.S. Navy", "Electronics"])
- "type": one of "observation", "task", "idea", "reference", "person_note"
Only extract what is explicitly there in the text.`,
        },
        { role: "user", content: text },
      ],
    }),
  });

  if (!response.ok) {
    return { topics: ["linkedin-profile"], type: "observation" };
  }

  const result = await response.json();
  try {
    return JSON.parse(result.choices[0].message.content);
  } catch {
    return { topics: ["linkedin-profile"], type: "observation" };
  }
}

/**
 * Segment the markdown file into logical paragraphs/sections
 */
function segmentMarkdown(filePath) {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const lines = fileContent.split("\n");
  const segments = [];
  let currentSegment = [];

  for (const line of lines) {
    // If we hit a level-3 header (e.g. ### Job Title) or level-2 header, split the segment
    if (line.startsWith("### ") || line.startsWith("## ")) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment.join("\n").trim());
      }
      currentSegment = [line];
    } else {
      currentSegment.push(line);
    }
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment.join("\n").trim());
  }

  // Filter out headers that don't contain meaningful text
  return segments.filter(s => s.length > 40 && !s.startsWith("# Robert Chich"));
}

/**
 * Ingest profile segments into Supabase Vector DB
 */
async function migrateProfile() {
  console.log("🚀 Initializing LinkedIn & Credly Profile Ingestion Pipeline...");
  
  const profilePath = path.resolve("./linkedin_profile.md");
  if (!fs.existsSync(profilePath)) {
    console.error(`❌ Profile source file not found at ${profilePath}`);
    process.exit(1);
  }

  const segments = segmentMarkdown(profilePath);
  console.log(`📝 Identified ${segments.length} detailed profile segments for vectorization.\n`);

  let successCount = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    console.log(`[Migration ${i + 1}/${segments.length}] segment: "${segment.substring(0, 50).replace(/\n/g, " ")}..."`);

    try {
      const [embedding, metadata] = await Promise.all([
        getEmbedding(segment),
        extractMetadata(segment)
      ]);

      // Call database deduplicating upsert RPC
      const { data: upsertResult, error: upsertError } = await supabase.rpc("upsert_thought", {
        p_content: segment,
        p_payload: { metadata: { ...metadata, source: "linkedin-credly-migration" } },
      });

      if (upsertError) throw upsertError;

      // Inject generated embedding vector coordinates
      const { error: embError } = await supabase
        .from("thoughts")
        .update({ embedding })
        .eq("id", upsertResult.id);

      if (embError) throw embError;

      console.log(`✅ Success! Ingested ID: ${upsertResult.id} | Topics: ${metadata.topics.join(", ")}`);
      successCount++;
    } catch (err) {
      console.error(`❌ Error migrating segment ${i + 1}:`, err.message);
    }
    console.log("--------------------------------------------------------------------------------");
  }

  console.log(`\n🎉 Profile Ingestion cycle complete! Successfully migrated ${successCount}/${segments.length} profile segments into your Open Brain.`);
}

migrateProfile();
