import { clipboard, globalShortcut, BrowserWindow, Notification } from "electron";
import { redactSecret, encryptForSharing } from "./utils";

// State variables
let currentSecret: string | null = null;
let allowPasteUntil = 0;
let blockedWindow: BrowserWindow | null = null;
let decryptWindow: BrowserWindow | null = null;
let userAllowedPasteFlag = false; // Flag to track if user clicked "Allow for 60s"
let autoClearTimer: NodeJS.Timeout | null = null; // Timer to auto-clear clipboard after 60s

/**
 * Set flag that user allowed paste (don't clear clipboard on close)
 */
export function setUserAllowedPasteFlag(value: boolean): void {
  userAllowedPasteFlag = value;
}

export function setCurrentSecret(secret: string): void {
  currentSecret = secret;
}

/**
 * Show secret detection dialog (shows on copy when Safe Copy Mode is ON)
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
  console.log(`📱 showPasteBlockDialog called: ${secretType}, secret length: ${secret.length}`);
  
  // Prevent duplicate dialogs (but allow if different secret)
  const now = Date.now();
  if (now - lastDialogTime < DIALOG_COOLDOWN && currentSecret === secret && blockedWindow) {
    console.log("   Dialog cooldown active - skipping duplicate");
    return;
  }
  
  // If a dialog window already exists, close it first
  if (blockedWindow) {
    try {
      blockedWindow.close();
    } catch (error) {
      // Ignore errors when closing old window
    }
    blockedWindow = null;
  }
  
  lastDialogTime = now;
  
  console.log("   Creating dialog window...");

  // Ensure appName is valid (fallback to "Unknown" if empty)
  if (!appName || appName.trim().length === 0) {
    appName = "Unknown";
  }

  // Prepare redacted secret for display (before creating window)
  const redacted = redactSecret(secret);

  console.log(`📱 Creating paste block dialog for ${secretType} in ${appName}`);

  try {
    blockedWindow = new BrowserWindow({
      width: 520,
      height: 500,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      show: true, // Show IMMEDIATELY - don't wait for ready-to-show
      modal: true, // Make it modal - blocks all background interaction
      backgroundColor: '#667eea', // Match gradient start color
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false, // Don't throttle background
      },
    });
    
    console.log("   Window created, focusing...");
    
    // Focus and bring to front immediately
    if (blockedWindow) {
      blockedWindow.focus();
      blockedWindow.moveTop();
      blockedWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      
      // Make sure it's on top and blocks all interaction
      blockedWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }
    
    // Also handle ready-to-show as backup
    blockedWindow.once("ready-to-show", () => {
      console.log("   Window ready-to-show event fired");
      if (blockedWindow) {
        blockedWindow.show();
        blockedWindow.focus();
        blockedWindow.moveTop();
      }
    });
    
    console.log("   Window setup complete");
  } catch (error) {
    console.error("❌ Error creating dialog window:", error);
    return;
  }
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * {
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          margin: 0;
          padding: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          overflow: hidden;
        }
        .container {
          width: 100%;
          padding: 30px 30px 15px 30px;
          text-align: center;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
        }
        .icon {
          font-size: 48px;
          margin-bottom: 16px;
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        h2 {
          margin: 0 0 12px 0;
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        .subtitle {
          margin: 0 0 8px 0;
          font-size: 16px;
          opacity: 0.95;
          font-weight: 500;
        }
        .secret-type {
          display: inline-block;
          background: rgba(255,255,255,0.25);
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          margin: 8px 0;
          backdrop-filter: blur(10px);
        }
        .description {
          margin: 16px 0 20px 0;
          font-size: 14px;
          opacity: 0.9;
          line-height: 1.5;
        }
        .secret-preview {
          background: rgba(0,0,0,0.3);
          padding: 16px;
          border-radius: 12px;
          margin: 20px 0;
          font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
          font-size: 13px;
          word-break: break-all;
          line-height: 1.6;
          border: 1px solid rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          max-height: 140px;
          overflow-y: auto;
          flex-shrink: 1;
        }
        .secret-preview::-webkit-scrollbar {
          width: 6px;
        }
        .secret-preview::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.1);
          border-radius: 3px;
        }
        .secret-preview::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.3);
          border-radius: 3px;
        }
        .secret-preview::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.5);
        }
        .buttons {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 20px;
          margin-bottom: 0;
          flex-shrink: 0;
        }
        button {
          padding: 14px 24px;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          position: relative;
          overflow: hidden;
        }
        button::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255,255,255,0.3);
          transform: translate(-50%, -50%);
          transition: width 0.6s, height 0.6s;
        }
        button:hover::before {
          width: 300px;
          height: 300px;
        }
        button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.25);
        }
        button:active {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .btn-encrypt {
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          color: white;
        }
        .btn-encrypt:hover {
          background: linear-gradient(135deg, #9d6af7 0%, #8d4ef0 100%);
        }
        .btn-allow {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
        }
        .btn-allow:hover {
          background: linear-gradient(135deg, #4c91f7 0%, #3574ec 100%);
        }
        .btn-close {
          background: rgba(255,255,255,0.15);
          color: white;
          border: 1px solid rgba(255,255,255,0.2);
        }
        .btn-close:hover {
          background: rgba(255,255,255,0.25);
        }
        .button-text {
          position: relative;
          z-index: 1;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">🚨</div>
        <h2>Secret Detected</h2>
        <p class="subtitle">Security Alert</p>
        <div class="secret-type">${secretType}</div>
        <p class="description">You just copied a sensitive secret. Choose an action to protect it:</p>
        <div class="secret-preview">${redacted}</div>
        <div class="buttons">
          <button class="btn-encrypt" onclick="window.encrypt()">
            <span class="button-text">🔒 Encrypt & Copy</span>
          </button>
          <button class="btn-allow" onclick="window.allow()">
            <span class="button-text">⏱️ Allow for 60s</span>
          </button>
          <button class="btn-close" onclick="window.closeDialog()">
            <span class="button-text">Close</span>
          </button>
        </div>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        window.encrypt = () => ipcRenderer.send('paste-action', 'encrypt');
        window.allow = () => ipcRenderer.send('paste-action', 'allow');
        window.closeDialog = () => ipcRenderer.send('close-blocking-dialog');
        
        // Auto-resize window to fit content
        window.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => {
            const container = document.querySelector('.container');
            if (container) {
              const height = container.scrollHeight + 5; // Minimal padding
              ipcRenderer.send('resize-dialog', 'blocking', Math.max(400, Math.min(height, 700))); // Min 400px, max 700px
            }
          }, 100);
        });
      </script>
    </body>
    </html>
  `;

  // Load HTML content
  try {
    const htmlUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    console.log("   Loading HTML content...");
    blockedWindow.loadURL(htmlUrl);
    console.log("   HTML content loaded");
  } catch (error) {
    console.error("❌ Error loading HTML:", error);
  }

  // Handle window errors
  blockedWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    console.error(`❌ Dialog failed to load: ${errorCode} - ${errorDescription}`);
  });

  // Handle successful load
  blockedWindow.webContents.on("did-finish-load", () => {
    console.log("✅ Dialog HTML loaded successfully");
    if (blockedWindow) {
      blockedWindow.show();
      blockedWindow.focus();
      blockedWindow.moveTop();
    }
  });

  // Reset flag when creating new dialog
  userAllowedPasteFlag = false;
  
  // Handle window close
  blockedWindow.on("closed", () => {
    blockedWindow = null;
    
    // CRITICAL: Clear clipboard when dialog closes UNLESS user clicked "Allow for 60s"
    // This ensures secret is cleared whether copied from keyboard or mouse
    // Once cleared, NO ONE can paste it (neither keyboard Cmd+V/Ctrl+V nor mouse paste)
    if (!userAllowedPasteFlag) {
      try {
        // Clear clipboard immediately
        clipboard.clear();
        console.log("✅ Clipboard cleared when dialog closed - secret removed from everywhere");
        
        // Clear multiple times to ensure it's completely cleared (defense in depth)
        setTimeout(() => {
          try {
            clipboard.clear();
            console.log("✅ Clipboard cleared again (double-check)");
          } catch (e) {
            // Ignore
          }
        }, 50);
        
        // Final clear after a short delay to catch any edge cases
        setTimeout(() => {
          try {
            clipboard.clear();
            console.log("✅ Clipboard cleared final time (triple-check)");
          } catch (e) {
            // Ignore
          }
        }, 200);
      } catch (error) {
        console.error("Error clearing clipboard:", error);
      }
    } else {
      console.log("ℹ️ Clipboard NOT cleared - user allowed paste for 60s (will auto-clear after 60s)");
      userAllowedPasteFlag = false; // Reset flag (but allowPasteUntil is still active for auto-clear)
    }
    
    // Don't clear currentSecret if paste is allowed - user might need it
    if (!isPasteAllowed()) {
      currentSecret = null; // Only clear if paste is not allowed
    }
    console.log(`Dialog closed - paste allowed: ${isPasteAllowed()}, time remaining: ${Math.max(0, Math.floor((allowPasteUntil - Date.now()) / 1000))}s`);
  });
  
  console.log("✅ Dialog setup complete - should be visible");
}

/**
 * Show decrypt dialog - standalone dialog for decrypting encrypted secrets
 */
export function showDecryptDialog(): void {
  // Close existing dialog if open
  if (decryptWindow) {
    decryptWindow.close();
    decryptWindow = null;
  }

  console.log("📱 Creating decrypt dialog");

  decryptWindow = new BrowserWindow({
    width: 500,
    height: 450,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#667eea', // Match gradient start color
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableBlinkFeatures: "ClipboardRead",
    },
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * {
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          margin: 0;
          padding: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          overflow: hidden;
        }
        .container {
          width: 100%;
          padding: 30px 30px 15px 30px;
          text-align: center;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
        }
        .icon {
          font-size: 48px;
          margin-bottom: 16px;
          flex-shrink: 0;
        }
        h2 {
          margin: 0 0 12px 0;
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.5px;
          flex-shrink: 0;
        }
        .subtitle {
          margin: 0 0 16px 0;
          font-size: 15px;
          opacity: 0.9;
          line-height: 1.5;
          flex-shrink: 0;
        }
        .decrypt-section {
          margin: 16px 0;
          text-align: left;
          flex-shrink: 0;
        }
        .decrypt-input {
          width: 100%;
          padding: 14px 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-radius: 10px;
          background: rgba(0,0,0,0.2);
          color: white;
          font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
          font-size: 13px;
          margin-top: 10px;
          box-sizing: border-box;
          transition: all 0.2s ease;
          backdrop-filter: blur(10px);
        }
        .decrypt-input::placeholder {
          color: rgba(255,255,255,0.5);
        }
        .decrypt-input:focus {
          outline: none;
          border-color: rgba(255,255,255,0.6);
          background: rgba(0,0,0,0.3);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.1);
        }
        .info {
          font-size: 12px;
          opacity: 0.8;
          margin-top: 10px;
          padding-left: 4px;
        }
        .buttons {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 16px;
          flex-shrink: 0;
        }
        button {
          padding: 14px 24px;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          position: relative;
          overflow: hidden;
        }
        button::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255,255,255,0.3);
          transform: translate(-50%, -50%);
          transition: width 0.6s, height 0.6s;
        }
        button:hover::before {
          width: 300px;
          height: 300px;
        }
        button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.25);
        }
        button:active {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .btn-decrypt {
          background: linear-gradient(135deg, #ec4899 0%, #db2777 100%);
          color: white;
        }
        .btn-decrypt:hover {
          background: linear-gradient(135deg, #f05aa8 0%, #e43888 100%);
        }
        .btn-close {
          background: rgba(255,255,255,0.15);
          color: white;
          border: 1px solid rgba(255,255,255,0.2);
        }
        .btn-close:hover {
          background: rgba(255,255,255,0.25);
        }
        .button-text {
          position: relative;
          z-index: 1;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">🔓</div>
        <h2>Decrypt Secret</h2>
        <p class="subtitle">Paste an encrypted secret to decrypt and copy</p>
        <div class="decrypt-section">
          <input type="text" id="decryptInput" class="decrypt-input" placeholder="Paste SG_ENCRYPTED:... here">
          <div class="info">Encrypted secrets start with "SG_ENCRYPTED:"</div>
        </div>
        <div class="buttons">
          <button class="btn-decrypt" onclick="window.decrypt()">
            <span class="button-text">🔓 Decrypt & Copy</span>
          </button>
          <button class="btn-close" onclick="window.close()">
            <span class="button-text">Close</span>
          </button>
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
        
        // Enable paste in input field
        input.addEventListener('paste', (e) => {
          console.log('Paste event in decrypt dialog - allowing');
        });
        
        input.addEventListener('keydown', (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
            console.log('Paste shortcut in decrypt dialog - allowing');
          }
        });
        
        input.focus();
        
        // Auto-resize window to fit content
        window.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => {
            const container = document.querySelector('.container');
            if (container) {
              const height = container.scrollHeight + 5; // Minimal padding
              ipcRenderer.send('resize-dialog', 'decrypt', Math.max(400, Math.min(height, 650))); // Min 400px, max 650px
            }
          }, 100);
        });
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
    // Ensure clipboard is cleared when closing (unless user allowed for 60s)
    if (!userAllowedPasteFlag) {
      try {
        clipboard.clear();
        console.log("✅ Clipboard cleared immediately before closing dialog");
      } catch (error) {
        console.error("Error clearing clipboard:", error);
      }
    }
    
    blockedWindow.close();
    console.log("Blocking dialog closing");
  }
}

export function closeDecryptDialog(): void {
  if (decryptWindow) {
    decryptWindow.close();
    decryptWindow = null;
  }
}

/**
 * Allow paste temporarily - keeps secret in clipboard for specified seconds, then auto-clears
 */
export function allowPasteTemporarily(seconds = 60): void {
  allowPasteUntil = Date.now() + seconds * 1000;
  userAllowedPasteFlag = true; // Set flag so clipboard won't be cleared on dialog close
  
  // Clear any existing timer
  if (autoClearTimer) {
    clearTimeout(autoClearTimer);
  }
  
  // Set timer to auto-clear clipboard after the specified time
  autoClearTimer = setTimeout(() => {
    try {
      clipboard.clear();
      console.log(`✅ Clipboard auto-cleared after ${seconds} seconds - secret removed from everywhere`);
      
      // Clear multiple times to ensure it's completely cleared
      setTimeout(() => {
        try {
          clipboard.clear();
          console.log("✅ Clipboard cleared again (double-check)");
        } catch (e) {
          // Ignore
        }
      }, 50);
      
      setTimeout(() => {
        try {
          clipboard.clear();
          console.log("✅ Clipboard cleared final time (triple-check)");
        } catch (e) {
          // Ignore
        }
      }, 200);
      
      // Reset flags
      userAllowedPasteFlag = false;
      allowPasteUntil = 0;
      currentSecret = null;
      
      // Show notification
      if (Notification.isSupported()) {
        new Notification({
          title: "🔒 Secret Auto-Cleared",
          body: "The secret has been automatically cleared from clipboard after 60 seconds"
        }).show();
      }
    } catch (error) {
      console.error("❌ Error auto-clearing clipboard:", error);
    }
    
    autoClearTimer = null;
  }, seconds * 1000);
  
  console.log(`⏰ Auto-clear timer set for ${seconds} seconds`);
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
 * Register paste blocking - REMOVED
 * Paste blocking is no longer needed - popup shows on copy when Safe Copy Mode is ON, clipboard auto-clears after 60s if allowed
 */
export function registerPasteBlocking(): void {
  console.log("ℹ️ Paste blocking disabled - popup shows on copy (Safe Copy Mode), clipboard auto-clears after 60s if allowed");
}

/**
 * Register paste interception - REMOVED
 */
export function registerPasteInterception(): void {
  console.log("ℹ️ Paste interception disabled - popup shows on copy");
}

/**
 * Unregister paste interception - REMOVED
 */
export function unregisterPasteInterception(): void {
  // No longer intercepting paste
}

/**
 * Intercept paste - REMOVED
 */
export async function interceptPaste(): Promise<void> {
  return;
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

/**
 * Get blocking window instance (for resizing)
 */
export function getBlockingWindow(): BrowserWindow | null {
  return blockedWindow;
}

/**
 * Get decrypt window instance (for resizing)
 */
export function getDecryptWindow(): BrowserWindow | null {
  return decryptWindow;
}
