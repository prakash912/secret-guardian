import { app, Tray, Menu, clipboard, Notification, ipcMain, globalShortcut, nativeImage } from "electron";
import path from "path";
import fs from "fs";
import { detectSecrets } from "./detectSecrets";
import { getConfig, updateConfig, AVAILABLE_APPS } from "./config";
import { addToHistory, getHistory, clearHistory } from "./clipboardHistory";
import { showPasteBlockDialog, allowPasteTemporarily, clearCurrentSecret, registerRedactedPasteHotkey, unregisterPasteInterception, cleanupBlockingDialog, showDecryptDialog, closeDecryptDialog, closeBlockingDialog, isPasteAllowed, setUserAllowedPasteFlag, setUserEncryptedFlag, getBlockingWindow, getDecryptWindow } from "./pasteBlocker";
import { encryptForSharing, decryptShared, isEncryptedShared, getActiveAppName, isAppAllowed } from "./utils";

app.setAppUserModelId("com.secretguardian.app");
app.setName("Secret Guardian");

let tray: Tray | null = null;
let lastText = "";
let currentSecret: string | null = null;
let autoClearTimer: NodeJS.Timeout | null = null;
let clipboardMonitorStarted = false;
// COPY_DETECTION_DELAY removed - using clipboardChanged check instead

// Monitor clipboard for secret detection (only when Safe Copy Mode is ON)
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
        label: config.safeCopyMode ? "✓ Safe Copy Mode: ON" : "Safe Copy Mode: OFF",
        click: () => {
          const newMode = !config.safeCopyMode;
          updateConfig({ safeCopyMode: newMode });
          updateTrayMenu();
          
          // Stop monitoring if mode is turned OFF
          if (!newMode && pasteMonitorInterval) {
            clearInterval(pasteMonitorInterval);
            pasteMonitorInterval = null;
            console.log("🛑 Safe Copy Mode OFF - Clipboard monitoring stopped");
          } else if (newMode && !pasteMonitorInterval) {
            // Restart monitoring if mode is turned ON
            startPasteMonitoring();
            console.log("✅ Safe Copy Mode ON - Clipboard monitoring started");
          }
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
        { type: "separator" },
        {
          label: "Allow Paste for 60s",
          click: () => {
            if (currentSecret) {
              allowPasteTemporarily(currentSecret, 60);
              updateTrayMenu();
            }
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
            
            // Show notification
            if (Notification.isSupported()) {
              new Notification({
                title: "✅ App Removed from Allowed",
                body: `"${app}" is no longer allowed. It will appear in Available Apps below.`
              }).show();
            }
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
              
              // Show notification
              if (Notification.isSupported()) {
                new Notification({
                  title: "✅ App Added to Allowed",
                  body: `"${app}" is now allowed. Secrets copied in this app won't trigger warnings.`
                }).show();
              }
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
            
            // Show notification
            if (Notification.isSupported()) {
              new Notification({
                title: "✅ App Removed from Blocked",
                body: `"${app}" is no longer blocked. It will appear in Available Apps below.`
              }).show();
            }
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
              
              // Show notification
              if (Notification.isSupported()) {
                new Notification({
                  title: "🚫 App Added to Blocked",
                  body: `"${app}" is now blocked. Secrets copied in this app will trigger warnings.`
                }).show();
              }
            }
          })),
        { type: "separator" },
        { label: `Selected: ${config.blockedApps.length}`, enabled: false }
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

// Clipboard monitoring - detects secrets on copy and shows popup dialog
// Only active when Safe Copy Mode is ON
function startPasteMonitoring() {
  if (pasteMonitorInterval) return;

  // Check Safe Copy Mode before starting
  const config = getConfig();
  if (!config.safeCopyMode) {
    console.log("ℹ️ Safe Copy Mode is OFF - Not starting clipboard monitoring");
    return;
  }

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
  
  // Delay clipboard monitoring to avoid false positives
  setTimeout(() => {
    const config = getConfig();
    if (!config.safeCopyMode) {
      // Safe Copy Mode is OFF - don't start monitoring
      console.log("ℹ️ Safe Copy Mode is OFF - Clipboard monitoring not started");
      return;
    }
    pasteMonitorStarted = true;
    console.log("✅ Clipboard monitoring active (Safe Copy Mode: ON)");
  }, 2000);
  
  // Track when secret was copied to clipboard
  let secretCopiedTime = 0;
  let secretContent = "";
  
  pasteMonitorInterval = setInterval(async () => {
    // Check Safe Copy Mode first - if OFF, stop all monitoring
    const config = getConfig();
    if (!config.safeCopyMode) {
      // Mode is OFF - stop monitoring completely
      return;
    }
    
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

      // Only trigger if clipboard actually changed (not just checking the same content)
      const clipboardChanged = text !== lastClipboardText && text.length > 0;
      
      // COPY DETECTION - Show popup when secret is copied (works for both mouse and keyboard copy)
      // This detects ANY clipboard change, whether from mouse right-click copy or keyboard Cmd+C
      if (clipboardChanged) {
        console.log("📋 Clipboard changed detected (copy operation - mouse or keyboard)");
        
        // Update tracking immediately
        lastClipboardText = text;
        clipboardHasSecret = false;
        secretCopiedTime = 0;
        secretContent = "";
        
        // This is a COPY operation - check if it's a secret and show popup
        if (text && text.length >= 8) {
          // Get app name first to check if it's allowed/blocked
          let appName = "Unknown";
          try {
            appName = await getActiveAppName();
            console.log(`📱 Detected app name: "${appName}"`);
          } catch (error) {
            console.log("   Could not get app name, using 'Unknown'");
          }
          
          // Check if it's encrypted (never block encrypted)
          if (isEncryptedShared(text)) {
            addToHistory(text, true, "Encrypted Secret", appName);
            return; // Don't show popup for encrypted
          }
          
          // Check if it's a secret
          const detection = detectSecrets(text);
          if (detection.detected) {
            // Check if paste is temporarily allowed for THIS SPECIFIC secret (don't show popup if it's the allowed one)
            if (isPasteAllowed(text)) {
              console.log("ℹ️ Paste is temporarily allowed for this specific secret - skipping popup");
              addToHistory(text, true, detection.type, appName);
              updateTrayMenu();
              return; // Don't show popup if this specific secret is allowed
            }
            
            // Check if app is allowed - if so, don't show popup
            const config = getConfig();
            const isAllowed = isAppAllowed(appName, config);
            console.log(`🔍 App check: "${appName}" - Allowed: ${isAllowed}, Allowed apps: [${config.allowedApps.join(", ")}], Blocked apps: [${config.blockedApps.join(", ")}]`);
            
            if (isAllowed) {
              console.log(`✅ App "${appName}" is allowed - skipping popup`);
              addToHistory(text, true, detection.type, appName);
              updateTrayMenu();
              return; // Don't show popup for allowed apps
            }
            
            clipboardHasSecret = true;
            secretCopiedTime = Date.now();
            secretContent = text;
            
            // SECRET DETECTED ON COPY - Show popup immediately (works for mouse and keyboard copy)
            console.log(`🚨 Secret detected on COPY (mouse/keyboard): ${detection.type} in app: ${appName}`);
            
            // Track in history
            addToHistory(text, true, detection.type, appName);
            updateTrayMenu();
            
            // Show blocking dialog on COPY - works for both mouse and keyboard copy
            currentSecret = text;
            console.log(`   Showing popup dialog for app: ${appName}`);
            showPasteBlockDialog(
              text,
              detection.type,
              appName,
              () => {
                // Allow option - allow paste for 60s for this specific secret
                // Note: Dialog will be closed by the IPC handler
                allowPasteTemporarily(text, 60);
              },
              () => {
                // Encrypt option - replace clipboard with encrypted version
                // Note: Dialog will be closed by the IPC handler
                clipboard.writeText(encryptForSharing(text));
              }
            );
            console.log("   Popup should be visible now");
          } else {
            // Not a secret - just track in history
            addToHistory(text, false, undefined, appName);
          }
          
          // Update last app name
          lastAppName = appName;
        }
        
        return; // Exit after processing copy
      }
      
      // No further processing needed - popup already shown on copy
      // Popup shown on copy (Safe Copy Mode) - user can choose to allow for 60s or encrypt/close
      // Clipboard auto-clears after 60s if allowed
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

  // Create tray icon - try multiple paths
  const possiblePaths = [
    path.join(__dirname, "../src/assets/menu.png"), // Development
    path.join(__dirname, "../assets/menu.png"), // Production (packaged)
    path.join(app.getAppPath(), "src/assets/menu.png"), // Alternative dev path
    path.join(app.getAppPath(), "assets/menu.png"), // Alternative prod path
    path.join(process.resourcesPath || app.getAppPath(), "assets/menu.png"), // Packaged app
  ];
  
  let iconPath: string | null = null;
  console.log(`📌 Looking for tray icon...`);
  
  for (const testPath of possiblePaths) {
    console.log(`   Checking: ${testPath}`);
    if (fs.existsSync(testPath)) {
      iconPath = testPath;
      console.log(`✅ Found icon at: ${iconPath}`);
      break;
    }
  }
  
  try {
    if (!iconPath) {
      console.error("❌ Icon file not found in any of the expected locations:");
      possiblePaths.forEach(p => console.error(`   - ${p}`));
      // Try to use the first path anyway (might work in some cases)
      iconPath = possiblePaths[0];
      console.log(`⚠️ Attempting to use: ${iconPath}`);
    }
    
    // Use nativeImage to ensure proper icon loading
    const iconImage = nativeImage.createFromPath(iconPath);
    if (iconImage.isEmpty()) {
      console.warn(`⚠️ Icon image is empty, but attempting to use path anyway`);
      tray = new Tray(iconPath);
    } else {
      // Set appropriate size for macOS tray icons (typically 22x22 or 16x16)
      const resizedIcon = iconImage.resize({ width: 22, height: 22 });
      tray = new Tray(resizedIcon);
      console.log(`✅ Tray icon loaded and resized from: ${iconPath}`);
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
    // Try to create tray anyway with default icon if we have a path
    if (iconPath) {
      try {
        tray = new Tray(iconPath);
        updateTrayMenu();
      } catch (e) {
        console.error("❌ Failed to create tray:", e);
      }
    } else {
      console.error("❌ No valid icon path found - tray icon may not display");
    }
  }

  if (app.dock) {
    app.dock.hide();
  }

  // Register global hotkey for redacted paste
  registerRedactedPasteHotkey();

  // Paste blocking removed - popup shows on copy, clipboard auto-clears after 60s if allowed

  // Handle paste actions from blocking dialog
  ipcMain.on("paste-action", (event, action, encryptedText?: string) => {
    console.log(`📥 Paste action received: ${action}`, encryptedText ? `with text: ${encryptedText.substring(0, 20)}...` : "");
    if (action === "allow") {
      // Mark that user allowed paste - don't clear clipboard on dialog close
      setUserAllowedPasteFlag(true);
      
      // Ensure secret is in clipboard (it should already be there, but make sure)
      if (currentSecret) {
        clipboard.writeText(currentSecret);
        console.log(`✅ Secret kept in clipboard (${currentSecret.length} chars, will auto-clear in 60s)`);
        
        // Set timer to auto-clear clipboard after 60 seconds for THIS SPECIFIC secret
        allowPasteTemporarily(currentSecret, 60);
        console.log("✅ Paste allowed for 60 seconds for this specific secret - clipboard will auto-clear after 60s");
      }
      
      // Show notification
      if (Notification.isSupported()) {
        new Notification({
          title: "✅ Paste Allowed",
          body: "You can paste this specific secret for the next 60 seconds. Other secrets will still trigger warnings. It will auto-clear after 60s."
        }).show();
      }
      
      // Close the dialog (clipboard will NOT be cleared since flag is set)
      closeBlockingDialog();
    } else if (action === "encrypt") {
      if (currentSecret) {
        // Replace clipboard with encrypted version (with SG_ENCRYPTED: prefix)
        const encrypted = encryptForSharing(currentSecret);
        clipboard.writeText(encrypted);
        console.log("✅ Original secret replaced with encrypted version (SG_ENCRYPTED:) - encrypted key stays in clipboard");
        
        // Set flag so clipboard won't be cleared when dialog closes
        setUserEncryptedFlag(true);
        
        // Clear the original secret reference
        currentSecret = null;
        
        // Close the dialog (clipboard will NOT be cleared since flag is set)
        closeBlockingDialog();
        
        if (Notification.isSupported()) {
          new Notification({
            title: "✅ Encrypted Secret Copied",
            body: "Encrypted secret (SG_ENCRYPTED:) is in clipboard and will not be cleared."
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

  // Handle dialog resize requests
  ipcMain.on("resize-dialog", (event, dialogType: string, height: number) => {
    if (dialogType === "blocking") {
      const window = getBlockingWindow();
      if (window) {
        window.setSize(520, height);
      }
    } else if (dialogType === "decrypt") {
      const window = getDecryptWindow();
      if (window) {
        window.setSize(500, height);
      }
    }
  });

  // Start clipboard monitoring (only if Safe Copy Mode is ON)
  const config = getConfig();
  if (config.safeCopyMode) {
    startPasteMonitoring();
    console.log("✅ Secret Guardian started");
    console.log(`   Safe Copy Mode: ON - Clipboard monitoring active`);
  } else {
    console.log("✅ Secret Guardian started");
    console.log(`   Safe Copy Mode: OFF - Clipboard monitoring disabled`);
  }

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

      // NO NOTIFICATIONS ON COPY - dialog shown by clipboard monitoring when Safe Copy Mode is ON

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
