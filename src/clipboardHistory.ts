import { app } from "electron";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { encrypt, decrypt, redactSecret } from "./utils";

export interface ClipboardItem {
  id: string;
  timestamp: number;
  content: string; // Encrypted
  isSecret: boolean;
  secretType?: string;
  redacted?: string;
  appName?: string;
}

const HISTORY_PATH = path.join(app.getPath("userData"), "clipboard-history.json");
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(app.getName() + app.getPath("userData"))
  .digest("hex");

let history: ClipboardItem[] = [];

export function loadHistory(): ClipboardItem[] {
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      const data = fs.readFileSync(HISTORY_PATH, "utf-8");
      const items = JSON.parse(data) as ClipboardItem[];
      // Decrypt content with error handling
      return items.map((item) => {
        try {
          return {
            ...item,
            content: item.isSecret ? decrypt(item.content, ENCRYPTION_KEY) : item.content,
          };
        } catch (decryptError) {
          console.error("Error decrypting history item:", decryptError);
          // Return item with redacted content if decryption fails
          return {
            ...item,
            content: item.redacted || "[Decryption failed]",
          };
        }
      });
    }
  } catch (error) {
    console.error("Error loading clipboard history:", error);
    // If file is corrupted, try to backup and reset
    try {
      if (fs.existsSync(HISTORY_PATH)) {
        const backupPath = HISTORY_PATH + ".backup";
        fs.copyFileSync(HISTORY_PATH, backupPath);
        fs.unlinkSync(HISTORY_PATH);
        console.log("Corrupted history file backed up and reset");
      }
    } catch (backupError) {
      console.error("Error backing up corrupted history:", backupError);
    }
  }
  return [];
}

export function saveHistory(): void {
  try {
    // Encrypt secrets before saving
    const itemsToSave = history.map((item) => ({
      ...item,
      content: item.isSecret ? encrypt(item.content, ENCRYPTION_KEY) : item.content,
    }));
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(itemsToSave, null, 2));
  } catch (error) {
    console.error("Error saving clipboard history:", error);
  }
}

export function addToHistory(
  content: string,
  isSecret: boolean,
  secretType?: string,
  appName?: string
): void {
  const item: ClipboardItem = {
    id: crypto.randomBytes(16).toString("hex"),
    timestamp: Date.now(),
    content,
    isSecret,
    secretType,
    redacted: isSecret ? redactSecret(content) : undefined,
    appName,
  };

  history.unshift(item);

  // Keep only last N items
  const maxSize = 10; // Can be made configurable
  if (history.length > maxSize) {
    history = history.slice(0, maxSize);
  }

  // Auto-delete risky items after 1 hour
  if (isSecret) {
    setTimeout(() => {
      removeFromHistory(item.id);
    }, 60 * 60 * 1000);
  }

  saveHistory();
}

export function removeFromHistory(id: string): void {
  history = history.filter((item) => item.id !== id);
  saveHistory();
}

export function getHistory(): ClipboardItem[] {
  return history;
}

export function clearHistory(): void {
  history = [];
  saveHistory();
}

export function getPreviousSafeItem(): ClipboardItem | null {
  return history.find((item) => !item.isSecret) || null;
}

// Load history on startup
history = loadHistory();

