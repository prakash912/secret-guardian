# Complete Homebrew Cask Setup Guide

This guide will walk you through setting up Secret Guardian on Homebrew Cask so users can install it with `brew install --cask secret-guardian`.

## Prerequisites

1. ✅ Your app is built and released on GitHub
2. ✅ You have a GitHub release with the DMG file
3. ✅ You have the SHA256 checksum of your DMG file

## Option 1: Create Your Own Tap (Easiest & Recommended)

A "tap" is a GitHub repository that contains Homebrew formulas/casks. This is the easiest way to get started.

### Step 1: Create a GitHub Repository for Your Tap

1. Go to GitHub and create a new repository named `homebrew-cask` (or `homebrew-secret-guardian`)
   - Repository name: `homebrew-cask`
   - Description: "Homebrew cask for Secret Guardian"
   - Make it **Public**
   - Don't initialize with README

2. Clone it locally:
   ```bash
   git clone https://github.com/prakash912/homebrew-cask.git
   cd homebrew-cask
   ```

### Step 2: Set Up the Repository Structure

```bash
# Create the Casks directory
mkdir -p Casks

# Copy your cask file
cp ../secret-guardian/packaging/homebrew/Casks/secret-guardian.rb Casks/

# Or create it directly
cat > Casks/secret-guardian.rb << 'EOF'
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
EOF
```

### Step 3: Create a README

```bash
cat > README.md << 'EOF'
# Homebrew Cask for Secret Guardian

Install Secret Guardian via Homebrew:

```bash
brew tap prakash912/homebrew-cask
brew install --cask secret-guardian
```

## Updating

When a new version is released, update the cask file with:
- New version number
- New SHA256 checksum (calculate with: `shasum -a 256 secret-guardian-X.X.X-arm64.dmg`)
EOF
```

### Step 4: Commit and Push

```bash
git add .
git commit -m "Add Secret Guardian cask"
git push -u origin main
```

### Step 5: Test Your Tap

```bash
# Tap your repository
brew tap prakash912/homebrew-cask

# Install the cask
brew install --cask secret-guardian

# Verify it works
brew list --cask | grep secret-guardian
```

### Step 6: Share with Users

Users can now install with:
```bash
brew tap prakash912/homebrew-cask
brew install --cask secret-guardian
```

Or in one command:
```bash
brew install --cask prakash912/homebrew-cask/secret-guardian
```

## Option 2: Submit to Official Homebrew Cask (More Work, But Official)

This makes your app available in the official Homebrew Cask repository, so users can install with just `brew install --cask secret-guardian` without needing to tap.

### Step 1: Fork the Official Repository

1. Go to https://github.com/Homebrew/homebrew-cask
2. Click "Fork" to create your own fork

### Step 2: Clone Your Fork

```bash
git clone https://github.com/prakash912/homebrew-cask.git
cd homebrew-cask
```

### Step 3: Add Your Cask

```bash
# Create your cask file
cp ../secret-guardian/packaging/homebrew/Casks/secret-guardian.rb Casks/secret-guardian.rb

# Or create it directly in the Casks directory
```

### Step 4: Test Locally

```bash
# Test the cask syntax
brew style --fix Casks/secret-guardian.rb

# Test installation
brew install --cask --build-from-source Casks/secret-guardian.rb

# Or test from your fork
brew install --cask prakash912/homebrew-cask/secret-guardian
```

### Step 5: Submit a Pull Request

1. Commit your changes:
   ```bash
   git checkout -b add-secret-guardian
   git add Casks/secret-guardian.rb
   git commit -m "Add cask for Secret Guardian"
   git push origin add-secret-guardian
   ```

2. Go to your fork on GitHub and click "New Pull Request"

3. Fill out the PR template with:
   - Description of your app
   - Why it's useful
   - Any relevant links

4. Wait for review (Homebrew maintainers will check it)

### Requirements for Official Cask

- ✅ App must be open source or have a free version
- ✅ App must be actively maintained
- ✅ DMG must be properly signed (optional but recommended)
- ✅ Follow Homebrew Cask naming conventions
- ✅ Pass all style checks

## Updating Your Cask

When you release a new version:

### For Your Own Tap:

1. Update the cask file with new version and SHA256:
   ```bash
   # Calculate new checksum
   shasum -a 256 out/make/secret-guardian-1.1.0-arm64.dmg
   ```

2. Update `version` and `sha256` in the cask file

3. Commit and push:
   ```bash
   git add Casks/secret-guardian.rb
   git commit -m "Update Secret Guardian to v1.1.0"
   git push
   ```

### For Official Cask:

1. Update your fork
2. Update the cask file
3. Submit a new PR

## Cask File Explanation

```ruby
cask "secret-guardian" do
  version "1.0.0"                    # Current version
  sha256 "..."                       # SHA256 checksum of DMG file
  
  url "https://github.com/..."      # Download URL (supports #{version} variable)
  verified: "github.com/..."        # Domain verification for security
  
  name "Secret Guardian"            # Display name
  desc "Description here"            # Short description
  homepage "https://..."            # Project homepage
  
  livecheck do                       # Auto-update checking
    url :url
    strategy :github_latest
  end
  
  app "secret-guardian.app"         # App bundle name inside DMG
  
  zap trash: [...]                   # Files to remove on uninstall
end
```

## Troubleshooting

### "No available formula or cask"
- Make sure you've tapped your repository: `brew tap prakash912/homebrew-cask`
- Check the cask file name matches: `secret-guardian.rb`

### "SHA256 mismatch"
- Recalculate the checksum: `shasum -a 256 your-file.dmg`
- Update the cask file with the correct checksum

### "App not found in DMG"
- Open the DMG and check the exact app name
- Update the `app "..."` line in the cask file

### "URL not accessible"
- Make sure the GitHub release exists
- Check the URL format matches: `v#{version}` in the URL

## Quick Reference

**Calculate SHA256:**
```bash
shasum -a 256 secret-guardian-1.0.0-arm64.dmg
```

**Test cask locally:**
```bash
brew install --cask --build-from-source Casks/secret-guardian.rb
```

**Check cask syntax:**
```bash
brew style --fix Casks/secret-guardian.rb
```

**Uninstall:**
```bash
brew uninstall --cask secret-guardian
```

## Next Steps

1. ✅ Create your tap repository (Option 1 is easiest)
2. ✅ Add the cask file
3. ✅ Test installation
4. ✅ Share with users
5. (Optional) Submit to official Homebrew Cask later

## Support Multiple Architectures

If you build for both Intel and Apple Silicon, you can add:

```ruby
if Hardware::CPU.intel?
  url "https://github.com/.../secret-guardian-#{version}-x64.dmg"
  sha256 "intel-checksum"
else
  url "https://github.com/.../secret-guardian-#{version}-arm64.dmg"
  sha256 "arm-checksum"
end
```

