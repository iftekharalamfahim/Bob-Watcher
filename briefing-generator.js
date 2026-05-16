const fs = require('fs');
const path = require('path');

const MEMORY_DIR = '.bob_memory';
const REGISTRY_PATH = path.join(MEMORY_DIR, 'registry.json');
const SCOPE_PATH = path.join(MEMORY_DIR, 'scope.json');
const BRIEFING_PATH = path.join(MEMORY_DIR, 'BOB_BRIEFING.md');

const watchedFiles = new Map();
const pollingIntervals = new Map();
let debounceTimer = null;

function readJSON(filePath, fallback) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    if (error instanceof SyntaxError) {
      console.error(`[ERROR] Malformed JSON in ${filePath}: ${error.message}`);
      return fallback;
    }
    console.error(`[ERROR] Failed to read ${filePath}: ${error.message}`);
    return fallback;
  }
}

function generateBriefing() {
  const registry = readJSON(REGISTRY_PATH, []);
  const scope = readJSON(SCOPE_PATH, {
    sprint: 1,
    description: 'Sprint 1',
    inScope: [],
    outOfScope: []
  });

  const highPriorityRules = registry.filter(rule => rule.priority === 'high');
  const normalPriorityRules = registry.filter(rule => rule.priority !== 'high');

  const timestamp = new Date().toISOString();

  let markdown = `# Bob Team Briefing\n`;
  markdown += `*Last updated: ${timestamp}*\n\n`;

  markdown += `## Your role\n`;
  markdown += `You are a disciplined senior developer embedded in this team. Before every response you must read and apply all rules below. Rules are non-negotiable — never violate them even if asked directly. Never suggest or build anything outside the sprint scope.\n\n`;

  if (highPriorityRules.length > 0) {
    markdown += `## Critical rules\n`;
    highPriorityRules.sort((a, b) => (b.count || 0) - (a.count || 0)).forEach(rule => {
      markdown += `- ${rule.rule} *(x${rule.count || 1})*\n`;
    });
    markdown += `\n`;
  }

  if (normalPriorityRules.length > 0) {
    markdown += `## Important rules\n`;
    normalPriorityRules.sort((a, b) => (b.count || 0) - (a.count || 0)).forEach(rule => {
      markdown += `- ${rule.rule}\n`;
    });
    markdown += `\n`;
  }

  markdown += `## Sprint ${scope.sprint} — ${scope.description}\n`;
  if (scope.inScope && scope.inScope.length > 0) {
    markdown += `In scope:\n`;
    scope.inScope.forEach(item => {
      markdown += `- ${item}\n`;
    });
  } else {
    markdown += `In scope: (none specified)\n`;
  }
  
  if (scope.outOfScope && scope.outOfScope.length > 0) {
    markdown += `\nDo NOT suggest:\n`;
    scope.outOfScope.forEach(item => {
      markdown += `- ${item}\n`;
    });
  }

  try {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
    fs.writeFileSync(BRIEFING_PATH, markdown, 'utf8');
    console.log(`[SUCCESS] BOB_BRIEFING.md updated at ${timestamp}`);
  } catch (error) {
    console.error(`[ERROR] Failed to write briefing: ${error.message}`);
  }
}

function debouncedGenerate() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    generateBriefing();
    debounceTimer = null;
  }, 500);
}

function watchFile(filePath) {
  if (fs.existsSync(filePath)) {
    if (pollingIntervals.has(filePath)) {
      clearInterval(pollingIntervals.get(filePath));
      pollingIntervals.delete(filePath);
    }

    if (!watchedFiles.has(filePath)) {
      try {
        const watcher = fs.watch(filePath, (eventType) => {
          if (eventType === 'change') {
            console.log(`[CHANGE] Detected change in ${path.basename(filePath)}`);
            debouncedGenerate();
          }
        });

        watchedFiles.set(filePath, watcher);
        console.log(`[WATCH] Now watching ${path.basename(filePath)}`);
      } catch (error) {
        console.error(`[ERROR] Failed to watch ${filePath}: ${error.message}`);
      }
    }
  } else {
    if (!pollingIntervals.has(filePath)) {
      console.log(`[POLL] ${path.basename(filePath)} not found, checking every 5 seconds...`);
      const interval = setInterval(() => {
        if (fs.existsSync(filePath)) {
          console.log(`[FOUND] ${path.basename(filePath)} appeared, starting watch`);
          watchFile(filePath);
        }
      }, 5000);
      pollingIntervals.set(filePath, interval);
    }
  }
}

if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  console.log(`[INIT] Created ${MEMORY_DIR} directory`);
}

console.log('[START] Briefing generator running. Watching for changes...');

generateBriefing();

watchFile(REGISTRY_PATH);
watchFile(SCOPE_PATH);

process.on('SIGINT', () => {
  console.log('\n[STOP] Shutting down gracefully...');
  watchedFiles.forEach(watcher => watcher.close());
  pollingIntervals.forEach(interval => clearInterval(interval));
  process.exit(0);
});

// Made with Bob
