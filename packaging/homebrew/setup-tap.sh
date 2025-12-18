#!/bin/bash

# Script to set up your own Homebrew tap for Secret Guardian
# This creates a new GitHub repository and sets up the cask

set -e

GITHUB_USERNAME="prakash912"
TAP_NAME="homebrew-cask"
CASK_NAME="secret-guardian"

echo "🍺 Setting up Homebrew tap for Secret Guardian"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ Error: GitHub CLI (gh) is not installed"
    echo "Install it with: brew install gh"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Error: Not authenticated with GitHub"
    echo "Run: gh auth login"
    exit 1
fi

# Check if tap repository already exists
if gh repo view "$GITHUB_USERNAME/$TAP_NAME" &> /dev/null; then
    echo "⚠️  Repository $GITHUB_USERNAME/$TAP_NAME already exists"
    read -p "Do you want to use the existing repository? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Exiting. You can manually set up the tap."
        exit 1
    fi
    echo "Using existing repository..."
else
    echo "📦 Creating GitHub repository: $GITHUB_USERNAME/$TAP_NAME"
    gh repo create "$GITHUB_USERNAME/$TAP_NAME" \
        --public \
        --description "Homebrew cask for Secret Guardian" \
        --clone
fi

# Navigate to the tap directory
if [ -d "$TAP_NAME" ]; then
    cd "$TAP_NAME"
else
    echo "❌ Error: Could not find or create tap directory"
    exit 1
fi

# Create Casks directory
mkdir -p Casks

# Copy or create the cask file
CASK_FILE="Casks/$CASK_NAME.rb"
if [ -f "../packaging/homebrew/Casks/$CASK_NAME.rb" ]; then
    echo "📋 Copying cask file..."
    cp "../packaging/homebrew/Casks/$CASK_NAME.rb" "$CASK_FILE"
else
    echo "📋 Creating cask file..."
    cat > "$CASK_FILE" << 'CASKEOF'
cask "secret-guardian" do
  version "1.0.0"
  sha256 "5b3fb121d01314696142e2d27771e158da11135dfc752b19a8e512abcba61f85"

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
CASKEOF
fi

# Create README
echo "📝 Creating README..."
cat > README.md << 'READMEEOF'
# Homebrew Cask for Secret Guardian

Install Secret Guardian via Homebrew:

```bash
brew tap prakash912/homebrew-cask
brew install --cask secret-guardian
```

## What is Secret Guardian?

Secret Guardian is a desktop application that monitors your clipboard and alerts you when you copy sensitive data like API keys, tokens, or secrets. Helps prevent accidentally sharing sensitive information.

## Installation

```bash
# Tap this repository
brew tap prakash912/homebrew-cask

# Install Secret Guardian
brew install --cask secret-guardian
```

## Updating

```bash
brew upgrade --cask secret-guardian
```

## Uninstalling

```bash
brew uninstall --cask secret-guardian
```

## Links

- [GitHub Repository](https://github.com/prakash912/secret-guardian)
- [Releases](https://github.com/prakash912/secret-guardian/releases)
READMEEOF

# Check if there are uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📤 Committing and pushing changes..."
    git add .
    git commit -m "Add Secret Guardian cask"
    git push -u origin main
    echo "✅ Changes pushed to GitHub"
else
    echo "ℹ️  No changes to commit"
fi

echo ""
echo "✅ Homebrew tap setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Test the tap:"
echo "   brew tap $GITHUB_USERNAME/$TAP_NAME"
echo "   brew install --cask $CASK_NAME"
echo ""
echo "2. Share with users:"
echo "   brew tap $GITHUB_USERNAME/$TAP_NAME"
echo "   brew install --cask $CASK_NAME"
echo ""
echo "3. To update the cask for a new version:"
echo "   - Update version and SHA256 in $CASK_FILE"
echo "   - Commit and push changes"
echo ""
echo "Repository: https://github.com/$GITHUB_USERNAME/$TAP_NAME"


