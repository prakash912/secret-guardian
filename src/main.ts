import { app, Tray, Menu, clipboard, Notification, ipcMain, globalShortcut } from "electron";
import path from "path";
import fs from "fs";
import { detectSecrets } from "./detectSecrets";
import { getConfig, updateConfig, AVAILABLE_APPS, AVAILABLE_PATTERNS } from "./config";
import { addToHistory, getHistory, clearHistory, getPreviousSafeItem } from "./clipboardHistory";
import { showPasteBlockDialog, allowPasteTemporarily, clearCurrentSecret, registerRedactedPasteHotkey, unregisterPasteInterception, cleanupBlockingDialog, registerPasteBlocking, showDecryptDialog, closeDecryptDialog, closeBlockingDialog, getIsBlockingPaste, getLastBlockedPasteTime, setCurrentSecret } from "./pasteBlocker";
import { redactSecret, encryptForSharing, decryptShared, isEncryptedShared, getActiveAppName } from "./utils";

app.setAppUserModelId("com.secretguardian.app");
app.setName("Secret Guardian");

let tray: Tray | null = null;
let lastText = "";
let currentSecret: string | null = null;
let autoClearTimer: NodeJS.Timeout | null = null;
let clipboardMonitorStarted = false;
// COPY_DETECTION_DELAY removed - using clipboardChanged check instead

// Monitor clipboard for paste blocking
let pasteMonitorInterval: NodeJS.Timeout | null = null;

function updateTrayMenu() {
  try {
    const config = getConfig();
    const history = getHistory();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const menuItems: any[] = [
      { label: "🛡️ Secret Guardian", enabled: false },
      { type: "separator" },
      {
        label: config.safePasteMode ? "✓ Safe Paste Mode: ON" : "Safe Paste Mode: OFF",
      click: () => {
        updateConfig({ safePasteMode: !config.safePasteMode });
        updateTrayMenu();
      }
    },
    { type: "separator" },
    {
      label: "Recovery Actions",
      submenu: currentSecret ? [
        {
          label: "Clear Clipboard",
          click: () => {
            clipboard.clear();
            clearCurrentSecret();
            currentSecret = null;
            updateTrayMenu();
          }
        },
        {
          label: "Copy Redacted Version",
          click: () => {
            if (currentSecret) {
              clipboard.writeText(redactSecret(currentSecret));
            }
          }
        },
        {
          label: "Copy Previous Safe Item",
          click: () => {
            const safeItem = getPreviousSafeItem();
            if (safeItem) {
              clipboard.writeText(safeItem.content);
            }
          }
        },
        { type: "separator" },
        {
          label: "Allow Paste for 60s",
          click: () => {
            allowPasteTemporarily(60);
            updateTrayMenu();
          }
        }
      ] : [
        { label: "No secret detected", enabled: false }
      ]
    },
    { type: "separator" },
    {
      label: "Clipboard History",
      submenu: history.length > 0 ? [
        ...history.slice(0, 5).map((item) => ({
          label: `${item.isSecret ? "🔒" : "📋"} ${item.redacted || item.content.substring(0, 30)}...`,
          click: () => {
            clipboard.writeText(item.content);
          }
        })),
        { type: "separator" },
        {
          label: "Clear History",
          click: () => {
            clearHistory();
            updateTrayMenu();
          }
        }
      ] : [
        { label: "No history", enabled: false }
      ]
    },
    { type: "separator" },
    {
      label: "Allowed Apps",
      submenu: [
        // Show currently allowed apps with checkmark (click to remove)
        ...config.allowedApps.map((app) => ({
          label: `✓ ${app}`,
          click: () => {
            const updated = config.allowedApps.filter((a) => a !== app);
            updateConfig({ allowedApps: updated });
            updateTrayMenu();
            console.log(`Removed "${app}" from allowed apps`);
          }
        })),
        ...(config.allowedApps.length > 0 ? [{ type: "separator" }] : []),
        // Show ALL available apps at bottom (including removed ones) - click to add
        { label: "─ Available Apps ─", enabled: false },
        ...AVAILABLE_APPS
          .filter((app) => !config.allowedApps.includes(app))
          .map((app) => ({
            label: `○ ${app}${config.blockedApps.includes(app) ? " (blocked)" : ""}`,
            click: () => {
              // Remove from blocked if it's there, add to allowed
              const updatedBlocked = config.blockedApps.filter((a) => a !== app);
              const updatedAllowed = [...config.allowedApps, app];
              updateConfig({ allowedApps: updatedAllowed, blockedApps: updatedBlocked });
              updateTrayMenu();
              console.log(`Added "${app}" to allowed apps`);
            }
          })),
        { type: "separator" },
        { label: `Selected: ${config.allowedApps.length}`, enabled: false }
      ]
    },
    {
      label: "Blocked Apps",
      submenu: [
        // Show currently blocked apps with X (click to remove)
        ...config.blockedApps.map((app) => ({
          label: `✗ ${app}`,
          click: () => {
            const updated = config.blockedApps.filter((a) => a !== app);
            updateConfig({ blockedApps: updated });
            updateTrayMenu();
            console.log(`Removed "${app}" from blocked apps`);
          }
        })),
        ...(config.blockedApps.length > 0 ? [{ type: "separator" }] : []),
        // Show ALL available apps at bottom (including removed ones) - click to add
        { label: "─ Available Apps ─", enabled: false },
        ...AVAILABLE_APPS
          .filter((app) => !config.blockedApps.includes(app))
          .map((app) => ({
            label: `○ ${app}${config.allowedApps.includes(app) ? " (allowed)" : ""}`,
            click: () => {
              // Remove from allowed if it's there, add to blocked
              const updatedAllowed = config.allowedApps.filter((a) => a !== app);
              const updatedBlocked = [...config.blockedApps, app];
              updateConfig({ allowedApps: updatedAllowed, blockedApps: updatedBlocked });
              updateTrayMenu();
              console.log(`Added "${app}" to blocked apps`);
            }
          })),
        { type: "separator" },
        { label: `Selected: ${config.blockedApps.length}`, enabled: false }
      ]
    },
    {
      label: "Ignore Patterns",
      submenu: [
        // Show currently selected patterns (click to remove)
        ...config.ignorePatterns.map((pattern) => ({
          label: `⊘ ${pattern}`,
          click: () => {
            const updated = config.ignorePatterns.filter((p) => p !== pattern);
            updateConfig({ ignorePatterns: updated });
            updateTrayMenu();
            console.log(`Removed pattern "${pattern}"`);
          }
        })),
        ...(config.ignorePatterns.length > 0 ? [{ type: "separator" }] : []),
        // Show ALL available patterns at bottom (including removed ones) - click to add
        { label: "─ Available Patterns ─", enabled: false },
        ...AVAILABLE_PATTERNS
          .filter((pattern) => !config.ignorePatterns.includes(pattern))
          .map((pattern) => ({
            label: `○ ${pattern}`,
            click: () => {
              const updated = [...config.ignorePatterns, pattern];
              updateConfig({ ignorePatterns: updated });
              updateTrayMenu();
              console.log(`Added pattern "${pattern}"`);
            }
          })),
        { type: "separator" },
        { label: `Selected: ${config.ignorePatterns.length}`, enabled: false }
      ]
    },
    { type: "separator" },
    {
      label: "🔓 Decrypt Secret",
      click: () => {
        console.log("Opening decrypt dialog from menu");
        showDecryptDialog();
      }
    },
    { type: "separator" },
    {
      label: "Test Notification",
      click: () => {
        if (Notification.isSupported()) {
          new Notification({
            title: "🧪 Test Notification",
            body: "If you see this, notifications are working!"
          }).show();
        }
      }
    },
    {
      label: "Test Blocking Dialog",
      click: async () => {
        const testSecret = "AKIAIOSFODNN7EXAMPLE";
        const appName = "Unknown"; // Static blocking - app name not needed
        console.log("🧪 Testing blocking dialog...");
        currentSecret = testSecret;
        showPasteBlockDialog(
          testSecret,
          "AWS Access Key ID (Test)",
          appName,
          () => console.log("Test: Reveal"),
          () => console.log("Test: Redact"),
          () => console.log("Test: Allow")
        );
      }
    },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ];
    
    const menu = Menu.buildFromTemplate(menuItems);
    
    if (tray) {
      tray.setContextMenu(menu);
    } else {
      console.warn("⚠️ Tray not initialized yet");
    }
  } catch (error) {
    console.error("❌ Error updating tray menu:", error);
    // Fallback to simple menu
    if (tray) {
      const fallbackMenu = Menu.buildFromTemplate([
        { label: "Secret Guardian", enabled: false },
        { type: "separator" },
        { label: "Error loading menu", enabled: false },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() }
      ]);
      tray.setContextMenu(fallbackMenu);
    }
  }
}

// Removed showRecoveryNotification - no warnings on copy, only on paste

// Clipboard monitoring - only tracks secrets for history, NO dialogs on copy
// Dialogs only appear when user actually pastes (Control+V/Cmd+V) in blocked apps
function startPasteMonitoring() {
  if (pasteMonitorInterval) return;

  // Starting clipboard monitoring
  
  // Initialize with current clipboard to avoid false positives on startup
  let lastClipboardText = "";
  let lastAppName = "";
  let clipboardHasSecret = false;
  
  // Initialize last app name
  getActiveAppName()
    .then((appName) => {
      lastAppName = appName;
    })
    .catch(() => {
      lastAppName = "Unknown";
    });
  
  try {
    const initialClipboard = clipboard.readText().trim();
    if (initialClipboard) {
      lastClipboardText = initialClipboard;
      // Check if initial clipboard has a secret
      if (initialClipboard.length >= 8 && !initialClipboard.startsWith("SG_ENCRYPTED:")) {
        const detection = detectSecrets(initialClipboard);
        clipboardHasSecret = detection.detected;
      }
    }
  } catch (error) {
    // Clipboard might be empty - that's fine
  }
  
  let pasteMonitorStarted = false;
  
  // Delay paste monitoring to avoid false positives
  setTimeout(() => {
    pasteMonitorStarted = true;
    console.log("✅ Clipboard monitoring active (mouse paste blocking enabled)");
  }, 2000);
  
  // Track when secret was copied to clipboard
  let secretCopiedTime = 0;
  let secretContent = "";
  
  pasteMonitorInterval = setInterval(async () => {
    // Don't monitor until startup delay has passed
    if (!pasteMonitorStarted) {
      return;
    }
    
    try {
      let text: string;
      try {
        text = clipboard.readText().trim();
      } catch (clipboardError) {
        // Clipboard might be empty or inaccessible
        return;
      }
      
      const config = getConfig();
      if (!config.safePasteMode) {
        lastClipboardText = text;
        return;
      }

      // Only trigger if clipboard actually changed (not just checking the same content)
      const clipboardChanged = text !== lastClipboardText && text.length > 0;
      
      // CRITICAL: COPY DETECTION - Check FIRST before ANY other processing
      // If clipboard changed, it's ALWAYS a COPY - return immediately, NO dialogs, NO blocking
      if (clipboardChanged) {
        // Update tracking immediately
        lastClipboardText = text;
        clipboardHasSecret = false;
        secretCopiedTime = 0;
        secretContent = "";
        
        // This is a COPY operation - just track in history silently, NO dialog, NO blocking
        if (text && text.length >= 8) {
          // Check if it's a secret for history tracking only
          if (!isEncryptedShared(text)) {
            const detection = detectSecrets(text);
            if (detection.detected) {
              clipboardHasSecret = true;
              secretCopiedTime = Date.now();
              secretContent = text;
              // Track in history silently - NO dialog, NO blocking
              addToHistory(text, true, detection.type, "Unknown");
              updateTrayMenu();
            } else {
              addToHistory(text, false, undefined, "Unknown");
            }
          } else {
            // Encrypted - track silently
            addToHistory(text, true, "Encrypted Secret", "Unknown");
          }
        }
        
        // Update last app name when clipboard changes (copy happened in this app)
        getActiveAppName()
          .then((appName) => {
            lastAppName = appName;
          })
          .catch(() => {
            lastAppName = "Unknown";
          });
        
        return; // Exit immediately - NEVER show dialog on COPY
      }
      
      // MOUSE PASTE DETECTION: Immediate blocking for secrets
      // Strategy: After a very short delay (50ms) from copy, if clipboard still has secret,
      // aggressively monitor and block any paste attempt by clearing clipboard immediately
      if (!text || text.length < 8) {
        return;
      }

      // CRITICAL: Check encrypted keys FIRST - they should NEVER be blocked
      if (isEncryptedShared(text)) {
        addToHistory(text, true, "Encrypted Secret", "Unknown");
        return; // Exit early - never block encrypted keys
      }

      // Check if clipboard still has the same secret content
      if (text !== lastClipboardText || text !== secretContent) {
        return; // Content changed, not a paste
      }

      // Check if we have a secret in clipboard
      if (!clipboardHasSecret || !secretContent || secretCopiedTime === 0) {
        // Re-check if it's a secret (in case clipboard was set before monitoring started)
        const detection = detectSecrets(text);
        if (!detection.detected) {
          return; // Not a secret
        }
        clipboardHasSecret = true;
        secretContent = text;
        secretCopiedTime = Date.now();
      }

      // IMMEDIATE MOUSE PASTE BLOCKING:
      // After 50ms from copy, if clipboard still has secret, clear it immediately
      // This prevents paste from working - when user tries to paste, clipboard will be empty
      const timeSinceCopy = Date.now() - secretCopiedTime;
      const PASTE_PROTECTION_DELAY = 50; // Very short delay - 50ms after copy

      if (timeSinceCopy > PASTE_PROTECTION_DELAY && text === secretContent) {
        // Prevent duplicate blocking
        const now = Date.now();
        const isBlocking = getIsBlockingPaste();
        const lastBlocked = getLastBlockedPasteTime();
        if (isBlocking && now - lastBlocked < 1000) {
          return; // Already blocking
        }

        console.log(`🖱️ Mouse paste blocked immediately: ${detectSecrets(text).type}`);
        
        // Clear clipboard IMMEDIATELY to prevent paste
        clipboard.clear();
        setCurrentSecret(text);
        
        // Show blocking dialog IMMEDIATELY
        const detection = detectSecrets(text);
        showPasteBlockDialog(
          text,
          detection.type,
          "Unknown",
          () => {
            allowPasteTemporarily(60);
            setTimeout(() => clipboard.writeText(text), 100);
          },
          () => {
            clipboard.writeText(encryptForSharing(text));
          }
        );
        
        // Reset to prevent re-detection
        lastClipboardText = "";
        clipboardHasSecret = false;
        secretContent = "";
        secretCopiedTime = 0;
      }
      
      return;
      
    } catch (error) {
      console.error("Error in clipboard monitoring:", error);
    }
  }, 20); // Check every 20ms - very frequent to catch mouse paste immediately
}

app.whenReady().then(() => {
  console.log("Notifications supported:", Notification.isSupported());

  // Show initial notification
  try {
    const initNotification = new Notification({
    title: "Secret Guardian",
    body: "Clipboard protection is active"
    });
    
    initNotification.on("show", () => {
      console.log("✅ Initial notification shown - permissions granted");
    });
    
    initNotification.show();
    
    // Handle errors by catching exceptions
    try {
      initNotification.show();
    } catch (error) {
      console.error("❌ Notification error:", error);
      console.warn("⚠️ Please enable notifications in System Settings > Notifications > Secret Guardian");
    }
  } catch (error) {
    console.error("Failed to show initial notification:", error);
  }

  // Create tray icon
  const iconPath = path.join(app.getAppPath(), "src/assets/menu.png");
  console.log(`📌 Loading tray icon from: ${iconPath}`);
  
  try {
    // Check if icon file exists
    if (!fs.existsSync(iconPath)) {
      console.error(`❌ Icon file not found at: ${iconPath}`);
      console.log("   Trying alternative path...");
      // Try alternative path
      const altPath = path.join(__dirname, "../assets/menu.png");
      if (fs.existsSync(altPath)) {
        tray = new Tray(altPath);
        console.log(`✅ Using alternative icon path: ${altPath}`);
      } else {
        console.error("❌ Icon not found in alternative path either");
        // Create a simple text-based tray as fallback
        tray = new Tray(iconPath); // Will use default or fail gracefully
      }
    } else {
  tray = new Tray(iconPath);
      console.log("✅ Tray icon loaded successfully");
    }
    
    tray.setToolTip("Secret Guardian - Right-click for menu");
    
    // Force menu update immediately
    console.log("🔄 Initializing menu...");
    updateTrayMenu();
    
    // Update menu after delays to ensure all modules are loaded
    setTimeout(() => {
      console.log("🔄 Updating menu (first attempt)...");
      updateTrayMenu();
    }, 300);
    
    setTimeout(() => {
      console.log("🔄 Updating menu (second attempt)...");
      updateTrayMenu();
      console.log("✅ Menu bar icon should be visible in top-right corner");
      console.log("   Right-click the icon to see the full menu");
      console.log("   If you only see 'Quit', check console for errors above");
    }, 1000);
  } catch (error) {
    console.error("❌ Error creating tray icon:", error);
    // Try to create tray anyway with default icon
    try {
      tray = new Tray(iconPath);
      updateTrayMenu();
    } catch (e) {
      console.error("❌ Failed to create tray:", e);
    }
  }

  if (app.dock) {
    app.dock.hide();
  }

  // Register global hotkey for redacted paste
  registerRedactedPasteHotkey();

  // Register paste blocking for Cmd+V/Ctrl+V in blocked apps
  registerPasteBlocking();
  console.log("✅ Paste blocking registered - Cmd+V/Ctrl+V will be blocked in blocked apps");

  // Handle paste actions from blocking dialog
  ipcMain.on("paste-action", (event, action, encryptedText?: string) => {
    console.log(`📥 Paste action received: ${action}`, encryptedText ? `with text: ${encryptedText.substring(0, 20)}...` : "");
    if (action === "allow") {
      allowPasteTemporarily(60);
      // Restore original secret to clipboard
      if (currentSecret) {
        setTimeout(() => {
          if (currentSecret) {
            clipboard.writeText(currentSecret);
            console.log("Original secret restored to clipboard (60s allowed)");
          }
        }, 100);
      }
    } else if (action === "encrypt") {
      if (currentSecret) {
        const encrypted = encryptForSharing(currentSecret);
        clipboard.writeText(encrypted);
        console.log("Encrypted secret copied to clipboard");
        if (Notification.isSupported()) {
          new Notification({
            title: "✅ Encrypted Secret Copied",
            body: "Encrypted secret is in clipboard. Safe to share! Others can decrypt in allowed apps."
          }).show();
        }
      }
    } else if (action === "decrypt" && encryptedText) {
      const decrypted = decryptShared(encryptedText);
      if (decrypted) {
        clipboard.writeText(decrypted);
        console.log("Decrypted secret copied to clipboard");
        if (Notification.isSupported()) {
          new Notification({
            title: "✅ Secret Decrypted",
            body: "Decrypted secret is in clipboard. Ready to paste!"
          }).show();
        }
      } else {
        console.error("Failed to decrypt");
        if (Notification.isSupported()) {
          new Notification({
            title: "❌ Decryption Failed",
            body: "Invalid encrypted format. Make sure it starts with SG_ENCRYPTED:"
          }).show();
        }
      }
    }
  });

  // Handle decrypt dialog actions (from menu bar decrypt option)
  ipcMain.on("decrypt-action", (event, encryptedText: string) => {
    console.log(`📥 Decrypt action received with text: ${encryptedText.substring(0, 30)}...`);
    const decrypted = decryptShared(encryptedText);
    if (decrypted) {
      clipboard.writeText(decrypted);
      closeDecryptDialog();
      if (Notification.isSupported()) {
        new Notification({
          title: "🔓 Secret Decrypted",
          body: "Decrypted secret copied to clipboard. Ready to paste!"
        }).show();
      }
    } else {
      if (Notification.isSupported()) {
        new Notification({
          title: "❌ Decryption Failed",
          body: "Invalid encrypted format. Make sure it starts with SG_ENCRYPTED:"
        }).show();
      }
    }
  });

  ipcMain.on("close-decrypt-dialog", () => {
    closeDecryptDialog();
  });

  ipcMain.on("close-blocking-dialog", () => {
    closeBlockingDialog();
  });

  // Start paste monitoring (primary method - more reliable)
  startPasteMonitoring();
  
  const config = getConfig();
  console.log("✅ Secret Guardian started");
  console.log(`   Safe Paste Mode: ${config.safePasteMode ? "ON" : "OFF"}`);

  // Initialize lastText with current clipboard to avoid detecting pre-existing content
  try {
    const initialClipboard = clipboard.readText().trim();
    if (initialClipboard) {
      lastText = initialClipboard;
      // Initialized with existing clipboard content
    }
  } catch (error) {
    // Clipboard might be empty or inaccessible - that's fine
  }

  // Start clipboard monitoring after a short delay to avoid false positives on startup
  setTimeout(() => {
    clipboardMonitorStarted = true;
    // Clipboard monitoring started
  }, 2000); // 2 second delay before starting to monitor

  // Monitor clipboard for secrets
  setInterval(() => {
    // Don't monitor until startup delay has passed
    if (!clipboardMonitorStarted) {
      return;
    }

    let text: string;
    try {
      text = clipboard.readText().trim();
    } catch (clipboardError) {
      // Clipboard might be empty or inaccessible
      return;
    }

    if (!text || text.length < 8) return;
    if (text === lastText) return;
    lastText = text;

    if (text.split("\n").length > 50) return;

    const config = getConfig();
    
    // NEVER block or warn about encrypted data - it's safe
    if (isEncryptedShared(text)) {
      console.log("✅ Encrypted data detected - no action needed (safe to share)");
      return; // Don't process encrypted data
    }
    
    // Static blocking - no pattern matching

    const result = detectSecrets(text);

    if (result.detected) {
      currentSecret = text;

      console.log(`🔍 Secret detected on copy: ${result.type}`, text.substring(0, 30) + "...");

      // Add to history silently (NO NOTIFICATIONS ON COPY)
      addToHistory(text, true, result.type, "Unknown");
      updateTrayMenu();

      // NO NOTIFICATIONS ON COPY - only warn when pasting into blocked apps
      // The paste monitoring will handle warnings

      // Auto-clear for high-risk if enabled (silent, no notification)
      if (config.autoClearHighRisk && result.confidence === "high") {
        if (autoClearTimer) clearTimeout(autoClearTimer);
        autoClearTimer = setTimeout(() => {
          clipboard.clear();
          clearCurrentSecret();
          currentSecret = null;
          updateTrayMenu();
          // Silent auto-clear, no notification
        }, config.autoClearDelay * 1000);
      }

      updateTrayMenu();
    } else {
      // Add non-secret to history
      addToHistory(text, false, undefined, "Unknown");
    }
  }, 300);
});

// Prevent app from quitting when dialogs close
// This is a tray app, so it should stay running even when all windows are closed
app.on("window-all-closed", () => {
  // Don't quit the app - it's a tray app that runs in the background
  // Only quit when user explicitly chooses "Quit" from the menu
  // On macOS, apps typically stay running even when all windows are closed
  // On other platforms, we prevent the default quit behavior
  if (process.platform !== "darwin") {
    // On non-macOS platforms, prevent quit when all windows close
    // The app should only quit when user explicitly chooses "Quit"
    console.log("All windows closed, but app continues running (tray app)");
  }
});

app.on("will-quit", () => {
  try {
    unregisterPasteInterception();
    cleanupBlockingDialog();
    globalShortcut.unregisterAll();
    if (pasteMonitorInterval) {
      clearInterval(pasteMonitorInterval);
      pasteMonitorInterval = null;
    }
    if (autoClearTimer) {
      clearTimeout(autoClearTimer);
      autoClearTimer = null;
    }
  } catch (error) {
    console.error("Error during app cleanup:", error);
  }
});
