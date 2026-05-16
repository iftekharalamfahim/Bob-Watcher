// mcp-server/server.js
// Run from your PROJECT ROOT: node mcp-server/server.js

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");

// PATHS 
const BRIEFING = path.join(process.cwd(), ".bob_memory", "BOB_BRIEFING.md");
const REGISTRY = path.join(process.cwd(), ".bob_memory", "registry.json");

// SERVER SETUP
const server = new McpServer({
  name: "bob-memory",
  version: "1.0.0",
});

// TOOL 1: get_briefing
server.registerTool(
  "get_briefing",
  {
    description: "Read the team rules and sprint scope. Call this at the start of every session.",
    inputSchema: {},
  },
  async () => {
    try {
      await fs.promises.access(BRIEFING);
      const content = await fs.promises.readFile(BRIEFING, "utf8");
      return {
        content: [{ type: "text", text: content }],
      };
    } catch {
      return {
        content: [{
          type: "text",
          text: "No briefing file found yet. BOB_BRIEFING.md does not exist. Proceed normally.",
        }],
      };
    }
  }
);

// HELPER: Load rules from registry
const loadRules = async () => {
  try {
    await fs.promises.access(REGISTRY);
    const raw = await fs.promises.readFile(REGISTRY, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

//  TOOL 2: validate_code
server.registerTool(
  "validate_code",
  {
    description: "Check code against team rules before showing it to the developer.",
    inputSchema: {
      code: z.string().describe("The code snippet to validate"),
    },
  },
  async ({ code }) => {
    const rules = await loadRules();
    
    if (!rules) {
      return {
        content: [{ type: "text", text: "No rules registry found. Skipping validation." }],
      };
    }

    // Format rules as a numbered list
    const rulesList = rules
      .map((rule, index) => `${index + 1}. ${rule.rule}`)
      .join("\n");

    // Create prompt for Bob to reason about rule violations
    const prompt = `You are validating the following code against team rules.

TEAM RULES:
${rulesList}

CODE TO VALIDATE:
\`\`\`
${code}
\`\`\`

INSTRUCTIONS:
Analyze the code carefully against each rule. If any rule is violated:
- State which specific rule number is violated
- Explain why it violates that rule
- Provide the corrected code

If no rules are violated, respond with exactly: "Code passed all team rule checks."`;

    return {
      content: [{ type: "text", text: prompt }],
    };
  }
);

const transport = new StdioServerTransport();
server.connect(transport);

process.stderr.write("Bob memory MCP server running.\n");