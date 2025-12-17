import { app, Tray, Menu, clipboard, Notification } from "electron";
import path from "path";
import { detectSecrets } from "./detectSecrets";

app.setAppUserModelId("com.secretguardian.app");
app.setName("Secret Guardian");

let tray: Tray | null = null;

app.whenReady().then(() => {
  console.log("Notifications supported:", Notification.isSupported());

  new Notification({
    title: "Secret Guardian",
    body: "Clipboard protection is active"
  }).show();

  const iconPath = path.join(app.getAppPath(), "src/assets/menu.png");
  tray = new Tray(iconPath);

  const menu = Menu.buildFromTemplate([
    { label: "Secret Guardian running", enabled: false },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() }
  ]);

  tray.setToolTip("Secret Guardian");
  tray.setContextMenu(menu);

  if (app.dock) {
    app.dock.hide();
  }

  const seen = new Set<string>();
  let lastText = "";

  setInterval(() => {
    const text = clipboard.readText().trim();

    if (!text || text.length < 8) return;
    if (text === lastText) return;
    lastText = text;

    if (text.split("\n").length > 20) return;

    if (seen.has(text)) return;

    const result = detectSecrets(text);

    if (result.detected) {
      seen.add(text);

      new Notification({
        title: "⚠️ Possible sensitive data copied",
        body: `Detected ${result.type}. Be careful before pasting this into chat, email, or tickets.`
      }).show();


      setTimeout(() => seen.delete(text), 5 * 60 * 1000);
    }
  }, 500);
});
