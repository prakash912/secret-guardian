import { app, Tray, Menu, clipboard, Notification, ipcMain, globalShortcut } from "electron";
import path from "path";
import fs from "fs";
import { detectSecrets } from "./detectSecrets";
import { getConfig, updateConfig } from "./config";
import { addToHistory, getHistory, clearHistory, getPreviousSafeItem } from "./clipboardHistory";
import { showPasteBlockDialog, allowPasteTemporarily, getRedactedSecret, clearCurrentSecret, registerRedactedPasteHotkey, registerPasteInterception, unregisterPasteInterception, isPasteAllowed, cleanupBlockingDialog } from "./pasteBlocker";
import { redactSecret, matchesIgnorePattern, getActiveAppName, isAppAllowed } from "./utils";

app.setAppUserModelId("com.secretguardian.app");
app.setName("Secret Guardian");

let tray: Tray | null = null;
let lastText = "";
let lastNotificationTime = 0;
let currentSecret: string | null = null;
let autoClearTimer: NodeJS.Timeout | null = null;
const NOTIFICATION_COOLDOWN = 5000; // Increased to 5 seconds to prevent spam
let clipboardMonitorStarted = false;

// Monitor clipboard for paste blocking
let pasteMonitorInterval: NodeJS.Timeout | null = null;

function updateTrayMenu() {
  try {
    console.log("🔄 Building tray menu...");
    
    const config = getConfig();
    const history = getHistory();
    
    console.log(`   Safe Paste Mode: ${config.safePasteMode}`);
    console.log(`   Current secret: ${currentSecret ? "Yes" : "No"}`);
    console.log(`   History items: ${history.length}`);
    
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
      label: "Settings",
      submenu: [
        {
          label: `Allowed Apps (${config.allowedApps.length})`,
          click: () => {
            // Could open settings window
            console.log("Allowed apps:", config.allowedApps);
          }
        },
        {
          label: `Blocked Apps (${config.blockedApps.length})`,
          click: () => {
            console.log("Blocked apps:", config.blockedApps);
          }
        },
        {
          label: `Ignore Patterns (${config.ignorePatterns.length})`,
          click: () => {
            console.log("Ignore patterns:", config.ignorePatterns);
          }
        }
      ]
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
        const appName = await getActiveAppName();
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
    
    console.log(`   Menu items: ${menuItems.length}`);
    
    const menu = Menu.buildFromTemplate(menuItems);
    
    if (tray) {
      tray.setContextMenu(menu);
      console.log("✅ Tray menu updated successfully with", menuItems.length, "items");
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

function showRecoveryNotification(secret: string, secretType: string, explanation: string) {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title: "🚨 SECRET DETECTED!",
    body: `${explanation}\n\nActions available in menu bar.`,
    urgency: "critical",
    timeoutType: "never",
    actions: [
      { type: "button", text: "Clear" },
      { type: "button", text: "Redact" },
      { type: "button", text: "Allow 60s" }
    ]
  });

  notification.on("action", (event, index) => {
    if (index === 0) {
      // Clear
      clipboard.clear();
      clearCurrentSecret();
      currentSecret = null;
      updateTrayMenu();
    } else if (index === 1) {
      // Redact
      clipboard.writeText(redactSecret(secret));
    } else if (index === 2) {
      // Allow 60s
      allowPasteTemporarily(60);
    }
  });

  notification.on("click", () => {
    updateTrayMenu();
  });

  notification.show();
}

// Active paste monitoring - detects when secrets are pasted into blocked apps
function startPasteMonitoring() {
  if (pasteMonitorInterval) return;

  console.log("🔍 Starting paste monitoring...");
  
  // Initialize with current clipboard to avoid false positives on startup
  let lastClipboardText = "";
  try {
    const initialClipboard = clipboard.readText().trim();
    if (initialClipboard) {
      lastClipboardText = initialClipboard;
    }
  } catch (error) {
    // Clipboard might be empty - that's fine
  }
  
  let pasteMonitorStarted = false;
  
  // Delay paste monitoring to avoid false positives
  setTimeout(() => {
    pasteMonitorStarted = true;
    console.log("✅ Paste monitoring active");
  }, 2000);
  
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
      const appName = await getActiveAppName();
      
      const config = getConfig();
      if (!config.safePasteMode) {
        lastClipboardText = text;
        return;
      }

      // Only trigger if clipboard actually changed (not just checking the same content)
      const clipboardChanged = text !== lastClipboardText && text.length > 0;
      
      // Update tracking
      if (clipboardChanged) {
        lastClipboardText = text;
      }
      
      // Only check if clipboard has content AND it changed
      if (!text || text.length < 8 || !clipboardChanged) return;

      // Check ignore patterns
      for (const pattern of config.ignorePatterns) {
        if (matchesIgnorePattern(text, pattern)) {
          return;
        }
      }

      // Detect if it's a secret
      const detection = detectSecrets(text);
      if (!detection.detected) {
        // Not a secret - allow paste, no blocking needed
        return;
      }

      // Check if we're in an allowed app
      const isAllowed = isAppAllowed(appName, config);
      
      // If app is allowed, don't block - let the paste proceed
      if (isAllowed) {
        console.log(`✅ App ${appName} is allowed - secret paste permitted`);
        return;
      }

      // We're in a blocked app with a secret - show blocking dialog
      console.log(`🚫 App ${appName} is blocked - secret paste will be blocked`);
      
      // Check if paste is temporarily allowed
      if (isPasteAllowed()) {
        console.log("   Paste temporarily allowed - skipping dialog");
        return;
      }
      
      // Only show dialog if clipboard actually changed (user copied something new)
      // Don't show dialog repeatedly for the same clipboard content
      if (!clipboardChanged) {
        console.log("   Clipboard unchanged - skipping dialog");
        return;
      }

      console.log(`🚫 Secret detected in clipboard while in blocked app: ${appName}`);
      console.log(`   Secret type: ${detection.type}`);
      console.log(`   Clipboard changed: ${clipboardChanged}`);
      console.log(`   Clipboard text preview: ${text.substring(0, 20)}...`);

      // Show blocking dialog
      currentSecret = text;
      
      try {
        showPasteBlockDialog(
        text,
        detection.type,
        appName,
        () => {
          console.log("User chose: Reveal Once");
          allowPasteTemporarily(5);
          setTimeout(() => {
            clipboard.writeText(text);
          }, 100);
        },
        () => {
          console.log("User chose: Paste Redacted");
          const redacted = redactSecret(text);
          clipboard.writeText(redacted);
          if (Notification.isSupported()) {
            new Notification({
              title: "Redacted Version Ready",
              body: "Redacted secret is in clipboard. Paste again to use it."
            }).show();
          }
        },
        () => {
          console.log("User chose: Allow for 60s");
          allowPasteTemporarily(60);
          setTimeout(() => {
            clipboard.writeText(text);
          }, 100);
        }
        );
        console.log("✅ Blocking dialog function called");
      } catch (error) {
        console.error("❌ Error showing blocking dialog:", error);
      }

      // Also show notification
      if (Notification.isSupported()) {
        try {
          new Notification({
            title: "🚨 Secret Pasted into Blocked App!",
            body: `${detection.type} detected in ${appName}. Check the blocking dialog.`,
            urgency: "critical"
          }).show();
          console.log("✅ Notification shown");
        } catch (error) {
          console.error("❌ Error showing notification:", error);
        }
      }
    } catch (error) {
      console.error("Error in paste monitoring:", error);
    }
  }, 300); // Check every 300ms - more frequent for better detection
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
    
    initNotification.on("error", (error) => {
      console.error("❌ Notification error:", error);
      console.warn("⚠️ Please enable notifications in System Settings > Notifications > Secret Guardian");
    });
    
    initNotification.show();
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

  // NOTE: We don't register paste interception (Cmd+V/Ctrl+V) because:
  // 1. Electron's globalShortcut can't prevent the actual paste
  // 2. Registering it intercepts the shortcut and can break normal pasting
  // 3. Clipboard monitoring works better - it detects secrets in clipboard
  //    and shows warnings when you're in blocked apps
  console.log("✅ Using clipboard monitoring for paste detection (doesn't interfere with normal pasting)");

  // Handle paste actions from blocking dialog
  ipcMain.on("paste-action", (event, action) => {
    console.log(`📥 Paste action received: ${action}`);
    if (action === "reveal") {
      allowPasteTemporarily(5);
      // Restore original secret to clipboard for immediate paste
      if (currentSecret) {
        setTimeout(() => {
          if (currentSecret) {
            clipboard.writeText(currentSecret);
            console.log("Original secret restored to clipboard");
          }
        }, 100);
      }
    } else if (action === "redact") {
      const redacted = getRedactedSecret();
      if (redacted) {
        clipboard.writeText(redacted);
        console.log("Redacted version in clipboard");
      }
    } else if (action === "allow") {
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
    }
  });

  // Start paste monitoring (primary method - more reliable)
  startPasteMonitoring();
  
  const config = getConfig();
  console.log("✅ Secret Guardian started");
  console.log("   - Clipboard monitoring: Active");
  console.log("   - Safe Paste Mode: " + (config.safePasteMode ? "ON" : "OFF"));
  console.log("   - Blocked apps: " + config.blockedApps.join(", "));
  console.log("   - Allowed apps: " + config.allowedApps.join(", "));
  console.log("");
  console.log("📋 How to test:");
  console.log("   1. Copy a secret: AKIAIOSFODNN7EXAMPLE");
  console.log("   2. Open Safari/Chrome (blocked app)");
  console.log("   3. Paste (Cmd+V) - dialog should appear");
  console.log("");

  // Initialize lastText with current clipboard to avoid detecting pre-existing content
  try {
    const initialClipboard = clipboard.readText().trim();
    if (initialClipboard) {
      lastText = initialClipboard;
      console.log("📋 Initialized with existing clipboard content (will not trigger notification)");
    }
  } catch (error) {
    // Clipboard might be empty or inaccessible - that's fine
  }

  // Start clipboard monitoring after a short delay to avoid false positives on startup
  setTimeout(() => {
    clipboardMonitorStarted = true;
    console.log("✅ Clipboard monitoring started");
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
    
    // Check ignore patterns
    for (const pattern of config.ignorePatterns) {
      if (matchesIgnorePattern(text, pattern)) {
        return;
      }
    }

    const result = detectSecrets(text);

    if (result.detected) {
      const now = Date.now();
      
      if (now - lastNotificationTime < NOTIFICATION_COOLDOWN) {
        return;
      }
      lastNotificationTime = now;

      currentSecret = text;

      console.log(`🔍 Secret detected: ${result.type}`, text.substring(0, 30) + "...");

      // Add to history
      getActiveAppName().then((appName) => {
        addToHistory(text, true, result.type, appName);
        updateTrayMenu();
      });

      // Show recovery notification
      showRecoveryNotification(text, result.type, result.explanation);

      // Auto-clear for high-risk if enabled
      if (config.autoClearHighRisk && result.confidence === "high") {
        if (autoClearTimer) clearTimeout(autoClearTimer);
        autoClearTimer = setTimeout(() => {
          clipboard.clear();
          clearCurrentSecret();
          currentSecret = null;
          updateTrayMenu();
          new Notification({
            title: "Clipboard Cleared",
            body: "High-risk secret automatically cleared"
          }).show();
        }, config.autoClearDelay * 1000);
      }

      updateTrayMenu();
    } else {
      // Add non-secret to history
      getActiveAppName().then((appName) => {
        addToHistory(text, false, undefined, appName);
      });
    }
  }, 300);
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
