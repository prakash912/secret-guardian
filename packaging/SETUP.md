# Quick Setup Guide for Package Managers

## Before You Start

1. **Replace placeholders**: Search and replace `YOUR_USERNAME` in all files with your actual GitHub username
2. **Build your app**: Run `npm run make` to create installers
3. **Calculate checksums**: Use the provided scripts or commands below

## Quick Commands

### Calculate Checksums

**macOS/Linux:**
```bash
# For DMG (macOS)
shasum -a 256 out/make/secret-guardian-1.0.0-arm64.dmg

# For DEB (Linux)
shasum -a 256 out/make/secret-guardian_1.0.0_amd64.deb

# For RPM (Linux)
shasum -a 256 out/make/secret-guardian-1.0.0.x86_64.rpm
```

**Windows (PowerShell):**
```powershell
# For EXE
certutil -hashfile out\make\secret-guardian-1.0.0-x64.exe SHA256
```

## Setup Checklist

### Homebrew
- [ ] Update `packaging/homebrew/Casks/secret-guardian.rb` with correct URL and SHA256
- [ ] Test locally: `brew install --cask packaging/homebrew/Casks/secret-guardian.rb`
- [ ] Submit to Homebrew Cask or create your own tap

### Chocolatey
- [ ] Update `packaging/chocolatey/secret-guardian.nuspec` with your info
- [ ] Update `packaging/chocolatey/tools/chocolateyinstall.ps1` with URL and SHA256
- [ ] Test: `choco pack packaging/chocolatey/secret-guardian.nuspec`
- [ ] Create Chocolatey account and publish

### Snap
- [ ] Update `packaging/snap/snapcraft.yaml` with correct source URL
- [ ] Build: `cd packaging/snap && snapcraft`
- [ ] Test: `sudo snap install secret-guardian_1.0.0_amd64.snap --dangerous`
- [ ] Register and publish to Snap Store

### Flatpak
- [ ] Update `packaging/flatpak/com.secretguardian.app.yml` with URL and SHA256
- [ ] Build: `cd packaging/flatpak && flatpak-builder --repo=repo build com.secretguardian.app.yml`
- [ ] Test locally
- [ ] Submit to Flathub or host your own repo

## Next Steps

1. **First Release**: Start with GitHub Releases (Option A) - it's the easiest
2. **Package Managers**: Add package managers one at a time after your first release
3. **Automation**: Set up GitHub Actions to automate building and publishing

See `packaging/README.md` for detailed instructions for each package manager.

