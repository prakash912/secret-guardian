import { clipboard, globalShortcut, BrowserWindow, Notification } from "electron";
import { exec } from "child_process";
import { getActiveAppName, isAppAllowed, redactSecret, matchesIgnorePattern, encryptForSharing, decryptShared } from "./utils";
import { getConfig } from "./config";
import { detectSecrets } from "./detectSecrets";

/**
 * Trigger paste in the currently focused application
 * Works for both Electron windows and native macOS apps
 */
async function triggerPaste(): Promise<void> {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  
  if (focusedWindow) {
    // Electron window - use webContents.paste()
    try {
      focusedWindow.webContents.paste();
      console.log("   ✅ Triggered paste in Electron window");
    } catch (error) {
      console.error("   ❌ Failed to paste in Electron window:", error);
    }
  } else {
    // Native macOS app - use AppleScript to trigger paste
    if (process.platform === "darwin") {
      try {
        // Use AppleScript to send Cmd+V to the frontmost application
        // Use a more reliable approach with delay
        const script = 'tell application "System Events" to keystroke "v" using command down';
        exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
          if (error) {
            console.error("   ❌ Failed to trigger paste via AppleScript:", error.message);
            console.error("   ⚠️  Make sure Secret Guardian has Accessibility permissions in System Settings");
          } else {
            console.log("   ✅ Triggered paste via AppleScript");
          }
        });
      } catch (error) {
        console.error("   ❌ Error executing AppleScript:", error);
      }
    } else {
      // For other platforms, try to find and focus an Electron window
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        try {
          windows[0].webContents.paste();
          console.log("   ✅ Triggered paste in Electron window (fallback)");
        } catch (error) {
          console.error("   ❌ Failed to paste in Electron window:", error);
        }
      }
    }
  }
}

let currentSecret: string | null = null;
let allowPasteUntil = 0;
let blockedWindow: BrowserWindow | null = null;
let pasteInterceptRegistered = false;
let isBlockingPaste = false; // Flag to prevent duplicate blocking from multiple systems
let lastBlockedPasteTime = 0;
const BLOCK_COOLDOWN = 1000; // 1 second cooldown between blocking attempts

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
 * SIMPLE & FAST: Check if we should block paste
 * Static logic: If it's a secret → block it (everywhere)
 * No app checks, no patterns - just secret detection
 */
function shouldBlockPasteSync(): {
  shouldBlock: boolean;
  detection?: { type: string };
  clipboardText?: string;
  appName?: string;
} {
  const config = getConfig();

  // Fast exit checks
  if (!config.safePasteMode) {
    return { shouldBlock: false };
  }

  if (Date.now() < allowPasteUntil) {
    return { shouldBlock: false };
  }

  // Read clipboard
  let clipboardText: string;
  try {
    clipboardText = clipboard.readText().trim();
  } catch {
    return { shouldBlock: false };
  }

  // Fast length check
  if (!clipboardText || clipboardText.length < 8) {
    return { shouldBlock: false };
  }

  // CRITICAL: NEVER block encrypted keys - they're safe
  if (clipboardText.startsWith("SG_ENCRYPTED:")) {
    return { shouldBlock: false };
  }

  // Detect if it's a secret
  const detection = detectSecrets(clipboardText);
  if (!detection.detected) {
    return { shouldBlock: false }; // Not a secret - allow
  }

  // STATIC: If it's a secret → always block (no app checks, no patterns)
  return {
    shouldBlock: true,
    detection,
    clipboardText,
    appName: "Unknown", // Not used for blocking decision
  };
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
  onAllow: () => void,
  onEncrypt?: () => void,
  onDecrypt?: (encryptedText: string) => void
): void {
  // Prevent duplicate dialogs (but allow if different secret)
  const now = Date.now();
  if (now - lastDialogTime < DIALOG_COOLDOWN && currentSecret === secret) {
    console.log("Dialog cooldown active - skipping duplicate");
    return;
  }
  
  // Prevent showing dialog if we're already blocking a paste
  if (isBlockingPaste && now - lastBlockedPasteTime < BLOCK_COOLDOWN) {
    console.log("Already blocking a paste - skipping duplicate dialog");
    return;
  }
  
  lastDialogTime = now;
  lastBlockedPasteTime = now;
  isBlockingPaste = true;

  // Ensure appName is valid (fallback to "Unknown" if empty)
  if (!appName || appName.trim().length === 0) {
    appName = "Unknown";
  }

  // Create a blocking window
  if (blockedWindow) {
    try {
      blockedWindow.close();
    } catch (error) {
      // Ignore errors when closing old window
    }
    blockedWindow = null;
  }

  console.log(`📱 Creating paste block dialog for ${secretType} in ${appName}`);

  blockedWindow = new BrowserWindow({
    width: 600,
    height: 500,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: true, // Show IMMEDIATELY - don't wait for ready-to-show
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false, // Don't throttle background
    },
  });

  const redacted = redactSecret(secret);
  
  // Focus and bring to front immediately
  if (blockedWindow) {
    blockedWindow.focus();
    blockedWindow.moveTop();
  }
  
  // Also handle ready-to-show as backup
  blockedWindow.once("ready-to-show", () => {
    if (blockedWindow) {
      blockedWindow.show();
      blockedWindow.focus();
      blockedWindow.moveTop();
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
          flex-wrap: wrap;
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
        .btn-encrypt {
          background: #8b5cf6;
          color: white;
        }
        .btn-decrypt {
          background: #ec4899;
          color: white;
        }
        .btn-close {
          background: rgba(255,255,255,0.2);
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
          <button class="btn-encrypt" onclick="window.encrypt()">Encrypt & Copy</button>
          <button class="btn-allow" onclick="window.allow()">Allow for 60s</button>
          <button class="btn-close" onclick="window.closeDialog()">Close</button>
        </div>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        window.encrypt = () => ipcRenderer.send('paste-action', 'encrypt');
        window.allow = () => ipcRenderer.send('paste-action', 'allow');
        window.closeDialog = () => ipcRenderer.send('close-blocking-dialog');
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
    isBlockingPaste = false; // Reset blocking flag when dialog closes
    console.log("Dialog closed");
  });

  // Store callbacks for IPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (blockedWindow as any).pasteCallbacks = { onAllow, onEncrypt };
}

/**
 * Show decrypt dialog - standalone dialog for decrypting encrypted secrets
 */
let decryptWindow: BrowserWindow | null = null;

export function showDecryptDialog(): void {
  // Close existing dialog if open
  if (decryptWindow) {
    decryptWindow.close();
    decryptWindow = null;
  }

  console.log("📱 Creating decrypt dialog");

  decryptWindow = new BrowserWindow({
    width: 550,
    height: 400,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // Allow paste to work in the dialog
      enableBlinkFeatures: "ClipboardRead",
    },
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
        .decrypt-section {
          margin: 20px 0;
          text-align: left;
        }
        .decrypt-input {
          width: 100%;
          padding: 12px;
          border: 2px solid rgba(255,255,255,0.3);
          border-radius: 6px;
          background: rgba(255,255,255,0.1);
          color: white;
          font-family: monospace;
          font-size: 12px;
          margin-top: 10px;
          box-sizing: border-box;
        }
        .decrypt-input::placeholder {
          color: rgba(255,255,255,0.6);
        }
        .decrypt-input:focus {
          outline: none;
          border-color: rgba(255,255,255,0.6);
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
        .btn-decrypt {
          background: #ec4899;
          color: white;
        }
        .btn-close {
          background: rgba(255,255,255,0.2);
          color: white;
        }
        .info {
          font-size: 12px;
          opacity: 0.8;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🔓 Decrypt Secret</h2>
        <p>Paste an encrypted secret to decrypt and copy</p>
        <div class="decrypt-section">
          <input type="text" id="decryptInput" class="decrypt-input" placeholder="Paste SG_ENCRYPTED:... here">
          <div class="info">Encrypted secrets start with "SG_ENCRYPTED:"</div>
        </div>
        <div class="buttons">
          <button class="btn-decrypt" onclick="window.decrypt()">Decrypt & Copy</button>
          <button class="btn-close" onclick="window.close()">Close</button>
        </div>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        const input = document.getElementById('decryptInput');
        
        window.decrypt = () => {
          const encryptedText = input.value.trim();
          if (encryptedText) {
            ipcRenderer.send('decrypt-action', encryptedText);
          } else {
            alert('Please paste encrypted text first');
          }
        };
        window.close = () => {
          ipcRenderer.send('close-decrypt-dialog');
        };
        
        // Enable paste in input field - allow default paste behavior
        input.addEventListener('paste', (e) => {
          // Allow default paste - don't prevent it
          console.log('Paste event in decrypt dialog - allowing');
        });
        
        // Also handle keyboard shortcuts - allow Cmd+V / Ctrl+V
        input.addEventListener('keydown', (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
            // Allow default paste behavior
            console.log('Paste shortcut in decrypt dialog - allowing');
            // Don't prevent default - let browser handle paste
          }
        });
        
        // Auto-focus input
        input.focus();
      </script>
    </body>
    </html>
  `;

  decryptWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  decryptWindow.once("ready-to-show", () => {
    if (decryptWindow) {
      decryptWindow.show();
      decryptWindow.focus();
      decryptWindow.moveTop();
      console.log("✅ Decrypt dialog shown");
    }
  });

  decryptWindow.on("closed", () => {
    decryptWindow = null;
    console.log("Decrypt dialog closed");
  });
}

/**
 * Close the paste blocking dialog
 */
export function closeBlockingDialog(): void {
  if (blockedWindow) {
    blockedWindow.close();
    blockedWindow = null;
    console.log("Blocking dialog closed by user");
  }
}

export function closeDecryptDialog(): void {
  if (decryptWindow) {
    decryptWindow.close();
    decryptWindow = null;
  }
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
  const config = getConfig();
  
  if (!config.safePasteMode) {
    return; // Don't intercept
  }

  // Check if paste is temporarily allowed
  if (Date.now() < allowPasteUntil) {
    return; // Allow paste
  }

  let clipboardText: string;
  try {
    clipboardText = clipboard.readText().trim();
  } catch (clipboardError) {
    return; // Clipboard empty, allow paste
  }
  
  if (!clipboardText || clipboardText.length < 8) {
    return; // Not a secret, allow paste
  }

  // Check ignore patterns
  for (const pattern of config.ignorePatterns) {
    if (matchesIgnorePattern(clipboardText, pattern)) {
      return; // Ignored pattern, allow paste
    }
  }

  // Detect if it's a secret
  const detection = detectSecrets(clipboardText);
  if (!detection.detected) {
    return; // Not a secret, allow paste
  }

  // Get active app
  const appName = await getActiveAppName();
  
  // Check app rules
  const allowed = isAppAllowed(appName, config);

  if (allowed) {
    return; // App is allowed, let paste through
  }

  // BLOCK THE PASTE!
  currentSecret = clipboardText;
  
  console.log(`🚫 Blocking paste: ${detection.type} in ${appName}`);

  // Show blocking dialog immediately
  showPasteBlockDialog(
    clipboardText,
    detection.type,
    appName,
    () => {
      // Reveal once - allow this paste
      allowPasteTemporarily(5);
      // Put original back in clipboard for next paste
      setTimeout(() => {
        clipboard.writeText(clipboardText);
      }, 100);
    },
    () => {
      // Redact and paste
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
      allowPasteTemporarily(60);
      // Put original back in clipboard
      setTimeout(() => {
        clipboard.writeText(clipboardText);
      }, 100);
    }
  );
}

/**
 * Register paste blocking for Cmd+V/Ctrl+V in blocked apps
 * This intercepts the shortcut and clears clipboard if secret detected
 */
export function registerPasteBlocking(): void {
  if (pasteInterceptRegistered) {
    console.log("Paste blocking already registered");
    return;
  }
  
  const config = getConfig();
  if (!config.safePasteMode) {
    console.log("Safe paste mode disabled - not registering paste blocking");
    return;
  }

  // Register Cmd+V for macOS - SIMPLE & FAST
  if (process.platform === "darwin") {
    const cmdSuccess = globalShortcut.register("Command+V", () => {
      // Allow paste in dialogs
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (focusedWindow && (focusedWindow === decryptWindow || blockedWindow)) {
        focusedWindow.webContents.paste();
        return;
      }
      
      // Prevent duplicate blocking
      const now = Date.now();
      if (isBlockingPaste && now - lastBlockedPasteTime < BLOCK_COOLDOWN) {
        return;
      }
      
      // SIMPLE CHECK: Is it a secret? Block it immediately
      const result = shouldBlockPasteSync();
      if (result.shouldBlock && result.clipboardText && result.detection) {
        isBlockingPaste = true;
        lastBlockedPasteTime = now;
        
        // Clear clipboard and show dialog IMMEDIATELY
        clipboard.clear();
        currentSecret = result.clipboardText;
        
        // Show dialog IMMEDIATELY - no waiting
        const clipboardText = result.clipboardText;
        showPasteBlockDialog(
          clipboardText,
          result.detection.type,
          "Unknown", // App name not needed for static blocking
          () => {
            allowPasteTemporarily(60);
            isBlockingPaste = false;
            setTimeout(() => clipboard.writeText(clipboardText), 100);
          },
          () => {
            clipboard.writeText(encryptForSharing(clipboardText));
            isBlockingPaste = false;
          }
        );
      }
    });
    if (cmdSuccess) {
      console.log("✅ Paste blocking registered (Cmd+V)");
      pasteInterceptRegistered = true;
    } else {
      console.warn("⚠️ Failed to register Cmd+V blocking - may need Accessibility permissions");
    }
  }
  
  // Register Ctrl+V for all platforms - SIMPLE & FAST
  const ctrlSuccess = globalShortcut.register("Control+V", () => {
    // Allow paste in dialogs
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow && (focusedWindow === decryptWindow || blockedWindow)) {
      focusedWindow.webContents.paste();
      return;
    }
    
    // Prevent duplicate blocking
    const now = Date.now();
    if (isBlockingPaste && now - lastBlockedPasteTime < BLOCK_COOLDOWN) {
      return;
    }
    
    // SIMPLE CHECK: Is it a secret? Block it immediately
    const result = shouldBlockPasteSync();
    if (result.shouldBlock && result.clipboardText && result.detection) {
      isBlockingPaste = true;
      lastBlockedPasteTime = now;
      
      // Clear clipboard and show dialog IMMEDIATELY
      clipboard.clear();
      currentSecret = result.clipboardText;
      
      // Show dialog IMMEDIATELY - no waiting
      showPasteBlockDialog(
        result.clipboardText,
        result.detection.type,
        "Unknown", // App name not needed for static blocking
          () => {
            allowPasteTemporarily(60);
            isBlockingPaste = false;
            if (result.clipboardText) {
              setTimeout(() => clipboard.writeText(result.clipboardText), 100);
            }
          },
          () => {
            if (result.clipboardText) {
              clipboard.writeText(encryptForSharing(result.clipboardText));
            }
            isBlockingPaste = false;
          }
      );
    }
  });
  if (ctrlSuccess) {
    console.log("✅ Paste blocking registered (Ctrl+V)");
    if (!pasteInterceptRegistered) {
      pasteInterceptRegistered = true;
    }
  } else {
    console.warn("⚠️ Failed to register Ctrl+V blocking - may need Accessibility permissions");
    // Try alternative registration
    try {
      const altSuccess = globalShortcut.register("Ctrl+V", async () => {
        // Check if a dialog is focused - if so, trigger paste programmatically
        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow && (focusedWindow === decryptWindow || focusedWindow === blockedWindow)) {
          console.log("🔍 Ctrl+V (alt) in dialog - triggering paste programmatically");
          // Trigger paste in the focused dialog
          focusedWindow.webContents.paste();
          return; // Don't block - paste already triggered
        }
        console.log("🔍 Ctrl+V (alt) detected - checking if paste should be blocked");
        await blockPasteIfNeeded();
      });
      if (altSuccess) {
        console.log("✅ Paste blocking registered (Ctrl+V - alternative)");
        pasteInterceptRegistered = true;
      }
    } catch (error) {
      console.error("❌ Failed to register Ctrl+V with alternative method:", error);
    }
  }
  
  // Also try Meta+V (Windows key + V on Windows/Linux)
  if (process.platform !== "darwin") {
    try {
      const metaSuccess = globalShortcut.register("Meta+V", async () => {
        console.log("🔍 Meta+V detected - checking if paste should be blocked");
        await blockPasteIfNeeded();
      });
      if (metaSuccess) {
        console.log("✅ Paste blocking registered (Meta+V)");
      }
    } catch (error) {
      // Meta+V might not be available on all systems
      console.log("ℹ️ Meta+V not available (this is normal)");
    }
  }
}

/**
 * Block paste if secret detected in blocked app
 * This is called from the globalShortcut handler
 */
// This function is no longer needed - blocking is handled directly in globalShortcut handlers
// Keeping for compatibility but it's not used
async function blockPasteIfNeeded(): Promise<void> {
  // Not used - blocking handled in globalShortcut handlers
}

/**
 * Register paste interception (legacy - kept for compatibility)
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
    await interceptPaste();
  });
  
  if (!ctrlSuccess) {
    console.warn("⚠️ Failed to register Ctrl+V interception");
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

