// Run from project root: node rules-engine.js
// Reads raw_log.json, calls watsonx.ai, writes registry.json

require('dotenv').config();
const fs = require('fs');

const RAW_LOG   = '.bob_memory/raw_log.json';
const REGISTRY  = '.bob_memory/registry.json';
const PROCESSED = '.bob_memory/processed.json';

// FILE HELPERS (async — avoids blocking event loop)
async function readJSON(filePath, fallback = []) {
  try {
    await fs.promises.access(filePath);
    const content = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

async function writeJSON(filePath, data) {
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
}

// WATSONX.AI CONFIGURATION
const WATSONX_MODEL = 'ibm/granite-3-8b-instruct';
const WATSONX_MAX_TOKENS = 80;
const WATSONX_TEMPERATURE = 0.2;
const IAM_TOKEN_EXPIRY_BUFFER_MS = 300000; // 5 minutes buffer before expiry

// IAM Token Cache
let cachedIAMToken = null;
let tokenExpiryTime = 0;

// HELPER: Get IAM Token (with caching)
async function getIAMToken() {
  const now = Date.now();
  
  // Return cached token if still valid
  if (cachedIAMToken && now < tokenExpiryTime) {
    return cachedIAMToken;
  }

  try {
    const response = await fetch('https://iam.cloud.ibm.com/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${process.env.WATSONX_API_KEY}`
    });

    if (!response.ok) {
      throw new Error(`IAM authentication failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.access_token) {
      throw new Error('No access token in IAM response');
    }

    // Cache token with expiration (default 3600s, use buffer for safety)
    cachedIAMToken = data.access_token;
    const expiresIn = (data.expires_in || 3600) * 1000; // Convert to milliseconds
    tokenExpiryTime = now + expiresIn - IAM_TOKEN_EXPIRY_BUFFER_MS;

    return cachedIAMToken;
  } catch (err) {
    throw new Error(`IAM token retrieval failed: ${err.message}`);
  }
}

// HELPER: Call Watsonx.ai Text Generation
async function callWatsonxGeneration(prompt, token) {
  try {
    const response = await fetch(
      `${process.env.WATSONX_URL}/ml/v1/text/generation?version=2023-05-29`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          model_id: WATSONX_MODEL,
          input: prompt,
          project_id: process.env.WATSONX_PROJECT_ID,
          parameters: {
            max_new_tokens: WATSONX_MAX_TOKENS,
            temperature: WATSONX_TEMPERATURE,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Watsonx API call failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.results?.[0]?.generated_text?.trim();

    if (!responseText) {
      throw new Error('Empty response from watsonx.ai');
    }

    return responseText;
  } catch (err) {
    throw new Error(`Watsonx generation failed: ${err.message}`);
  }
}

// HELPER: Parse Rule Response using Regex
function parseRuleResponse(responseText) {
  // Use regex to extract RULE and CATEGORY (case-insensitive, flexible whitespace)
  const ruleMatch = /RULE:\s*(.+)/i.exec(responseText);
  const categoryMatch = /CATEGORY:\s*(\w+)/i.exec(responseText);

  const rule = ruleMatch?.[1]?.trim();
  const category = categoryMatch?.[1]?.trim().toLowerCase();

  if (!rule || !category) {
    throw new Error('Failed to parse RULE or CATEGORY from response');
  }

  return { rule, category };
}

// HELPER: Build Prompt
function buildPrompt(before, after) {
  return (
    `A developer corrected AI-generated code.\n` +
    `BEFORE: ${before}\n` +
    `AFTER: ${after}\n\n` +
    `1. Write ONE sentence (max 15 words) describing the coding rule this enforces. Start with Always or Never.\n` +
    `2. Write ONE word for the category: syntax, database, architecture, style, security, or general.\n\n` +
    `Reply in this exact format:\n` +
    `RULE: your rule here\n` +
    `CATEGORY: one word here`
  );
}

// WATSONX.AI CALL (Refactored)
async function summariseCorrection(before, after) {
  try {
    const prompt = buildPrompt(before, after);
    const token = await getIAMToken();
    const responseText = await callWatsonxGeneration(prompt, token);
    return parseRuleResponse(responseText);
  } catch (err) {
    // Fallback: basic rule detection if API fails
    console.error('watsonx.ai call failed, using fallback:', err.message);
    return detectRuleFallback(before, after);
  }
}

// FALLBACK RULE DETECTION (if watsonx.ai is unavailable)
function detectRuleFallback(before, after) {
  return {
    rule: 'Always follow the coding standards established by the team.',
    category: 'general'
  };
}

// HELPER: Generate next rule ID (more robust than length-based)
function generateRuleId(registry) {
  const maxId = registry.reduce((max, r) => {
    const num = parseInt(r.id.replace('rule_', ''), 10);
    return num > max ? num : max;
  }, 0);
  return `rule_${String(maxId + 1).padStart(3, '0')}`;
}

// HELPER: Update existing rule or create new one
function updateOrCreateRule(registry, category, ruleText) {
  const existing = registry.find(r => r.category === category);
  
  if (existing) {
    existing.count += 1;
    if (existing.count >= 2) {
      existing.priority = 'high';
    }
    return { type: 'updated', rule: existing };
  }
  
  const newRule = {
    id: generateRuleId(registry),
    rule: ruleText,
    category: category,
    count: 1,
    priority: 'normal',
  };
  registry.push(newRule);
  return { type: 'created', rule: newRule };
}

// MAIN PROCESSING FUNCTION (Refactored)
async function processNewEntries() {
  try {
    console.log('Checking for new corrections...');

    // Read all files concurrently
    const [log, processed, registry] = await Promise.all([
      readJSON(RAW_LOG),
      readJSON(PROCESSED),
      readJSON(REGISTRY)
    ]);

    // Use Set for O(1) lookup performance
    const processedSet = new Set(processed);
    const newEntries = log.filter(entry => !processedSet.has(entry.id));

    if (newEntries.length === 0) {
      console.log('No new corrections to process.');
      return;
    }

    console.log(`Found ${newEntries.length} new correction(s) to process.`);

    const newProcessedIds = [];

    for (const entry of newEntries) {
      console.log(`Processing ${entry.id}...`);

      const { rule: ruleText, category } = await summariseCorrection(entry.before, entry.after);

      // Update or create rule using extracted helper
      const result = updateOrCreateRule(registry, category, ruleText);
      
      if (result.type === 'updated') {
        console.log(`✓ Updated rule [${category}] — count: ${result.rule.count}`);
      } else {
        console.log(`✓ Created rule [${category}]: "${ruleText}"`);
      }

      newProcessedIds.push(entry.id);
    }

    // Update processed list
    processed.push(...newProcessedIds);

    // Save both files
    await writeJSON(REGISTRY, registry);
    await writeJSON(PROCESSED, processed);

    console.log(`✓ Done. Total rules in registry: ${registry.length}`);
    
  } catch (error) {
    console.error('✗ Error processing entries:', error.message);
    // Function will retry on next interval (60s)
  }
}

// Run immediately on start, then every 60 seconds
processNewEntries();
setInterval(processNewEntries, 60000);

console.log('Rules engine running. Watching for new corrections every 60 seconds...');
console.log('Press Ctrl+C to stop.');