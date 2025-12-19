# Homebrew Installation, Update, and Removal Guide

## Overview

This guide covers how to install, update, and completely remove Secret Guardian when installed via Homebrew. Since you've already deployed it to your own Homebrew tap, this document provides step-by-step instructions for users and for maintaining updates.

## Table of Contents

1. [Installation](#installation)
2. [Updating the App](#updating-the-app)
3. [Updating the Homebrew Cask (For Maintainers)](#updating-the-homebrew-cask-for-maintainers)
4. [Complete Removal](#complete-removal)
5. [Troubleshooting](#troubleshooting)

---

## Installation

### For Users

**First-time installation:**

```bash
# 1. Tap your Homebrew repository
brew tap prakash912/homebrew-cask

# 2. Install Secret Guardian
brew install --cask secret-guardian
```

**Or install in one command:**

```bash
brew install --cask prakash912/homebrew-cask/secret-guardian
```

**What happens during installation:**
- Homebrew downloads the DMG from your GitHub releases
- Verifies the SHA256 checksum
- Mounts the DMG
- Copies `secret-guardian.app` to `/Applications/`
- Unmounts the DMG
- Cleans up temporary files

**Verify installation:**

```bash
# Check if installed
brew list --cask | grep secret-guardian

# Check app location
ls -la /Applications/secret-guardian.app

# Check version
brew info --cask secret-guardian
```

---

## Updating the App

### For Users

**Method 1: Using Homebrew (Recommended)**

```bash
# Update Homebrew and all casks
brew update

# Upgrade Secret Guardian to latest version
brew upgrade --cask secret-guardian
```

**Method 2: Reinstall (if upgrade doesn't work)**

```bash
# Uninstall current version
brew uninstall --cask secret-guardian

# Reinstall latest version
brew install --cask secret-guardian
```

**Method 3: Force reinstall**

```bash
# Force reinstall even if already at latest version
brew reinstall --cask secret-guardian
```

**Check current version:**

```bash
# Check installed version
brew info --cask secret-guardian

# Or check in the app
# Open Secret Guardian → Right-click tray icon → Check version in menu
```

**Auto-update check:**

The cask includes `livecheck` which automatically checks for new versions:

```bash
# Check if update is available
brew outdated --cask secret-guardian
```

---

## Updating the Homebrew Cask (For Maintainers)

When you release a new version, you need to update the Homebrew cask file.

### Step-by-Step Update Process

#### Step 1: Build and Release New Version

```bash
# 1. Build the app
npm run make

# 2. Create GitHub release
./scripts/create-release.sh v1.1.0
```

**Note:** Replace `v1.1.0` with your actual version number.

#### Step 2: Calculate SHA256 Checksum

```bash
# Calculate checksum for the new DMG file
shasum -a 256 out/make/secret-guardian-1.1.0-arm64.dmg

# Output example:
# 2f926caa4180e031814138633e9fa767209f42477461a3ea622d3db4569f3c2e  out/make/secret-guardian-1.1.0-arm64.dmg
```

**Copy the checksum** (the long string before the filename).

#### Step 3: Update the Cask File

Navigate to your Homebrew tap repository:

```bash
# If you haven't cloned it yet
git clone https://github.com/prakash912/homebrew-cask.git
cd homebrew-cask

# Or if already cloned, navigate to it
cd ~/path/to/homebrew-cask
```

Edit the cask file:

```bash
# Open the cask file
nano Casks/secret-guardian.rb
# or
code Casks/secret-guardian.rb
```

**Update these fields:**

```ruby
cask "secret-guardian" do
  version "1.1.0"  # ← Update version number
  sha256 "2f926caa4180e031814138633e9fa767209f42477461a3ea622d3db4569f3c2e"  # ← Update checksum

  url "https://github.com/prakash912/secret-guardian/releases/download/v#{version}/secret-guardian-#{version}-arm64.dmg",
      verified: "github.com/prakash912/secret-guardian/"
  # ... rest stays the same
end
```

**Important:** 
- Update `version` to the new version (e.g., `"1.1.0"`)
- Update `sha256` to the new checksum you calculated
- The URL uses `#{version}` so it will automatically use the new version

#### Step 4: Test the Cask Locally

Before pushing, test that the cask works:

```bash
# Check cask syntax
brew style --fix Casks/secret-guardian.rb

# Test installation (dry run)
brew install --cask --dry-run secret-guardian

# Test actual installation (if you want to verify)
brew install --cask --build-from-source Casks/secret-guardian.rb
```

#### Step 5: Commit and Push

```bash
# Check what changed
git diff Casks/secret-guardian.rb

# Stage the changes
git add Casks/secret-guardian.rb

# Commit with descriptive message
git commit -m "Update Secret Guardian to v1.1.0"

# Push to GitHub
git push origin main
```

#### Step 6: Verify Update is Available

After pushing, wait a few minutes for Homebrew to index your tap, then:

```bash
# Update Homebrew
brew update

# Check if new version is available
brew outdated --cask secret-guardian

# Should show: secret-guardian (1.0.0 -> 1.1.0)
```

### Automated Update Script

You can create a script to automate the update process:

```bash
#!/bin/bash
# scripts/update-homebrew-cask.sh

set -e

VERSION=$1
TAP_REPO_PATH="../homebrew-cask"  # Adjust path to your tap repo

if [ -z "$VERSION" ]; then
    echo "Error: Version required"
    echo "Usage: ./scripts/update-homebrew-cask.sh v1.1.0"
    exit 1
fi

# Remove 'v' prefix if present
VERSION_NUMBER=${VERSION#v}

echo "🔄 Updating Homebrew cask to version $VERSION_NUMBER"

# Find DMG file
DMG_FILE=$(find out/make -name "secret-guardian-${VERSION_NUMBER}-*.dmg" | head -1)

if [ -z "$DMG_FILE" ]; then
    echo "❌ Error: DMG file not found for version $VERSION_NUMBER"
    echo "Make sure you've built the app: npm run make"
    exit 1
fi

echo "📦 Found DMG: $DMG_FILE"

# Calculate SHA256
echo "🔐 Calculating SHA256 checksum..."
SHA256=$(shasum -a 256 "$DMG_FILE" | awk '{print $1}')
echo "✅ Checksum: $SHA256"

# Update cask file
CASK_FILE="$TAP_REPO_PATH/Casks/secret-guardian.rb"

if [ ! -f "$CASK_FILE" ]; then
    echo "❌ Error: Cask file not found at $CASK_FILE"
    exit 1
fi

# Backup original
cp "$CASK_FILE" "$CASK_FILE.bak"

# Update version and SHA256 using sed
sed -i '' "s/version \".*\"/version \"$VERSION_NUMBER\"/" "$CASK_FILE"
sed -i '' "s/sha256 \".*\"/sha256 \"$SHA256\"/" "$CASK_FILE"

echo "✅ Updated cask file:"
echo "   Version: $VERSION_NUMBER"
echo "   SHA256: $SHA256"

# Show diff
echo ""
echo "📋 Changes:"
git -C "$TAP_REPO_PATH" diff Casks/secret-guardian.rb || echo "   (Not in git repo or no changes)"

echo ""
echo "📝 Next steps:"
echo "1. Review the changes: git diff $CASK_FILE"
echo "2. Test: cd $TAP_REPO_PATH && brew style --fix Casks/secret-guardian.rb"
echo "3. Commit: git add Casks/secret-guardian.rb && git commit -m 'Update Secret Guardian to v$VERSION_NUMBER'"
echo "4. Push: git push origin main"
```

**Save as:** `scripts/update-homebrew-cask.sh`

**Make executable:**
```bash
chmod +x scripts/update-homebrew-cask.sh
```

**Usage:**
```bash
# After building and releasing
./scripts/update-homebrew-cask.sh v1.1.0
```

---

## Complete Removal

### Standard Removal (Homebrew)

**Basic uninstall:**

```bash
brew uninstall --cask secret-guardian
```

This removes:
- The app from `/Applications/secret-guardian.app`
- Homebrew cask metadata

**But it does NOT remove:**
- User data and preferences
- Application support files
- Configuration files

### Complete Removal (All Files)

To completely remove Secret Guardian and all its data:

#### Step 1: Uninstall via Homebrew

```bash
brew uninstall --cask secret-guardian
```

#### Step 2: Remove Application Data

```bash
# Remove application support files
rm -rf ~/Library/Application\ Support/secret-guardian

# Remove preferences
rm -f ~/Library/Preferences/com.secretguardian.app.plist

# Remove saved application state
rm -rf ~/Library/Saved\ Application\ State/com.secretguardian.app.savedState

# Remove logs (if any)
rm -rf ~/Library/Logs/secret-guardian

# Remove cache (if any)
rm -rf ~/Library/Caches/com.secretguardian.app
```

#### Step 3: Remove Configuration Files

```bash
# Remove config file (if exists)
rm -f ~/Library/Application\ Support/secret-guardian/config.json

# Remove clipboard history (if stored locally)
rm -f ~/Library/Application\ Support/secret-guardian/history.json
```

#### Step 4: Remove from Keychain (if used)

If the app stored encryption keys in Keychain:

```bash
# List Secret Guardian items in Keychain
security find-generic-password -s "SecretGuardian" 2>/dev/null

# Remove all Secret Guardian keys (be careful!)
security delete-generic-password -s "SecretGuardian" 2>/dev/null
```

#### Step 5: Verify Removal

```bash
# Check if app is still installed
ls -la /Applications/secret-guardian.app

# Check if Homebrew still knows about it
brew list --cask | grep secret-guardian

# Check for remaining files
find ~/Library -name "*secret*guardian*" -o -name "*secretguardian*" 2>/dev/null
```

### Automated Complete Removal Script

Create a script for complete removal:

```bash
#!/bin/bash
# scripts/complete-removal.sh

set -e

echo "🗑️  Complete Removal of Secret Guardian"
echo ""

# Step 1: Uninstall via Homebrew
echo "1️⃣  Uninstalling via Homebrew..."
if brew list --cask secret-guardian &>/dev/null; then
    brew uninstall --cask secret-guardian
    echo "   ✅ Removed via Homebrew"
else
    echo "   ℹ️  Not installed via Homebrew"
fi

# Step 2: Remove application files
echo ""
echo "2️⃣  Removing application files..."

DIRS=(
    "$HOME/Library/Application Support/secret-guardian"
    "$HOME/Library/Saved Application State/com.secretguardian.app.savedState"
    "$HOME/Library/Logs/secret-guardian"
    "$HOME/Library/Caches/com.secretguardian.app"
)

FILES=(
    "$HOME/Library/Preferences/com.secretguardian.app.plist"
    "$HOME/Library/Application Support/secret-guardian/config.json"
    "$HOME/Library/Application Support/secret-guardian/history.json"
)

for dir in "${DIRS[@]}"; do
    if [ -d "$dir" ]; then
        rm -rf "$dir"
        echo "   ✅ Removed: $dir"
    fi
done

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        rm -f "$file"
        echo "   ✅ Removed: $file"
    fi
done

# Step 3: Remove from Keychain
echo ""
echo "3️⃣  Removing from Keychain..."
if security find-generic-password -s "SecretGuardian" &>/dev/null; then
    security delete-generic-password -s "SecretGuardian" 2>/dev/null
    echo "   ✅ Removed Keychain entries"
else
    echo "   ℹ️  No Keychain entries found"
fi

# Step 4: Verify
echo ""
echo "4️⃣  Verifying removal..."

REMAINING=$(find ~/Library -name "*secret*guardian*" -o -name "*secretguardian*" 2>/dev/null | wc -l)

if [ "$REMAINING" -eq 0 ]; then
    echo "   ✅ All files removed"
else
    echo "   ⚠️  Found $REMAINING remaining file(s):"
    find ~/Library -name "*secret*guardian*" -o -name "*secretguardian*" 2>/dev/null
fi

# Step 5: Check app
if [ -d "/Applications/secret-guardian.app" ]; then
    echo "   ⚠️  App still exists in /Applications/"
    echo "   Run manually: rm -rf /Applications/secret-guardian.app"
else
    echo "   ✅ App removed from /Applications/"
fi

echo ""
echo "✅ Complete removal finished!"
echo ""
echo "Note: If you want to remove the Homebrew tap as well:"
echo "  brew untap prakash912/homebrew-cask"
```

**Save as:** `scripts/complete-removal.sh`

**Make executable:**
```bash
chmod +x scripts/complete-removal.sh
```

**Usage:**
```bash
./scripts/complete-removal.sh
```

### Remove Homebrew Tap (Optional)

If you want to remove the tap repository from Homebrew:

```bash
# Remove the tap
brew untap prakash912/homebrew-cask

# Verify it's removed
brew tap list | grep homebrew-cask
```

---

## Troubleshooting

### Issue: "No available formula or cask"

**Problem:** Homebrew can't find the cask.

**Solutions:**

```bash
# 1. Make sure you've tapped the repository
brew tap prakash912/homebrew-cask

# 2. Update Homebrew
brew update

# 3. Verify tap is installed
brew tap list | grep homebrew-cask

# 4. Try full path
brew install --cask prakash912/homebrew-cask/secret-guardian
```

### Issue: "SHA256 mismatch"

**Problem:** The checksum in the cask doesn't match the DMG file.

**Solutions:**

```bash
# 1. Recalculate checksum
shasum -a 256 /path/to/secret-guardian-X.X.X-arm64.dmg

# 2. Update the cask file with correct checksum
# Edit: Casks/secret-guardian.rb
# Update: sha256 "correct-checksum-here"

# 3. Commit and push the fix
git add Casks/secret-guardian.rb
git commit -m "Fix SHA256 checksum"
git push
```

### Issue: "App not found in DMG"

**Problem:** The app bundle name doesn't match.

**Solutions:**

```bash
# 1. Open the DMG and check the exact app name
open /path/to/secret-guardian-X.X.X-arm64.dmg

# 2. Update the cask file
# Edit: Casks/secret-guardian.rb
# Update: app "exact-app-name.app"

# 3. Commit and push
```

### Issue: "URL not accessible"

**Problem:** GitHub release URL is incorrect or release doesn't exist.

**Solutions:**

```bash
# 1. Verify the release exists
gh release view v1.0.0

# 2. Check the URL format in cask file
# Should be: https://github.com/prakash912/secret-guardian/releases/download/v#{version}/secret-guardian-#{version}-arm64.dmg

# 3. Test URL manually
curl -I "https://github.com/prakash912/secret-guardian/releases/download/v1.0.0/secret-guardian-1.0.0-arm64.dmg"
```

### Issue: Update not showing up

**Problem:** Homebrew shows old version after updating cask.

**Solutions:**

```bash
# 1. Force update Homebrew
brew update --force

# 2. Clear Homebrew cache
brew cleanup

# 3. Re-tap the repository
brew untap prakash912/homebrew-cask
brew tap prakash912/homebrew-cask

# 4. Check for updates
brew outdated --cask secret-guardian
```

### Issue: App won't uninstall completely

**Problem:** Some files remain after uninstall.

**Solutions:**

```bash
# 1. Use the complete removal script
./scripts/complete-removal.sh

# 2. Or manually remove remaining files
find ~/Library -name "*secret*guardian*" -delete

# 3. Remove from Keychain
security delete-generic-password -s "SecretGuardian" 2>/dev/null
```

### Issue: "Permission denied" during installation

**Problem:** macOS security restrictions.

**Solutions:**

```bash
# 1. Allow Homebrew in System Settings
# System Settings → Privacy & Security → Allow Homebrew

# 2. Or install with sudo (not recommended)
sudo brew install --cask secret-guardian

# 3. Check Gatekeeper status
spctl --assess --verbose /Applications/secret-guardian.app
```

---

## Quick Reference

### Installation
```bash
brew tap prakash912/homebrew-cask
brew install --cask secret-guardian
```

### Update
```bash
brew update
brew upgrade --cask secret-guardian
```

### Check Version
```bash
brew info --cask secret-guardian
```

### Uninstall
```bash
brew uninstall --cask secret-guardian
```

### Complete Removal
```bash
./scripts/complete-removal.sh
```

### Update Cask (Maintainer)
```bash
# 1. Calculate checksum
shasum -a 256 out/make/secret-guardian-X.X.X-arm64.dmg

# 2. Update Casks/secret-guardian.rb
# 3. Test: brew style --fix Casks/secret-guardian.rb
# 4. Commit and push
```

---

## File Locations Reference

### Application Files
- **App:** `/Applications/secret-guardian.app`
- **Application Support:** `~/Library/Application Support/secret-guardian/`
- **Preferences:** `~/Library/Preferences/com.secretguardian.app.plist`
- **Saved State:** `~/Library/Saved Application State/com.secretguardian.app.savedState/`
- **Logs:** `~/Library/Logs/secret-guardian/`
- **Cache:** `~/Library/Caches/com.secretguardian.app/`

### Configuration Files
- **Config:** `~/Library/Application Support/secret-guardian/config.json`
- **History:** `~/Library/Application Support/secret-guardian/history.json`

### Keychain
- **Service:** `SecretGuardian`
- **Account:** Various (encryption keys, etc.)

---

## Maintenance Checklist

When releasing a new version:

- [ ] Build the app: `npm run make`
- [ ] Create GitHub release: `./scripts/create-release.sh vX.X.X`
- [ ] Calculate SHA256: `shasum -a 256 out/make/secret-guardian-X.X.X-arm64.dmg`
- [ ] Update cask file: `Casks/secret-guardian.rb`
  - [ ] Update `version`
  - [ ] Update `sha256`
- [ ] Test cask: `brew style --fix Casks/secret-guardian.rb`
- [ ] Commit changes: `git commit -m "Update Secret Guardian to vX.X.X"`
- [ ] Push to GitHub: `git push origin main`
- [ ] Verify update: `brew update && brew outdated --cask secret-guardian`
- [ ] Test installation: `brew install --cask secret-guardian` (on clean system)

---

## Support Multiple Architectures

If you build for both Intel and Apple Silicon, update the cask:

```ruby
cask "secret-guardian" do
  version "1.1.0"
  
  if Hardware::CPU.intel?
    url "https://github.com/prakash912/secret-guardian/releases/download/v#{version}/secret-guardian-#{version}-x64.dmg",
        verified: "github.com/prakash912/secret-guardian/"
    sha256 "intel-checksum-here"
  else
    url "https://github.com/prakash912/secret-guardian/releases/download/v#{version}/secret-guardian-#{version}-arm64.dmg",
        verified: "github.com/prakash912/secret-guardian/"
    sha256 "arm-checksum-here"
  end
  
  name "Secret Guardian"
  desc "Desktop app that monitors your clipboard and alerts you when you copy sensitive data"
  homepage "https://github.com/prakash912/secret-guardian"
  
  app "secret-guardian.app"
  
  zap trash: [
    "~/Library/Application Support/secret-guardian",
    "~/Library/Preferences/com.secretguardian.app.plist",
    "~/Library/Saved Application State/com.secretguardian.app.savedState",
  ]
end
```

---

## Conclusion

This guide covers:

1. ✅ **Installation** - How users install via Homebrew
2. ✅ **Updates** - How to update the app and the cask
3. ✅ **Removal** - Complete removal of all files
4. ✅ **Troubleshooting** - Common issues and solutions
5. ✅ **Maintenance** - Checklist for releasing updates

For questions or issues, check the troubleshooting section or refer to the Homebrew documentation.
