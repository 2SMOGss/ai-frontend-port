import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load configuration from the root .env
dotenv.config({ path: path.resolve("../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Environment variables missing in root .env file!");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Define regex signatures for high-value secrets (NIST SC-28 compliance)
const SECRET_SIGNATURES = [
  {
    name: "OpenRouter API Key",
    regex: /sk-or-v1-[a-fA-F0-9]{64}/g
  },
  {
    name: "OpenAI API Key Reference",
    regex: /sk-[a-zA-Z0-9]{48}/g
  },
  {
    name: "Supabase JWT Token (Anon/Service Role)",
    regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g
  },
  {
    name: "PEM Private Key Structure",
    regex: /-----BEGIN[ A-Z0-9_-]+PRIVATE KEY-----/g
  },
  {
    name: "Slack Bot Token",
    regex: /xoxb-[a-zA-Z0-9-]+/g
  },
  {
    name: "Slack User Token",
    regex: /xoxp-[a-zA-Z0-9-]+/g
  },
  {
    name: "Potential Password Declaration",
    regex: /(password|passwd|secret|api_key|access_key)\s*[:=]\s*['"][a-zA-Z0-9_\-@#$!%^&*()+={}\[\]|\\:;"'<>,.?\/~`]{8,}['"]/gi
  }
];

/**
 * Executes a scanning security audit on all thoughts
 */
async function auditDatabase() {
  console.log("🛡️ Initializing Supabase Vector DB Security Audit...");
  console.log("📡 Fetching active memory entries...");

  const { data: thoughts, error } = await supabase
    .from("thoughts")
    .select("id, content, metadata, created_at");

  if (error) {
    console.error("❌ Failed to query database thoughts:", error.message);
    process.exit(1);
  }

  console.log(`✅ Retrieved ${thoughts.length} records from the database thoughts index.\n`);
  console.log("================================================================================");
  console.log("🔒 --- COMPLIANCE SCANNING REPORT (NIST SP 800-53 / GRC-01) ---");
  console.log("================================================================================");

  let leaksDetected = 0;
  const auditLogs = [];

  for (let i = 0; i < thoughts.length; i++) {
    const thought = thoughts[i];
    const textToScan = `${thought.content || ""} ${JSON.stringify(thought.metadata || {})}`;
    const findings = [];

    for (const signature of SECRET_SIGNATURES) {
      if (signature.regex.test(textToScan)) {
        findings.push(signature.name);
      }
      // Reset regex index state
      signature.regex.lastIndex = 0;
    }

    if (findings.length > 0) {
      console.error(`🚨 LEAK DETECTED! Thought ID: ${thought.id}`);
      console.error(`- Timestamp: ${new Date(thought.created_at).toISOString()}`);
      console.error(`- Violations: ${findings.join(", ")}`);
      console.error(`- Content Preview: "${thought.content.substring(0, 80).replace(/\n/g, " ")}..."`);
      console.error("--------------------------------------------------------------------------------");
      
      leaksDetected++;
      auditLogs.push({
        id: thought.id,
        timestamp: thought.created_at,
        findings,
        preview: thought.content.substring(0, 100)
      });
    }
  }

  // Save audit logs locally for compliance validation
  const auditReportPath = path.resolve("./security_audit_report.json");
  fs.writeFileSync(
    auditReportPath,
    JSON.stringify({ scanTime: new Date().toISOString(), totalChecked: thoughts.length, leaksDetected, logs: auditLogs }, null, 2)
  );

  console.log(`\n📊 Scan Summary:`);
  console.log(`- Total Records Checked: ${thoughts.length}`);
  console.log(`- Security Violations / Leaks Found: ${leaksDetected}`);
  console.log(`- Audit Report Generated: ${auditReportPath}`);

  if (leaksDetected === 0) {
    console.log("\n🟢 PASS: Database is perfectly clean. Zero private keys, API keys, or cleartext credentials detected in vector storage.");
  } else {
    console.warn(`\n⚠️ WARNING: ${leaksDetected} record(s) contain potential secrets. Consider deleting or purging them to maintain strict security boundaries.`);
  }
}

auditDatabase();
