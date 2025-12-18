cask "secret-guardian" do
  version "1.0.0"
  sha256 "2f926caa4180e031814138633e9fa767209f42477461a3ea622d3db4569f3c2e"

  url "https://github.com/prakash912/secret-guardian/releases/download/v#{version}/secret-guardian-#{version}-arm64.dmg",
      verified: "github.com/prakash912/secret-guardian/"
  name "Secret Guardian"
  desc "Desktop app that monitors your clipboard and alerts you when you copy sensitive data"
  homepage "https://github.com/prakash912/secret-guardian"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "secret-guardian.app"

  zap trash: [
    "~/Library/Application Support/secret-guardian",
    "~/Library/Preferences/com.secretguardian.app.plist",
    "~/Library/Saved Application State/com.secretguardian.app.savedState",
  ]
end

