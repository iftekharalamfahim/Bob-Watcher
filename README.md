# Bob Watcher

> **A persistent memory layer for IBM Bob that learns from every correction your team makes — so Bob never repeats the same mistake twice.**

---

## The Problem

IBM Bob is a powerful AI development partner. But like every AI, it forgets everything between sessions. Every new chat, Bob starts fresh — no memory of your team's coding standards, your database choice, your sprint scope, or the mistakes he was already corrected on.

Developers end up fixing the same AI mistakes over and over. New team members get the same wrong suggestions senior devs corrected weeks ago. Time is wasted. Frustration builds.

## The Solution

Bob Mistake Learner is a four-layer pipeline that:

1. **Captures** every correction a developer makes to Bob's code
2. **Learns** by calling IBM watsonx.ai to convert corrections into plain-English rules
3. **Compiles** those rules into a structured briefing document automatically
4. **Briefs Bob** at the start of every session via MCP — so he already knows the rules

Bob becomes a disciplined team member with memory. Not just a stateless chatbot.

---

## Demo

```
Developer corrects Bob's code: var → const
        ↓
Extension logs the correction automatically
        ↓
watsonx.ai generates rule: "Always use const instead of var."
        ↓
Briefing updates in real time
        ↓
Next Bob session: Bob already knows and enforces the rule
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     DEVELOPER                           │
│         makes a correction to Bob's code                │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 1 — Capture (VS Code Extension)                  │
│  Ctrl+Shift+B marks Bob's output                        │
│  On save, logs before/after to .bob_memory/raw_log.json │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 2 — Rules Engine (rules-engine.js)               │
│  Reads raw_log.json every 60 seconds                    │
│  Calls IBM watsonx.ai Granite to summarise corrections  │
│  Writes rules to .bob_memory/registry.json              │
│  Detects recurring mistakes → escalates to high priority│
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 3 — Briefing Generator (briefing-generator.js)   │
│  Watches registry.json for changes                      │
│  Compiles rules into .bob_memory/BOB_BRIEFING.md        │
│  Includes sprint scope from scope.json                  │
│  Auto-updates within seconds of any rule change         │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 4 — MCP Server + Bob Custom Mode                 │
│  Bob connects to bob-memory MCP server on session start │
│  Calls get_briefing tool → reads BOB_BRIEFING.md        │
│  Calls validate_code tool → checks code before output   │
│  Bob enforces all rules for the rest of the session     │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Capture | TypeScript, VS Code Extension API |
| Rules Engine | Node.js, IBM watsonx.ai Granite, REST API |
| Briefing Generator | Node.js, fs.watch |
| MCP Server | Node.js, @modelcontextprotocol/sdk |
| AI Model | IBM Granite 3 8B Instruct |
| Bob Integration | MCP Protocol, Bob Custom Mode |

---

## Prerequisites

Before you begin, make sure you have:

- [Node.js](https://nodejs.org/) v18 or higher
- [IBM Bob IDE](https://www.ibm.com/docs/en/bob) installed
- An IBM Cloud account with watsonx.ai access
- Your IBM watsonx.ai credentials:
  - API Key
  - Project ID
  - URL (always `https://us-south.ml.cloud.ibm.com`)

---

## Installation & Setup

### Step 1 — Clone the repository

```bash
git clone https://github.com/iftekharalamfahim/Bob-Watcher.git
cd Bob-Watcher
```

### Step 2 — Install dependencies

```bash
# Root dependencies (rules engine + briefing generator)
npm install

# MCP server dependencies
cd mcp-server
npm install
cd ..
```

### Step 3 — Create your environment file

Create a `.env` file in the project root:

```bash
WATSONX_API_KEY=your_api_key_here
WATSONX_PROJECT_ID=your_project_id_here
WATSONX_URL=https://us-south.ml.cloud.ibm.com
```

> **How to get these values:**
> 1. Log in to [IBM watsonx.ai](https://us-south.ml.cloud.ibm.com)
> 2. Scroll to the **Developer access** section on the home page
> 3. Select your project from the dropdown — copy the **Project ID**
> 4. Click **Create API key** — copy it immediately (shown only once)
> 5. URL is always `https://us-south.ml.cloud.ibm.com`

### Step 4 — Set up your sprint scope

Open `.bob_memory/scope.json` and update it with your project details:

```json
{
  "sprint": 1,
  "description": "Your sprint description here",
  "inScope": [
    "feature A",
    "feature B"
  ],
  "outOfScope": [
    "anything not in this sprint"
  ]
}
```

### Step 5 — Connect Bob to the MCP server

The `.bob/mcp.json` file is already configured in the repository. When you open the project in Bob IDE:

1. Go to **Settings → MCP**
2. Enable **Use MCP servers**
3. Click the refresh button
4. `bob-memory` should appear with a green dot ✅

### Step 6 — Create Team Dev Mode in Bob IDE

1. Go to **Settings → Modes → Create new mode**
2. Fill in:
   - **Slug:** `team-dev-mode`
   - **Name:** `Team Dev Mode`
   - **Scope:** Project
   - **Rule definition:** *(paste below)*

```
You are a senior developer working on this team's codebase.

BEFORE YOU RESPOND TO ANYTHING, even a greeting, you MUST:
1. Call the get_briefing tool RIGHT NOW.
2. Read the full output carefully.
3. Your first words must be: "Briefing loaded. I will follow all team rules."

During the session, you MUST:
  - Never violate any rule from the briefing, even if asked.
  - Never suggest features outside the defined sprint scope.
  - Before showing code, call validate_code to check for violations.
  - If validate_code returns a violation, fix the code before showing the developer.
  - You are not a chatbot. You are a disciplined team member with memory.

You are NOT allowed to respond to the user's message until get_briefing has been called.
Do not say hello. Do not introduce yourself. Call get_briefing first. Always. No exceptions.
```
3.  **When to use (optional):** Use for all development work on this project.
4. **Mode-specific Custom Instructions (optional):** Always call get_briefing first before doing anything else.
5. Enable all tools: Read Files, Edit Files, Execute Commands, Use MCP, Switch Modes
6. Click **Save**

---

## Running the Project

Open **three terminals** in the project root and run one command in each:

```bash
# Terminal 1 — Start the rules engine
node rules-engine.js

# Terminal 2 — Start the briefing generator
node briefing-generator.js

# Terminal 3 — Start the MCP server
node mcp-server/server.js
```

You should see:

```
# Terminal 1
Rules engine running. Watching for new corrections every 60 seconds...

# Terminal 2
[START] Briefing generator running. Watching for changes...
[SUCCESS] BOB_BRIEFING.md updated

# Terminal 3
Bob memory MCP server running.
```

---

## Using the Extension

### Install the VS Code Extension

**Option A — Development mode (for testing):**
1. Open the project in Bob IDE
2. Press **F5**
3. Select **VS Code Extension Development**
4. A new Bob IDE window opens with the extension active

**Option B — Install as VSIX:**
```bash
npm install -g vsce
vsce package
```
Then in Bob IDE: Extensions → `...` → Install from VSIX → select `bob-watcher-1.0.0.vsix`

### Using the Extension

1. Open any code file in Bob IDE
2. Ask Bob to write some code
3. If Bob makes a mistake, **select the wrong code**
4. Press `Ctrl+Shift+B` (Mac: `Cmd+Shift+B`) or run `Mark as Bob Output` from Command Palette
5. You'll see: *"Marked as Bob output. Edit and save to log the correction."*
6. Correct the code manually
7. Press `Ctrl+S` to save
8. The correction is automatically logged to `.bob_memory/raw_log.json`

Within 60 seconds, the rules engine processes it, watsonx.ai generates a rule, and Bob's briefing updates automatically.

---

## Seeing the Results

### Check the pipeline is working

After making a correction:

**1. raw_log.json** — should have your correction:
```json
[
  {
    "id": "fix_001",
    "before": "var name = getUserData();",
    "after": "const name = getUserData();",
    "file": "app.js",
    "timestamp": "2026-05-17T08:00:00.000Z"
  }
]
```

**2. registry.json** — should have the generated rule:
```json
[
  {
    "id": "rule_001",
    "rule": "Always use const when declaring variables that don't change.",
    "category": "syntax",
    "count": 1,
    "priority": "normal"
  }
]
```

**3. BOB_BRIEFING.md** — should show the rule under team rules section

**4. Bob IDE** — start a new task in Team Dev Mode and ask Bob to write code. Bob should follow the rule automatically.

---

## How Bob Learns Over Time

| Corrections | What happens |
|-------------|-------------|
| 1st correction | Rule created with `priority: normal` |
| 2nd same type | Rule count increments to 2, `priority: high` |
| 3rd+ same type | Rule stays high priority, count keeps growing |

High priority rules appear at the top of Bob's briefing in bold — Bob treats them as hard constraints.

---

## Project Structure

```
Bob-Watcher/
├── .bob/
│   ├── mcp.json              ← MCP server config (auto-connects Bob)
│   └── custom_modes.yaml     ← Team Dev Mode definition
├── .bob_memory/
│   ├── BOB_BRIEFING.md       ← Generated briefing (Bob reads this)
│   ├── registry.json         ← Accumulated team rules
│   └── scope.json            ← Sprint scope (team leader updates)
├── mcp-server/
│   ├── server.js             ← MCP server (get_briefing + validate_code)
│   └── package.json
├── src/
│   └── extension.ts          ← VS Code extension source
├── bob_sessions/             ← Bob task session exports (for judging)
├── briefing-generator.js     ← Auto-compiles BOB_BRIEFING.md
├── rules-engine.js           ← Processes corrections via watsonx.ai
├── capture.js                ← Manual fallback for logging corrections
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## Files Intentionally Not Committed

| File | Reason |
|------|--------|
| `.env` | Contains credentials — never commit |
| `node_modules/` | Auto-generated — run npm install |
| `.bob_memory/raw_log.json` | Personal to each developer's machine |
| `.bob_memory/processed.json` | Auto-generated runtime file |
| `package-lock.json` | Differs per machine/OS |

---

## Troubleshooting

**Bob memory MCP not showing green dot**
- Make sure `node mcp-server/server.js` is running
- Go to Bob IDE Settings → MCP → click the refresh button
- Confirm `.bob/mcp.json` exists in the project root

**Rules engine says "No new corrections"**
- Check `.bob_memory/raw_log.json` has entries
- Check `.bob_memory/processed.json` — if the entry ID is already there, it was already processed
- Add a new entry with a different ID to test

**watsonx.ai returning 400 Bad Request**
- Check your `.env` file has correct credentials
- Make sure you are using the hackathon IBM Cloud account, not a personal account
- Regenerate your API key from the watsonx.ai Developer access section

**Extension not capturing corrections**
- Make sure you selected the code before pressing `Ctrl+Shift+B`
- The extension only logs when you save after making changes to marked code
- Check the extension is active (F5 development window or VSIX installed)

**BOB_BRIEFING.md not updating**
- Make sure `node briefing-generator.js` is running
- Check Terminal 2 for any error messages
- Manually save `registry.json` to trigger the file watcher

---

## Built With

- [IBM Bob](https://www.ibm.com/docs/en/bob) — AI development partner
- [IBM watsonx.ai](https://www.ibm.com/products/watsonx-ai) — Granite foundation model for rule generation
- [Model Context Protocol](https://modelcontextprotocol.io/) — Bob ↔ MCP server communication
- [Node.js](https://nodejs.org/) — Runtime for all backend scripts
- [TypeScript](https://www.typescriptlang.org/) — VS Code extension

---

## Team

**Team Spongebob Squarepants**

| Name | Role |
|------|------|
| Iftekhar Alam Fahim (brainsect) | Team Lead & MCP server Creator |
| Loo Chun Qian (augustloo) | Bobs rules engine |
| Ridoy Kumar Adhikary (ridoy_adhikary) | VSCode Extension Generator |
| Rafi Ahmed (codewithrafi) | BOB_Briefing.md Generator |
| Muhammad (muhammad9) | Advisor & Project Idea |

Built at the IBM Bob Hackathon — May 2026

---

## License

MIT