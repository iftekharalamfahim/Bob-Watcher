import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Module-level variables to track Bob's original code
let bobOriginal: string = '';
let bobFile: string = '';

export function activate(context: vscode.ExtensionContext) {
  // Task 2: Register the "Mark as Bob Output" command
  const markCommand = vscode.commands.registerCommand('bob-watcher.mark', () => {
    const editor = vscode.window.activeTextEditor;
    
    // Check if editor is open
    if (!editor) {
      vscode.window.showWarningMessage('No editor is open. Please open a file first.');
      return;
    }
    
    // Check if text is selected
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    
    if (!selectedText || selectedText.trim() === '') {
      vscode.window.showWarningMessage('No text selected. Please select Bob\'s code first.');
      return;
    }
    
    // Store the original code and file path
    bobOriginal = selectedText;
    bobFile = editor.document.fileName;
    
    vscode.window.showInformationMessage('Marked as Bob output. Edit and save to log the correction.');
  });
  
  // Task 3: Add save watcher to detect diffs
  const saveWatcher = vscode.workspace.onDidSaveTextDocument(async (document) => {
    // Return early if no Bob code is marked or if it's a different file
    if (!bobOriginal || document.fileName !== bobFile) {
      return;
    }
    
    // Get the current full text of the saved document
    const currentText = document.getText();
    
    // If nothing changed, return
    if (currentText === bobOriginal) {
      return;
    }
    
    // Split both strings by newline and compare line by line
    const originalLines = bobOriginal.split('\n');
    const currentLines = currentText.split('\n');
    const maxLines = Math.max(originalLines.length, currentLines.length);
    
    const changedBefore: string[] = [];
    const changedAfter: string[] = [];
    
    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i] || '';
      const currentLine = currentLines[i] || '';
      
      if (originalLine !== currentLine) {
        changedBefore.push(originalLine);
        changedAfter.push(currentLine);
      }
    }
    
    // If no changes detected, return
    if (changedBefore.length === 0) {
      return;
    }
    
    // Log the correction
    await logCorrection(document.fileName, changedBefore.join('\n'), changedAfter.join('\n'));
    
    // Reset bobOriginal to prevent double-logging
    bobOriginal = '';
  });
  
  context.subscriptions.push(markCommand, saveWatcher);
}

// Task 4: Implement logCorrection function
async function logCorrection(filePath: string, before: string, after: string): Promise<void> {
  // Get workspace root
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  
  if (!workspaceRoot) {
    // Return silently if no workspace is open
    return;
  }
  
  // Build paths
  const memoryDir = path.join(workspaceRoot, '.bob_memory');
  const logPath = path.join(memoryDir, 'raw_log.json');
  
  // Create .bob_memory directory if it doesn't exist
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }
  
  // Read existing entries
  let entries: any[] = [];
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
    before: before,
    after: after,
    file: path.basename(filePath),
    timestamp: new Date().toISOString()
  };
  
  // Push entry and write back
  entries.push(newEntry);
  fs.writeFileSync(logPath, JSON.stringify(entries, null, 2), 'utf8');
  
  // Show notification
  vscode.window.showInformationMessage(`Correction logged: ${newId}`);
}

export function deactivate() {}

// Made with Bob
