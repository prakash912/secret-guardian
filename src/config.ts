import { app } from "electron";
import fs from "fs";
import path from "path";

export interface AppRule {
  appName: string;
  bundleId?: string;
  allowed: boolean;
  secretTypes?: string[]; // If specified, only these types are allowed/blocked
}

export interface UserConfig {
  safePasteMode: boolean;
  allowedApps: string[]; // App names that are always allowed
  blockedApps: string[]; // App names that are always blocked
  appRules: AppRule[];
  ignorePatterns: string[]; // Patterns to ignore (e.g., "AKIA_TEST_*")
  autoClearHighRisk: boolean;
  autoClearDelay: number; // seconds
  clipboardHistoryEnabled: boolean;
  clipboardHistorySize: number;
  projectMode: {
    enabled: boolean;
    workspaceRules: Record<string, AppRule[]>;
  };
}

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

// Comprehensive list of available apps
export const AVAILABLE_APPS = [
  // IDEs & Code Editors
  "Visual Studio Code", "Code", "Xcode", "IntelliJ IDEA", "PyCharm", "WebStorm",
  "Android Studio", "Sublime Text", "Atom", "Vim", "Neovim", "Emacs", "Nano",
  "Eclipse", "NetBeans", "CLion", "Rider", "PhpStorm", "RubyMine", "GoLand",
  "Fleet", "Cursor", "Zed", "Nova",
  // Password Managers
  "1Password", "1Password 7", "Bitwarden", "LastPass", "Dashlane", "KeePass",
  "KeePassXC", "Enpass", "NordPass",
  // Development Tools
  "Postman", "Insomnia", "HTTPie", "Docker", "Kubernetes", "AWS Console",
  "Azure Portal", "Google Cloud Console", "Heroku", "Vercel", "Netlify",
  "GitHub Desktop", "SourceTree", "Fork", "Tower", "Sourcetree",
  // Terminals
  "Terminal", "iTerm", "iTerm2", "Warp", "Hyper", "Alacritty", "Kitty",
  "WezTerm", "Termius",
  // Communication (Blocked by default)
  "Slack", "Discord", "Microsoft Teams", "Zoom", "Skype", "Telegram",
  "WhatsApp", "Signal", "Element", "Mattermost", "Rocket.Chat",
  // Email (Blocked by default)
  "Gmail", "Mail", "Outlook", "Thunderbird", "Spark", "Airmail", "Canary",
  "Apple Mail", "Microsoft Outlook",
  // Browsers (Blocked by default)
  "Safari", "Google Chrome", "Chrome", "Firefox", "Edge", "Brave", "Opera",
  "Vivaldi", "Arc", "Tor Browser",
  // Note-taking & Productivity (Blocked by default)
  "Notion", "Evernote", "Obsidian", "Roam Research", "LogSeq", "Bear",
  "Apple Notes", "OneNote", "Joplin",
  // Social Media (Blocked by default)
  "Twitter", "Facebook", "Instagram", "LinkedIn", "Reddit", "TikTok",
  // Other
  "Finder", "Spotlight", "Alfred", "Raycast"
];

// Common ignore patterns
export const AVAILABLE_PATTERNS = [
  "AKIA_TEST_*", "ghp_test_*", "sk_test_*", "pk_test_*",
  "*_TEST_*", "*_DEV_*", "*_LOCAL_*", "test_*", "demo_*",
  "example_*", "sample_*", "dummy_*", "fake_*", "mock_*"
];

const DEFAULT_CONFIG: UserConfig = {
  safePasteMode: true,
  allowedApps: [
    "Visual Studio Code",
    "Code",
    "Xcode",
    "IntelliJ IDEA",
    "PyCharm",
    "WebStorm",
    "1Password",
    "1Password 7",
    "Bitwarden",
    "AWS Console",
    "Postman",
  ],
  blockedApps: [
    "Slack",
    "Discord",
    "Microsoft Teams",
    "Gmail",
    "Mail",
    "Messages",
    "Safari",
    "Google Chrome",
    "Firefox",
    "Notion",
    "Terminal",
    "iTerm",
  ],
  appRules: [],
  ignorePatterns: ["AKIA_TEST_*", "ghp_test_*"],
  autoClearHighRisk: false,
  autoClearDelay: 10,
  clipboardHistoryEnabled: true,
  clipboardHistorySize: 10,
  projectMode: {
    enabled: false,
    workspaceRules: {},
  },
};

export function loadConfig(): UserConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf-8");
      const config = JSON.parse(data);
      return { ...DEFAULT_CONFIG, ...config };
    }
  } catch (error) {
    console.error("Error loading config:", error);
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(config: UserConfig): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Error saving config:", error);
  }
}

export function getConfig(): UserConfig {
  return loadConfig();
}

export function updateConfig(updates: Partial<UserConfig>): UserConfig {
  const config = loadConfig();
  const updated = { ...config, ...updates };
  saveConfig(updated);
  return updated;
}

