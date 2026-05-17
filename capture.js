const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let bobCode = '';
let correctedCode = '';
let emptyLineCount = 0;

console.log('What did Bob write? (paste and press Enter twice):');

// Read Bob's original code
process.stdin.on('data', (chunk) => {
  const input = chunk.toString();
  
  if (bobCode === '' || emptyLineCount < 2) {
    // Still reading Bob's code
    if (input === '\n' || input === '\r\n') {
      emptyLineCount++;
      if (emptyLineCount === 2) {
        // Finished reading Bob's code
        console.log('\nWhat did you change it to? (paste and press Enter twice):');
        emptyLineCount = 0;
      } else {
        bobCode += input;
      }
    } else {
      bobCode += input;
      emptyLineCount = 0;
    }
  } else {
    // Reading corrected code
    if (input === '\n' || input === '\r\n') {
      emptyLineCount++;
      if (emptyLineCount === 2) {
        // Finished reading corrected code
        process.stdin.pause();
        logCorrection();
      } else {
        correctedCode += input;
      }
    } else {
      correctedCode += input;
      emptyLineCount = 0;
    }
  }
});

function logCorrection() {
  // Remove trailing newlines
  bobCode = bobCode.replace(/\n+$/, '');
  correctedCode = correctedCode.replace(/\n+$/, '');
  
  // Get workspace root (current directory)
  const workspaceRoot = process.cwd();
  
  // Build paths
  const memoryDir = path.join(workspaceRoot, '.bob_memory');
  const logPath = path.join(memoryDir, 'raw_log.json');
  
  // Create .bob_memory directory if it doesn't exist
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }
  
  // Read existing entries
  let entries = [];
  if (fs.existsSync(logPath)) {
    try {
      const fileContent = fs.readFileSync(logPath, 'utf8');
      entries = JSON.parse(fileContent);
    } catch (error) {
      // If file is corrupted, start fresh
      entries = [];
    }
  }
  
  // Build new entry
  const newId = 'fix_' + String(entries.length + 1).padStart(3, '0');
  const newEntry = {
    id: newId,
    before: bobCode,
    after: correctedCode,
    file: 'manual-entry.js',
    timestamp: new Date().toISOString()
  };
  
  // Push entry and write back
  entries.push(newEntry);
  fs.writeFileSync(logPath, JSON.stringify(entries, null, 2), 'utf8');
  
  console.log(`\nLogged: ${newId}`);
  process.exit(0);
}

// Made with Bob
