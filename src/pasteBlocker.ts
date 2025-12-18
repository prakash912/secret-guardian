import { clipboard, globalShortcut, BrowserWindow, Notification } from "electron";
import { getActiveAppName, isAppAllowed, redactSecret, matchesIgnorePattern } from "./utils";
import { getConfig } from "./config";
import { detectSecrets } from "./detectSecrets";

let currentSecret: string | null = null;
let allowPasteUntil = 0;
let blockedWindow: BrowserWindow | null = null;
let pasteInterceptRegistered = false;

/**
 * Check if we should block a paste operation
 */
export async function shouldBlockPaste(clipboardText: string): Promise<{
  shouldBlock: boolean;
  reason?: string;
  appName?: string;
}> {
  const config = getConfig();

  if (!config.safePasteMode) {
    return { shouldBlock: false };
  }

  // Check ignore patterns
  for (const pattern of config.ignorePatterns) {
    if (matchesIgnorePattern(clipboardText, pattern)) {
      return { shouldBlock: false };
    }
  }

  // Detect if it's a secret
  const detection = detectSecrets(clipboardText);
  if (!detection.detected) {
    return { shouldBlock: false };
  }

  // Check if paste is temporarily allowed
  if (Date.now() < allowPasteUntil) {
    return { shouldBlock: false };
  }

  // Get active app
  const appName = await getActiveAppName();

  // Check app rules
  const allowed = isAppAllowed(appName, config);

  if (!allowed) {
    currentSecret = clipboardText;
    return {
      shouldBlock: true,
      reason: `Pasting ${detection.type} into ${appName} is blocked`,
      appName,
    };
  }

  return { shouldBlock: false };
}

/**
 * Show paste blocking dialog
 */
let lastDialogTime = 0;
const DIALOG_COOLDOWN = 2000; // 2 seconds between dialogs

export function showPasteBlockDialog(
  secret: string,
  secretType: string,
  appName: string,
  onReveal: () => void,
  onRedact: () => void,
  onAllow: () => void
): void {
  // Prevent duplicate dialogs
  const now = Date.now();
  if (now - lastDialogTime < DIALOG_COOLDOWN) {
    console.log("Dialog cooldown active - skipping");
    return;
  }
  lastDialogTime = now;

  // Create a blocking window
  if (blockedWindow) {
    blockedWindow.close();
    blockedWindow = null;
  }

  console.log(`📱 Creating paste block dialog for ${secretType} in ${appName}`);

  blockedWindow = new BrowserWindow({
    width: 500,
    height: 350,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const redacted = redactSecret(secret);
  
  console.log(`📱 Showing paste block dialog for ${secretType} in ${appName}`);
  
  // Show window when ready
  blockedWindow.once("ready-to-show", () => {
    if (blockedWindow) {
      blockedWindow.show();
      blockedWindow.focus();
      blockedWindow.moveTop(); // Bring to front
      console.log("✅ Dialog window shown and focused");
    }
  });
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          margin: 0;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .container {
          text-align: center;
        }
        h2 { margin-top: 0; }
        .secret-preview {
          background: rgba(255,255,255,0.2);
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
          font-family: monospace;
          word-break: break-all;
        }
        .buttons {
          display: flex;
          gap: 10px;
          justify-content: center;
          margin-top: 20px;
        }
        button {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s;
        }
        button:hover {
          transform: scale(1.05);
        }
        .btn-reveal {
          background: #f59e0b;
          color: white;
        }
        .btn-redact {
          background: #10b981;
          color: white;
        }
        .btn-allow {
          background: #3b82f6;
          color: white;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🚨 Secret Detected - Paste Blocked</h2>
        <p><strong>${secretType}</strong> detected</p>
        <p>Pasting into <strong>${appName}</strong> is blocked</p>
        <div class="secret-preview">${redacted}</div>
        <div class="buttons">
          <button class="btn-reveal" onclick="window.reveal()">Reveal Once</button>
          <button class="btn-redact" onclick="window.redact()">Paste Redacted</button>
          <button class="btn-allow" onclick="window.allow()">Allow for 60s</button>
        </div>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        window.reveal = () => ipcRenderer.send('paste-action', 'reveal');
        window.redact = () => ipcRenderer.send('paste-action', 'redact');
        window.allow = () => ipcRenderer.send('paste-action', 'allow');
      </script>
    </body>
    </html>
  `;

  blockedWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // Handle window errors
  blockedWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    console.error(`❌ Dialog failed to load: ${errorCode} - ${errorDescription}`);
  });

  // Handle window close
  blockedWindow.on("closed", () => {
    blockedWindow = null;
    console.log("Dialog closed");
  });

  // Store callbacks for IPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (blockedWindow as any).pasteCallbacks = { onReveal, onRedact, onAllow };
}

/**
 * Allow paste temporarily
 */
export function allowPasteTemporarily(seconds = 60): void {
  allowPasteUntil = Date.now() + seconds * 1000;
  currentSecret = null;
}

/**
 * Check if paste is currently allowed (temporarily)
 */
export function isPasteAllowed(): boolean {
  return Date.now() < allowPasteUntil;
}

/**
 * Get redacted version of current secret
 */
export function getRedactedSecret(): string | null {
  if (!currentSecret) return null;
  return redactSecret(currentSecret);
}

/**
 * Clear current secret
 */
export function clearCurrentSecret(): void {
  currentSecret = null;
}

/**
 * Register global hotkey for redacted paste (⌥⌘V)
 */
export function registerRedactedPasteHotkey(): void {
  try {
    const success = globalShortcut.register("Alt+Command+V", () => {
      const redacted = getRedactedSecret();
      if (redacted) {
        clipboard.writeText(redacted);
      }
    });
    if (success) {
      console.log("✅ Redacted paste hotkey registered (Alt+Command+V)");
    } else {
      console.warn("⚠️ Failed to register redacted paste hotkey - may need Accessibility permissions");
    }
  } catch (error) {
    console.error("❌ Error registering redacted paste hotkey:", error);
  }
}

/**
 * Intercept Cmd+V to block dangerous pastes
 * Note: Electron's globalShortcut can't prevent paste, but we can detect it
 * and show a warning dialog, then offer recovery options
 */
export async function interceptPaste(): Promise<void> {
  console.log("🔍 Paste detected (Cmd+V pressed)");
  
  const config = getConfig();
  
  if (!config.safePasteMode) {
    console.log("Safe paste mode disabled - allowing paste");
    return; // Don't intercept
  }

  // Check if paste is temporarily allowed
  if (Date.now() < allowPasteUntil) {
    console.log("Paste temporarily allowed - letting through");
    return; // Allow paste
  }

  let clipboardText: string;
  try {
    clipboardText = clipboard.readText().trim();
  } catch (clipboardError) {
    console.log("Clipboard empty or inaccessible - allowing paste");
    return; // Clipboard empty, allow paste
  }
  console.log(`Clipboard content length: ${clipboardText.length}`);
  
  if (!clipboardText || clipboardText.length < 8) {
    console.log("Clipboard too short or empty - allowing paste");
    return; // Not a secret, allow paste
  }

  // Check ignore patterns
  for (const pattern of config.ignorePatterns) {
    if (matchesIgnorePattern(clipboardText, pattern)) {
      console.log(`Pattern ${pattern} matches - ignoring`);
      return; // Ignored pattern, allow paste
    }
  }

  // Detect if it's a secret
  const detection = detectSecrets(clipboardText);
  if (!detection.detected) {
    console.log("No secret detected - allowing paste");
    return; // Not a secret, allow paste
  }

  console.log(`✅ Secret detected: ${detection.type}`);

  // Get active app
  const appName = await getActiveAppName();
  console.log(`Active app: ${appName}`);
  
  // Check app rules
  const allowed = isAppAllowed(appName, config);

  if (allowed) {
    console.log(`App ${appName} is allowed - paste can proceed`);
    return; // App is allowed, let paste through
  }

  // BLOCK THE PASTE!
  currentSecret = clipboardText;
  
  console.log(`🚫 BLOCKING paste of ${detection.type} into ${appName}`);

  // Show blocking dialog immediately
  showPasteBlockDialog(
    clipboardText,
    detection.type,
    appName,
    () => {
      // Reveal once - allow this paste
      console.log("User chose: Reveal Once");
      allowPasteTemporarily(5);
      // Put original back in clipboard for next paste
      setTimeout(() => {
        clipboard.writeText(clipboardText);
      }, 100);
    },
    () => {
      // Redact and paste
      console.log("User chose: Paste Redacted");
      const redacted = redactSecret(clipboardText);
      clipboard.writeText(redacted);
      // Show notification that redacted version is ready
      if (Notification.isSupported()) {
        new Notification({
          title: "Redacted Version Ready",
          body: "Redacted secret is in clipboard. Paste again (Cmd+V) to use it."
        }).show();
      }
    },
    () => {
      // Allow for 60s
      console.log("User chose: Allow for 60s");
      allowPasteTemporarily(60);
      // Put original back in clipboard
      setTimeout(() => {
        clipboard.writeText(clipboardText);
      }, 100);
    }
  );
}

/**
 * Register paste interception
 * Note: This detects Cmd+V presses but can't prevent the actual paste
 * We show a blocking dialog and offer recovery options
 */
export function registerPasteInterception(): void {
  if (pasteInterceptRegistered) {
    console.log("Paste interception already registered");
    return;
  }
  
  // On macOS, we intercept Cmd+V
  if (process.platform === "darwin") {
    // Register Cmd+V interception
    const success = globalShortcut.register("Command+V", async () => {
      console.log("🔔 Cmd+V detected!");
      await interceptPaste();
    });

    if (success) {
      console.log("✅ Paste interception registered (Cmd+V)");
      pasteInterceptRegistered = true;
    } else {
      console.error("❌ Failed to register paste interception - may need Accessibility permissions");
      console.warn("⚠️ Please grant Accessibility permissions in System Settings");
    }
  }
  
  // Also register for Ctrl+V (Windows/Linux)
  const ctrlSuccess = globalShortcut.register("Control+V", async () => {
    console.log("🔔 Ctrl+V detected!");
    await interceptPaste();
  });
  
  if (ctrlSuccess) {
    console.log("✅ Paste interception registered (Ctrl+V)");
  }
}

/**
 * Unregister paste interception
 */
export function unregisterPasteInterception(): void {
  globalShortcut.unregister("Command+V");
  globalShortcut.unregister("Control+V");
  pasteInterceptRegistered = false;
}

/**
 * Cleanup blocking dialog window
 */
export function cleanupBlockingDialog(): void {
  if (blockedWindow) {
    try {
      blockedWindow.close();
      blockedWindow = null;
    } catch (error) {
      console.error("Error closing blocking dialog:", error);
    }
  }
}

