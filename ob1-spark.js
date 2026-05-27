import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load configuration from the root .env
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
 * Execute Career Synergy Prompt via OpenRouter
 */
async function generateCareerSynergy(profileContext) {
  console.log("📡 Connecting to OpenRouter for Career Synergy Synthesis...");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o",
      max_tokens: 1500, // Explicit token constraint to avoid OpenRouter credit exhaustion
      messages: [
        {
          role: "system",
          content: `You are an elite Tech Career Coach & Cloud Security Strategist. Your mission is to analyze the candidate's raw professional thoughts and formulate a high-end, premium "Career Synergy" profile. 

The candidate (Robert "Rob" Chich) is transitioning from high-stakes critical infrastructure (U.S. Navy Submarine Electronics, Baltimore City Paramedic) into Cloud Security Architect, GRC, and AI Engineering roles.

Reframe public safety and military service as "Critical Infrastructure & Operational Resilience Under Extreme Pressure." Emphasize that GRC (NIST SP 800-53 checklists) is conceptually identical to high-stress emergency response checklists (FEMA ICS, Hazmat safety audits, paramedic protocol suites). 

Provide the output in structured Markdown containing:
1. ## The Synergy Narrative (reframing transition).
2. ## The 3-Sentence Elevator Pitch (LinkedIn/Resume header).
3. ## High-Impact Resume Bullets (blending paramedic/submarine operations with secure cloud engineering: VitalStream VPC, auditbuddy, Cloud-Honeynet-SOC).
4. ## Core GRC Control Alignment (correlating paramedic check-lists with NIST controls).`
        },
        { role: "user", content: profileContext },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter Call Failed: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  return result.choices[0].message.content;
}

/**
 * Main Spark pipeline driver
 */
async function runSpark() {
  console.log("⚡ Activating Open Brain Spark: Career Synergy Engine...");
  console.log("📡 Fetching your profile context thoughts from Supabase...");

  // Fetch thoughts that represent Rob's experiences and credentials, limiting to top 15 records to keep the prompt highly-focused and cost-optimized
  const { data: thoughts, error } = await supabase
    .from("thoughts")
    .select("content, metadata")
    .or("metadata->>type.eq.observation,metadata->>type.eq.reference,metadata->>type.eq.profile_context")
    .order("created_at", { ascending: false })
    .limit(15);

  if (error) {
    console.error("❌ Failed to query profile thoughts:", error.message);
    process.exit(1);
  }

  // Filter to build a solid contextual summary to feed the AI
  const profileContext = thoughts
    .map(t => t.content)
    .join("\n\n");

  console.log(`✅ Loaded ${thoughts.length} key profile thoughts. Running synthesis pipeline...`);

  try {
    const synergyReport = await generateCareerSynergy(profileContext);
    
    // Save locally as a beautiful Markdown file
    const reportPath = path.resolve("./career_synergy.md");
    fs.writeFileSync(reportPath, synergyReport);
    
    console.log("\n================================================================================");
    console.log("🎉 SPARK SYNTHESIS COMPLETED!");
    console.log("================================================================================");
    console.log(`- Synergy Report saved to: ${reportPath}\n`);
    console.log(synergyReport);
  } catch (err) {
    console.error("❌ Spark Synthesis pipeline failed:", err.message);
  }
}

runSpark();
