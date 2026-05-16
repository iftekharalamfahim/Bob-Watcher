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

// WATSONX.AI CALL
async function summariseCorrection(before, after) {
  const prompt =
    `A developer corrected AI-generated code.\n` +
    `BEFORE: ${before}\n` +
    `AFTER:  ${after}\n\n` +
    `Write ONE sentence (max 15 words) describing the coding rule this enforces.\n` +
    `Start with 'Always' or 'Never'. Output only the rule, nothing else.`;

  try {
    // watsonx.ai REST API call
    const iamResponse = await fetch('https://iam.cloud.ibm.com/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${process.env.WATSONX_API_KEY}`
    });

    const iamData = await iamResponse.json();
    const iamToken = iamData.access_token;

    // Call watsonx.ai text generation
    const response = await fetch(
      `${process.env.WATSONX_URL}/ml/v1/text/generation?version=2023-05-29`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${iamToken}`,
        },
        body: JSON.stringify({
          model_id: 'ibm/granite-3-8b-instruct',
          input: prompt,
          project_id: process.env.WATSONX_PROJECT_ID,
          parameters: {
            max_new_tokens: 60,
            temperature: 0.2,
          },
        }),
      }
    );

    const data = await response.json();
    const rule = data.results?.[0]?.generated_text?.trim();

    if (!rule) throw new Error('Empty response from watsonx.ai');
    return rule;

  } catch (err) {
    // Fallback: basic rule detection if API fails
    console.error('watsonx.ai call failed, using fallback:', err.message);
    return detectRuleFallback(before, after);
  }
}

// FALLBACK RULE DETECTION (if watsonx.ai is unavailable)
function detectRuleFallback(before, after) {
  if (/\bvar\b/.test(before) && /\bconst\b/.test(after)) {
    return 'Always use const instead of var.';
  }
  if (/function\s+\w+\s*\(/.test(before) && /=>\s*/.test(after)) {
    return 'Always use arrow functions instead of regular function declarations.';
  }
  if (/AUTO_INCREMENT/i.test(before) || /ENGINE=InnoDB/i.test(before)) {
    return 'Never use MySQL syntax. This project uses PostgreSQL.';
  }
  return 'Always follow team coding standards.';
}

// CATEGORY DETECTION
function detectCategory(rule) {
  const r = rule.toLowerCase();
  if (/const|var|let|arrow|function/.test(r)) return 'syntax';
  if (/postgres|mysql|database|query|sql/.test(r)) return 'database';
  if (/scope|feature|sprint/.test(r)) return 'scope';
  if (/import|require|module/.test(r)) return 'imports';
  return 'general';
}

// MAIN PROCESSING FUNCTION 
async function processNewEntries() {
  console.log('Checking for new corrections...');

  const log       = await readJSON(RAW_LOG);
  const processed = await readJSON(PROCESSED);
  const registry  = await readJSON(REGISTRY);

  // Only process entries we haven't seen before
  const newEntries = log.filter(entry => !processed.includes(entry.id));

  if (newEntries.length === 0) {
    console.log('No new corrections to process.');
    return;
  }

  console.log(`Found ${newEntries.length} new correction(s) to process.`);

  for (const entry of newEntries) {
    console.log(`Processing ${entry.id}...`);

    const ruleText = await summariseCorrection(entry.before, entry.after);
    const category = detectCategory(ruleText);

    // Check if a rule in the same category already exists
    const existing = registry.find(r => r.category === category);

    if (existing) {
      // Increment count and upgrade priority if repeated
      existing.count += 1;
      if (existing.count >= 2) {
        existing.priority = 'high';
      }
      console.log(`Updated existing rule [${category}] — count: ${existing.count}`);
    } else {
      // to add as a new rule
      const newRule = {
        id:       `rule_${String(registry.length + 1).padStart(3, '0')}`,
        rule:     ruleText,
        category: category,
        count:    1,
        priority: 'normal',
      };
      registry.push(newRule);
      console.log(`New rule added: "${ruleText}"`);
    }

    // mark this entry as processed
    processed.push(entry.id);
  }

  // Save both files
  await writeJSON(REGISTRY, registry);
  await writeJSON(PROCESSED, processed);

  console.log(`Done. Total rules in registry: ${registry.length}`);
}

// Run immediately on start, then every 60 seconds
processNewEntries();
setInterval(processNewEntries, 60000);

console.log('Rules engine running. Watching for new corrections every 60 seconds...');
console.log('Press Ctrl+C to stop.');