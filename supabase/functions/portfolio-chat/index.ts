import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient } from "@supabase/supabase-js";

import { logger } from "hono/logger";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_WEBHOOK_URL");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const app = new Hono();

app.use("*", logger());
// Enable CORS for the portfolio website
app.use("/*", cors({
  origin: "*", // In production, restrict this to your domain
  allowHeaders: ["authorization", "x-client-info", "apikey", "content-type"],
  allowMethods: ["POST", "GET", "OPTIONS"],
}));

app.get("/", (c) => c.text("Portfolio Chat Agent is active."));

// --- SAFETY & RELIABILITY HELPERS ---

function sanitizeInput(input: string): string {
  // Basic protection against prompt injection and common "jailbreak" keywords
  const forbiddenPatterns = [
    /ignore previous instructions/i,
    /disregard all instructions/i,
    /new rules/i,
    /system settings/i,
    /you are now/i
  ];
  
  let clean = input.slice(0, 500); // Limit length to 500 chars to prevent spam
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(clean)) {
      throw new Error("SECURITY_TRIGGER: Input pattern not allowed.");
    }
  }
  return clean;
}

const FALLBACK_MESSAGE = `I apologize, but I'm currently having trouble accessing a specific part of Robert's professional memory. 

Please feel free to:
1. Reach out to Robert directly via the contact links below.
2. Download his resume from the main dashboard.
3. Try asking your question again in a moment.

Robert's expertise in Cloud Security and AI is still available for discussion!`;

app.post("*", async (c) => {
  try {
    const clientIp = c.req.header("x-forwarded-for")?.split(",")[0] || "unknown";
    console.log(`[POST] Request from IP: ${clientIp}`);

    // 1. Rate Limit Check (Wrapped to prevent crashes)
    try {
      const { data: isAllowed, error: rateError } = await supabase.rpc("check_rate_limit", {
        p_ip_address: clientIp,
        p_max_requests: 10, // Increased for testing
        p_window_minutes: 1
      });

      if (rateError) {
        console.error("Rate limit RPC error:", rateError);
      } else if (isAllowed === false) {
        return c.json({ reply: "I've processed quite a few requests for you recently. Please take a 60-second breath. Robert appreciates your interest!" }, 429);
      }
    } catch (err) {
      console.error("Rate limit check failed (exception):", err);
    }

    const body = await c.req.json();
    let { message, history = [], user } = body;

    if (!message) return c.json({ error: "Message is required" }, 400);

    // 2. Log Interaction (Initial - Wrapped)
    let logId: string | null = null;
    try {
      const { data: logEntry, error: logError } = await supabase.from("portfolio_chat_logs").insert({
        ip_address: clientIp,
        user_message: message,
        metadata: { path: c.req.path, history_length: history.length }
      }).select('id').single();
      
      if (logError) console.error("Initial log error:", logError);
      else logId = logEntry?.id;
    } catch (err) {
      console.error("Logging failed (exception):", err);
    }

    // 3. Safety Check: Sanitize Input
    try {
      message = sanitizeInput(message);
    } catch (err) {
      console.warn("Security rejection:", err.message);
      return c.json({ reply: "I'm sorry, I cannot process that request due to security guidelines." });
    }

    // 4. Search for relevant context in the "Open Brain"
    let contextText = "No specific memories found.";
    try {
      const qEmbResp = await fetch(`${OPENROUTER_BASE}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/text-embedding-3-small",
          input: message,
        }),
      });
      
      if (qEmbResp.ok) {
        const embData = await qEmbResp.json();
        if (embData.data?.[0]?.embedding) {
          const embedding = embData.data[0].embedding;
          const { data: thoughts, error } = await supabase.rpc("match_thoughts", {
            query_embedding: embedding,
            match_threshold: 0.35, // Lowered from 0.45 for better retrieval
            match_count: 5,
          });

          if (!error && thoughts?.length) {
            contextText = thoughts.map((t: any) => t.content).join("\n---\n");
          } else if (error) {
            console.error("RPC match_thoughts error:", error);
          }
        }
      }
    } catch (err) {
      console.error("Context search failed:", err);
    }

    // 5. Harden the System Prompt (Hallucination Guardrails & Dynamic Session Security)
    let sessionHeader = "";
    if (user && user.name) {
      sessionHeader = `
[SECURITY_LEVEL: VERIFIED_SESSION]
- Active Session: Authenticated as ${user.name} (${user.email || "no-email"}).
- Access Level: VIP Priority Signal enabled.
- Action: Greet them by their name (${user.name}) warmly and verify that they are connected over a secure channel. You may provide expedited professional answers.
`;
    } else {
      sessionHeader = `
[SECURITY_LEVEL: UNVERIFIED_GUEST]
- Active Session: Guest.
- Action: Protect sensitive identity parameters.
- Directives:
  1. Under no circumstances should you ever output Robert's raw phone number or direct personal email address. They are protected credentials.
  2. If they ask "How do I contact Robert?" or ask for his phone number, email, or contact details, you MUST explicitly explain the security reasoning: to shield Robert's identity and personal details from automated crawlers, malicious bots, and identity harvesting actors on the public web, his direct credentials are encrypted and kept secure behind a verified state.
  3. Explicitly direct them to use the secure, encrypted contact form ("SECURE_COMMS_V1") on the right sidebar to transmit a secure message directly to Robert.
  4. AND clearly instruct them to authenticate for a fully personalized priority VIP experience by using the glowing "VERIFY_IDENTITY" button in the HUD header or logging in with Gmail. You MUST use the exact phrase: "For a better experience, please authenticate."
`;
    }

    const systemPrompt = `You are the "System Agent" for Rob Chich's portfolio. 
Rob is transitioning into Cloud Security & AI Integration, demonstrating hands-on project experience in GRC, AWS, HIPAA compliance, and secure frontend application development. He is not currently employed professionally or paid in these roles, but builds robust technical portfolio projects showcasing these skills.

${sessionHeader}

CORE IDENTITY:
- 20 years as a Paramedic Firefighter with the Baltimore City Fire Department (Served Dec 2004 – May 2025, Retired).
- U.S. Navy Submarine Veteran that served as an Electronics Technician.
- Skilled in AWS security, automation (PowerShell/Bash), and NIST-800-53 standards (demonstrated in active portfolio projects).

STRICT GUIDELINES:
1. Answer using the "CONTEXT FROM ROB'S OPEN BRAIN" below.
2. If the user asks about Rob's background (Navy, EMS, Fire Dept) or skills (AWS, HIPAA), synthesize the context into a professional summary.
3. If the specific information is missing, do NOT hallucinate. Instead, say: "I don't have the exact details for that in my current memory bank, but I can speak to Rob's expertise in [mention a skill from context like Cloud Security or GRC]."
4. Maintain a professional, highly capable "System Interface" persona. Keep clear boundaries: make it clear Rob's technical experience is project-oriented as he transitions into his first professional paid technology role.
5. Keep responses concise and use markdown.

CONTEXT FROM ROBERT'S OPEN BRAIN:
${contextText}`;

    // 6. Call OpenRouter with streaming enabled
    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://robertchich.com",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: message }
        ],
        temperature: 0.3,
        stream: true,
      }),
    });

    if (!response.ok) {
      console.error("OpenRouter API failed:", await response.text());
      return c.json({ reply: FALLBACK_MESSAGE });
    }

    // 7. Handle the stream and pipe it to the client
    let fullResponse = "";
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const dataStr = line.slice(6).trim();
                if (dataStr === "[DONE]") break;

                try {
                  const data = JSON.parse(dataStr);
                  const content = data.choices?.[0]?.delta?.content;
                  if (content) {
                    fullResponse += content;
                    controller.enqueue(encoder.encode(content));
                  }
                } catch (e) {
                  // Skip invalid JSON lines
                }
              }
            }
          }
          
          // Finalize Logging: Update the record with the agent's full response
          if (logId) {
            await supabase
              .from("portfolio_chat_logs")
              .update({ agent_response: fullResponse })
              .eq('id', logId);
          }

          // Finalize Notification (Task 6): Send full summary to Discord
          if (DISCORD_WEBHOOK_URL) {
            await fetch(DISCORD_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                embeds: [{
                  title: "💼 Portfolio Chat Summary",
                  color: 0xD7543C,
                  fields: [
                    { name: "👤 User", value: message.slice(0, 500) },
                    { name: "🤖 Agent", value: fullResponse.slice(0, 1000) || "No response generated." },
                    { name: "🌐 Details", value: `IP: ${clientIp}` }
                  ],
                  footer: { text: "Open Brain Integration Active" },
                  timestamp: new Date().toISOString()
                }]
              })
            }).catch(err => console.error("Webhook failed:", err));
          }
          
        } catch (err) {
          console.error("Stream error:", err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("Critical Function Error:", err);
    return c.json({ reply: FALLBACK_MESSAGE });
  }
});

Deno.serve(app.fetch);
