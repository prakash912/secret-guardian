import type { ForgeConfig } from "@electron-forge/shared-types";

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: "com.secretguardian.app",
    appCategoryType: "public.app-category.developer-tools",
    icon: "src/assets/iconTemplate", // NO extension
  },
  makers: [
    // macOS
    {
      name: "@electron-forge/maker-dmg",
      config: {
        overwrite: true,
        format: "ULFO",
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
    // Windows
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "secret-guardian",
      },
    },
    // Linux
    {
      name: "@electron-forge/maker-deb",
      config: {},
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {},
    },
  ],
};

export default config;
