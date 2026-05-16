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

// PRE-COMPILED REGEXES 
const PATTERNS = {
  varUsage:    /\bvar\s+/,
  regularFunc: /\bfunction\s+\w+\s*\(/,
  mysqlSyntax: /AUTO_INCREMENT|ENGINE\s*=\s*InnoDB/i,
};

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

// HELPER: Check if code violates a rule
const matchesRule = (rule, code) => {
  const r = rule.rule.toLowerCase();
  
  if ((r.includes("never use var") || r.includes("always use const")) && PATTERNS.varUsage.test(code)) {
    return true;
  }
  if ((r.includes("arrow function") || r.includes("never use regular function")) && PATTERNS.regularFunc.test(code)) {
    return true;
  }
  if ((r.includes("mysql") || r.includes("postgresql") || r.includes("postgres")) && PATTERNS.mysqlSyntax.test(code)) {
    return true;
  }
  return false;
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

    const violations = rules
      .filter(rule => matchesRule(rule, code))
      .map(rule => `VIOLATION: ${rule.rule}`);

    if (violations.length === 0) {
      return {
        content: [{ type: "text", text: "Code passed all team rule checks. Safe to show developer." }],
      };
    }

    return {
      content: [{
        type: "text",
        text: `Found ${violations.length} rule violation(s):\n\n${violations.join("\n")}\n\nFix these before showing the developer.`,
      }],
    };
  }
);

const transport = new StdioServerTransport();
server.connect(transport);

process.stderr.write("Bob memory MCP server running.\n");