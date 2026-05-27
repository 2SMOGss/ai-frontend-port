# Quick Capture Shorthand Guidelines & Templates

To make your **Open Brain (OB1)** capture flow as fast and seamless as possible, we have integrated **deterministic command prefixes** directly into the `ingest-thought` (Slack) and `discord-capture` (Discord) ingestion pipelines.

Instead of relying on AI to guess what type of memory you are capturing, you can use these simple shorthand prefixes in Slack or Discord for **instant, 100% accurate database categorization**.

---

## ⚡ Shorthand Capture Codes

| Prefix | Capture Command | Target Type | Optimal Use Case |
| :--- | :--- | :--- | :--- |
| **`!task`** or **`/task`** | `!task Review AWS AIF-C01 ML pipeline blueprints` | `task` | Urgent to-dos, certification milestones, learning check-lists. |
| **`!idea`** or **`/idea`** | `!idea Build a React-based GRC checklist interactive UI` | `idea` | New project features, design inspirations, professional drafts. |
| **`!ref`** or **`/ref`** | `!ref Google AI verification ID: 17183b0e-a6fc-4cc0-abab` | `reference` | Dynamic variables, links, credential codes, and core study notes. |
| **`!note`** or **`/note`** | `!note Rob Chich is certified in NIMS FEMA ICS-100 through 400` | `person_note` | Credentials, professional contacts, work history updates. |

---

## ⚙️ How the Code Handles It
When a message starting with one of these prefixes arrives via your Slack webhook or **Discord capture integration (/capture)**, the Edge Functions:
1. Automatically strip the prefix (e.g., `!task `) to keep your stored thought content clean.
2. Natively override the AI metadata classification, forcing the exact category type (`task`, `idea`, `reference`, `person_note`).
3. Send the cleaned text to get high-precision 1536-dimensional embeddings.
4. Reply instantly inside your Discord channel with confirmation: `✅ Captured as task`

---

## 🚀 How to Deploy Your Updates (WSL Commands)
Since your Supabase CLI is manually managed inside your **WSL environment**, you can deploy these code updates in seconds by opening your WSL terminal, navigating to the project root, and running:

```bash
# To deploy the Slack integration update:
supabase functions deploy ingest-thought --no-verify-jwt

# To deploy the Discord capture integration update:
supabase functions deploy discord-capture --no-verify-jwt
```

