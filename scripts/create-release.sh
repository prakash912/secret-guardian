#!/bin/bash

# Script to create a GitHub release with all built files
# Usage: ./scripts/create-release.sh v1.0.0

set -e

VERSION=$1

if [ -z "$VERSION" ]; then
    echo "Error: Version tag required"
    echo "Usage: ./scripts/create-release.sh v1.0.0"
    exit 1
fi

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed"
    echo "Install it with: brew install gh"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "Error: Not authenticated with GitHub"
    echo "Run: gh auth login"
    exit 1
fi

# Check if out/make directory exists
if [ ! -d "out/make" ]; then
    echo "Error: out/make directory not found"
    echo "Run: npm run make"
    exit 1
fi

echo "Creating release $VERSION..."

# Collect all files in out/make (excluding directories)
FILES=()
while IFS= read -r -d '' file; do
    FILES+=("$file")
done < <(find out/make -maxdepth 1 -type f -print0)

if [ ${#FILES[@]} -eq 0 ]; then
    echo "Error: No files found in out/make"
    exit 1
fi

echo "Found ${#FILES[@]} file(s) to upload:"
for file in "${FILES[@]}"; do
    echo "  - $(basename "$file") ($(du -h "$file" | cut -f1))"
done

# Create release notes
NOTES="## 🎉 Secret Guardian $VERSION

### Features
- 🔍 Automatic clipboard monitoring
- 🚨 Smart secret detection alerts
- 🔐 Pattern recognition for AWS keys, GitHub tokens, JWTs, and more
- 💻 System tray integration
- 🔕 Non-intrusive notifications

### Installation
Download the installer for your platform from the assets below.

**Full Changelog**: https://github.com/prakash912/secret-guardian/commits/$VERSION"

# Create the release
echo ""
echo "Creating release..."
gh release create "$VERSION" \
    --title "$VERSION" \
    --notes "$NOTES" \
    "${FILES[@]}"

echo ""
echo "✅ Release created successfully!"
echo "View it at: https://github.com/prakash912/secret-guardian/releases/tag/$VERSION"


