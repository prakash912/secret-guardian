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
 * Encrypt secret for sharing (creates a shareable encrypted format)
 * Format: SG_ENCRYPTED:base64(iv:encrypted)
 */
export function encryptForSharing(text: string): string {
  const algorithm = "aes-256-cbc";
  // Use a fixed key derived from app name for sharing (users can decrypt in allowed apps)
  const key = crypto
    .createHash("sha256")
    .update("SecretGuardian-Shared-Key-v1")
    .digest("hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, "hex"), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const combined = iv.toString("hex") + ":" + encrypted;
  return "SG_ENCRYPTED:" + Buffer.from(combined).toString("base64");
}

/**
 * Decrypt shared secret (detects SG_ENCRYPTED format)
 */
export function decryptShared(encryptedText: string): string | null {
  if (!encryptedText.startsWith("SG_ENCRYPTED:")) {
    return null; // Not a shared encrypted secret
  }
  
  try {
    const algorithm = "aes-256-cbc";
    const key = crypto
      .createHash("sha256")
      .update("SecretGuardian-Shared-Key-v1")
      .digest("hex");
    const base64Data = encryptedText.replace("SG_ENCRYPTED:", "");
    const combined = Buffer.from(base64Data, "base64").toString("utf8");
    const parts = combined.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, "hex"), iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Error decrypting shared secret:", error);
    return null;
  }
}

/**
 * Check if text is an encrypted shared secret
 */
export function isEncryptedShared(text: string): boolean {
  return text.startsWith("SG_ENCRYPTED:");
}

// Cache for active app name to avoid spawning too many processes
let cachedAppName: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 150; // Cache for 150ms to reduce process spawning

/**
 * Get active application name (macOS)
 * Uses caching and retry logic to prevent EAGAIN errors
 * Has fallback methods if primary method fails
 */
export async function getActiveAppName(): Promise<string> {
  if (process.platform !== "darwin") {
    return "Unknown";
  }

  // Return cached value if still valid
  const now = Date.now();
  if (cachedAppName !== null && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedAppName;
  }

  const execAsync = promisify(exec);
  
  // Method 1: Try System Events (primary method)
  const command1 = 'osascript -e \'tell application "System Events" to get name of first application process whose frontmost is true\'';
  
  // Method 2: Alternative using NSWorkspace (fallback)
  const command2 = 'osascript -e \'tell application "System Events" to name of first process whose frontmost is true\'';
  
  // Method 3: Using NSRunningApplication (another fallback)
  const command3 = 'osascript -e \'tell application "System Events" to get name of (first process whose frontmost is true)\'';
  
  const commands = [command1, command2, command3];
  
  // Retry logic for EAGAIN errors and try fallback methods
  const maxRetries = 2; // Reduced retries per method
  const baseDelay = 10;
  
  for (const command of commands) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { stdout } = await execAsync(command);
        const appName = stdout.trim();
        
        // Validate we got a real app name
        if (appName && appName.length > 0 && appName !== "missing value") {
          // Update cache
          cachedAppName = appName;
          cacheTimestamp = now;
          return appName;
        }
      } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        
        // Check if it's an EAGAIN error (resource temporarily unavailable)
        const isEagain = err?.code === 'EAGAIN' || err?.errno === -35;
        
        // Check if it's error -1728 (can't get frontmost app - permission or timing issue)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errorMessage = (err as any)?.stderr || '';
        const isPermissionError = err?.code === '1' && 
          (errorMessage.includes('-1728') || errorMessage.includes('Can\'t get'));
        
        if (isEagain && attempt < maxRetries - 1) {
          // Exponential backoff: 10ms, 20ms
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Retry same command
        }
        
        // If permission error (-1728), try next command immediately
        if (isPermissionError) {
          break; // Try next command
        }
        
        // For other errors, try next command
        if (!isEagain) {
          break; // Try next command
        }
      }
    }
  }
  
  // If we have a cached value, return it even if stale (better than "Unknown")
  if (cachedAppName !== null) {
    return cachedAppName;
  }
  
  // Don't log errors - they're expected when permissions aren't granted or during app switching
  // The app will still work with "Unknown" as the app name
  // lastError is intentionally not used - we silently fail and return "Unknown"
  return "Unknown";
}

// Track last logged app to avoid spam
let lastLoggedApp: string | null = null;
let lastLoggedResult: boolean | null = null;

/**
 * Check if app is in allowed/blocked list
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isAppAllowed(appName: string, config: any): boolean {
  const lowerName = appName.toLowerCase();
  
  // Check blocked apps first (most restrictive)
  for (const blocked of config.blockedApps || []) {
    if (lowerName.includes(blocked.toLowerCase())) {
      return false;
    }
  }
  
  // Check allowed apps (explicit allow)
  for (const allowed of config.allowedApps || []) {
    if (lowerName.includes(allowed.toLowerCase())) {
      return true;
    }
  }
  
  // Default behavior: if safe paste mode is OFF, allow everything
  // If safe paste mode is ON, block by default (unless explicitly allowed)
  const defaultAllow = !config.safePasteMode;
  // Only log when app or result changes (to help with debugging)
  if (lastLoggedApp !== appName || lastLoggedResult !== defaultAllow) {
    // Only log if it's a blocked app (more important to know)
    if (!defaultAllow) {
      console.log(`   App "${appName}" not in lists - default: BLOCK (safe paste mode: ON)`);
    }
    lastLoggedApp = appName;
    lastLoggedResult = defaultAllow;
  }
  return defaultAllow;
}

