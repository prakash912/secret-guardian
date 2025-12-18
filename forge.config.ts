import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: "com.secretguardian.app",
    appCategoryType: "public.app-category.developer-tools",
    icon: "src/assets/iconTemplate", // NO extension
    asar: true,
  },
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main.ts",
          config: "vite.main.config.ts",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
    new (require("@electron-forge/plugin-auto-unpack-natives").default)(),
    new (require("@electron-forge/plugin-fuses").default)({
      version: require("@electron/fuses").FuseVersion.V1,
      [require("@electron/fuses").FuseV1Options.RunAsNode]: false,
      [require("@electron/fuses").FuseV1Options.EnableCookieEncryption]: true,
      [require("@electron/fuses").FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [require("@electron/fuses").FuseV1Options.EnableNodeCliInspectArguments]: false,
      [require("@electron/fuses").FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [require("@electron/fuses").FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
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
