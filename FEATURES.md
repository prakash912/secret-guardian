# 🚀 Secret Guardian - Advanced Features

This document describes all the advanced features implemented in Secret Guardian.

## ✅ Implemented Features

### 1. 🛡️ Safe Paste Mode (Killer Feature)

**What it does:**
- Monitors clipboard in real-time
- When you try to paste a secret into a dangerous app (Slack, Gmail, browser, etc.), it **blocks the paste**
- Shows a blocking dialog with recovery options

**How it works:**
- Detects secrets in clipboard
- Checks active application
- Blocks paste if app is in "blocked" list
- Shows dialog: "Reveal Once" | "Paste Redacted" | "Allow for 60s"

**Configuration:**
- Default blocked apps: Slack, Discord, Teams, Gmail, Mail, Safari, Chrome, Firefox, Notion, Terminal
- Default allowed apps: VS Code, Xcode, IDEs, Password managers, AWS Console, Postman
- Customizable via config file

### 2. 🔄 Recovery Actions

**Available actions when secret detected:**

1. **Clear Clipboard** - Immediately clear the clipboard
2. **Copy Redacted Version** - Replace with redacted version (e.g., `AKIA****************Q7ZP`)
3. **Copy Previous Safe Item** - Restore last non-secret clipboard item
4. **Allow Paste for 60s** - Temporarily allow pasting (bypass block)

**Access:**
- Right-click menu bar icon → Recovery Actions
- Notification action buttons
- Blocking dialog buttons

### 3. 📱 App-Aware Rules

**Smart app detection:**
- Automatically detects active application
- Different rules for different apps
- Whitelist/blacklist system

**Example rules:**
- ✅ JWT tokens allowed in Postman, blocked everywhere else
- ✅ AWS keys allowed in AWS Console, blocked in chat apps
- ✅ All secrets blocked in Slack/Gmail
- ✅ All secrets allowed in password managers

**Configuration:**
- Edit `config.json` in app data directory
- Or use menu: Settings → Allowed/Blocked Apps

### 4. 📝 Leak Explain

**Clear, concise explanations:**
- "Looks like AWS Access Key ID (AKIA...)"
- "Looks like GitHub Personal Access Token (ghp_)"
- "High-entropy secret: 44+ random chars (entropy: 4.2)"
- "Potential secret: high entropy (3.8) with secret-like pattern"

**Confidence levels:**
- 🔴 **High** - Pattern match (AWS key, GitHub token, etc.)
- 🟡 **Medium** - High entropy with context
- 🟢 **Low** - Potential match with keywords

### 5. 📋 Clipboard History (Encrypted)

**Features:**
- Stores last 10 clipboard items
- Encrypted storage (AES-256)
- Auto-deletes secrets after 1 hour
- Shows redacted previews
- One-click restore

**Security:**
- Secrets encrypted at rest
- Only redacted versions shown in UI
- Auto-expires risky items
- Local storage only (never sent anywhere)

**Access:**
- Menu bar → Clipboard History
- See last 5 items
- Click to restore

### 6. 👨‍💻 Developer-Friendly Extras

#### Ignore Patterns
- Whitelist dummy/test keys
- Patterns: `AKIA_TEST_*`, `ghp_test_*`
- Wildcard support

#### Project Mode (Coming Soon)
- Different rules per workspace
- Work vs personal separation
- Workspace-specific allowlists

#### Export Incident Log
- Export detection history (local only)
- Includes: type, app, time (never full secret)
- JSON format for analysis
- Privacy-preserving

## 🎯 Global Hotkeys

- **⌥⌘V** (Option+Command+V) - Paste redacted version of current secret

## 📊 Configuration

Configuration file location: `~/Library/Application Support/secret-guardian/config.json`

**Default settings:**
```json
{
  "safePasteMode": true,
  "allowedApps": ["Visual Studio Code", "Xcode", "1Password", ...],
  "blockedApps": ["Slack", "Gmail", "Safari", ...],
  "ignorePatterns": ["AKIA_TEST_*", "ghp_test_*"],
  "autoClearHighRisk": false,
  "autoClearDelay": 10,
  "clipboardHistoryEnabled": true,
  "clipboardHistorySize": 10
}
```

## 🔒 Security & Privacy

- **Local-only** - Everything stays on your machine
- **Encrypted storage** - Clipboard history encrypted
- **No network** - Zero external connections
- **No logging** - Secrets never stored in plain text
- **Auto-expire** - Risky items auto-deleted

## 🚀 Usage Examples

### Example 1: Block Dangerous Paste
1. Copy AWS key: `AKIAIOSFODNN7EXAMPLE`
2. Try to paste in Slack
3. **Blocked!** Dialog appears
4. Choose: "Paste Redacted" → `AKIA****************PLE`

### Example 2: Quick Recovery
1. Copy secret accidentally
2. Notification appears
3. Click "Clear" button
4. Clipboard cleared instantly

### Example 3: Redacted Paste Hotkey
1. Copy secret
2. Go to chat app
3. Press **⌥⌘V**
4. Redacted version pasted automatically

### Example 4: Restore Previous Item
1. Copy secret (overwrites previous)
2. Menu → Recovery Actions → "Copy Previous Safe Item"
3. Previous clipboard restored

## 🎨 UI Features

### Menu Bar Icon
- Right-click for full menu
- Recovery actions
- Clipboard history
- Settings
- Test notifications

### Blocking Dialog
- Beautiful gradient design
- Clear messaging
- Three action buttons
- Always on top

### Notifications
- Critical urgency
- Action buttons
- Clear explanations
- Click to open menu

## 🔧 Technical Details

### Detection
- 50+ pattern matches
- Multi-tier entropy analysis
- Context-aware detection
- Configuration file parsing

### Performance
- 200ms paste monitoring
- 300ms clipboard checking
- Efficient pattern matching
- Minimal CPU usage

### Compatibility
- macOS (primary)
- Windows (planned)
- Linux (planned)

## 📈 Future Enhancements

- [ ] Project mode with workspace detection
- [ ] Team collaboration features
- [ ] Integration with secret managers
- [ ] AI-powered detection
- [ ] Visual dashboard
- [ ] Export incident logs
- [ ] Custom rule builder UI

## 🐛 Known Limitations

1. **Paste Blocking**: On macOS, true paste interception requires Accessibility permissions. Current implementation uses monitoring + dialog.

2. **App Detection**: Requires AppleScript permissions on macOS. Falls back to "Unknown" if denied.

3. **Windows/Linux**: Some features may need platform-specific implementations.

## 💡 Tips

1. **Add your IDE** to allowed apps for seamless development
2. **Use ignore patterns** for test/dummy keys
3. **Enable auto-clear** for high-risk secrets if desired
4. **Check clipboard history** if you accidentally overwrote something
5. **Use ⌥⌘V** hotkey for quick redacted pastes

## 🆘 Troubleshooting

**Paste blocking not working?**
- Check Safe Paste Mode is enabled
- Verify app is in blocked list
- Check Accessibility permissions (macOS)

**Notifications not showing?**
- System Settings → Notifications → Secret Guardian
- Enable notifications

**App detection not working?**
- Grant Accessibility permissions
- Check System Preferences → Security & Privacy

---

**Built with ❤️ for developers who care about security**

