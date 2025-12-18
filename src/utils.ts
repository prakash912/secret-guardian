import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";

/**
 * Redact a secret, showing only first and last few characters
 */
export function redactSecret(secret: string, showFirst = 4, showLast = 4): string {
  if (secret.length <= showFirst + showLast) {
    return "*".repeat(secret.length);
  }
  const first = secret.substring(0, showFirst);
  const last = secret.substring(secret.length - showLast);
  const middle = "*".repeat(Math.max(8, secret.length - showFirst - showLast));
  return `${first}${middle}${last}`;
}

/**
 * Check if a pattern matches an ignore pattern
 */
export function matchesIgnorePattern(text: string, pattern: string): boolean {
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape special chars
    .replace(/\*/g, ".*"); // Convert * to .*
  const regex = new RegExp(`^${regexPattern}$`, "i");
  return regex.test(text);
}

/**
 * Simple encryption for clipboard history (AES-256)
 */
export function encrypt(text: string, key: string): string {
  const algorithm = "aes-256-cbc";
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, "hex"), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

/**
 * Simple decryption for clipboard history
 */
export function decrypt(encryptedText: string, key: string): string {
  const algorithm = "aes-256-cbc";
  const parts = encryptedText.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, "hex"), iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Get active application name (macOS)
 */
export async function getActiveAppName(): Promise<string> {
  if (process.platform !== "darwin") {
    return "Unknown";
  }

  try {
    // Use AppleScript to get active app
    const execAsync = promisify(exec);
    
    const { stdout } = await execAsync(
      'osascript -e \'tell application "System Events" to get name of first application process whose frontmost is true\''
    );
    return stdout.trim();
  } catch (error) {
    console.error("Error getting active app:", error);
    return "Unknown";
  }
}

/**
 * Check if app is in allowed/blocked list
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isAppAllowed(appName: string, config: any): boolean {
  const lowerName = appName.toLowerCase();
  
  // Check blocked apps first (most restrictive)
  for (const blocked of config.blockedApps || []) {
    if (lowerName.includes(blocked.toLowerCase())) {
      console.log(`   App "${appName}" matches blocked app pattern: "${blocked}"`);
      return false;
    }
  }
  
  // Check allowed apps (explicit allow)
  for (const allowed of config.allowedApps || []) {
    if (lowerName.includes(allowed.toLowerCase())) {
      console.log(`   App "${appName}" matches allowed app pattern: "${allowed}"`);
      return true;
    }
  }
  
  // Default behavior: if safe paste mode is OFF, allow everything
  // If safe paste mode is ON, block by default (unless explicitly allowed)
  const defaultAllow = !config.safePasteMode;
  console.log(`   App "${appName}" not in lists - default: ${defaultAllow ? "ALLOW" : "BLOCK"} (safe paste mode: ${config.safePasteMode ? "ON" : "OFF"})`);
  return defaultAllow;
}

