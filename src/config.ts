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

