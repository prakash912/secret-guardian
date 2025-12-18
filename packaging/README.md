# Package Manager Distribution

This directory contains configuration files for distributing Secret Guardian through various package managers.

## Homebrew (macOS)

### Quick Setup (Automated)

**Option 1: Use the setup script (Easiest)**
```bash
./packaging/homebrew/setup-tap.sh
```

This script will:
- Create a GitHub repository for your tap
- Set up the cask file (already configured with your info)
- Create a README
- Push everything to GitHub

### Manual Setup

See the complete guide: **[homebrew/HOMEBREW_SETUP.md](homebrew/HOMEBREW_SETUP.md)**

**Quick steps:**
1. **Create your own tap** (recommended):
   - Create a GitHub repo named `homebrew-cask`
   - Copy `Casks/secret-guardian.rb` to the repo
   - Users install with: `brew tap prakash912/homebrew-cask && brew install --cask secret-guardian`

2. **Or submit to official Homebrew Cask**:
   - Fork https://github.com/Homebrew/homebrew-cask
   - Add your cask file
   - Submit a pull request

**The cask file is already configured** with:
- ✅ Correct GitHub username (prakash912)
- ✅ SHA256 checksum
- ✅ Download URL
- ✅ Auto-update support

**Users install with:**
```bash
# If using your tap:
brew tap prakash912/homebrew-cask
brew install --cask secret-guardian

# If accepted to official Homebrew:
brew install --cask secret-guardian
```

## Chocolatey (Windows)

### Setup Instructions

1. **Install Chocolatey CLI** (if not already installed):
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force
   [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
   iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   ```

2. **Update package files**:
   - Replace `YOUR_USERNAME` in `secret-guardian.nuspec` and `chocolateyinstall.ps1`
   - Calculate SHA256 checksum: `certutil -hashfile secret-guardian-1.0.0-x64.exe SHA256`
   - Update checksum in `chocolateyinstall.ps1`

3. **Test locally**:
   ```powershell
   choco pack packaging/chocolatey/secret-guardian.nuspec
   choco install secret-guardian -s . --force
   ```

4. **Publish to Chocolatey**:
   - Create account at https://chocolatey.org
   - Get API key from your account page
   - Push package:
     ```powershell
     choco push secret-guardian.1.0.0.nupkg --api-key YOUR_API_KEY --source https://push.chocolatey.org/
     ```

5. **Users install with**:
   ```powershell
   choco install secret-guardian
   ```

## Snap (Linux)

### Setup Instructions

1. **Install Snapcraft**:
   ```bash
   sudo snap install snapcraft --classic
   ```

2. **Update snapcraft.yaml**:
   - Replace `YOUR_USERNAME` with your GitHub username
   - Update source URL to point to your Linux build
   - You may need to create a tar.gz of your Linux build

3. **Build snap**:
   ```bash
   cd packaging/snap
   snapcraft
   ```

4. **Test locally**:
   ```bash
   sudo snap install secret-guardian_1.0.0_amd64.snap --dangerous
   ```

5. **Publish to Snap Store**:
   - Create account at https://snapcraft.io
   - Register your app name:
     ```bash
     snapcraft register secret-guardian
     ```
   - Upload:
     ```bash
     snapcraft upload secret-guardian_1.0.0_amd64.snap
     snapcraft release secret-guardian 1.0.0 stable
     ```

6. **Users install with**:
   ```bash
   sudo snap install secret-guardian
   ```

## Flatpak (Linux)

### Setup Instructions

1. **Install Flatpak and Builder**:
   ```bash
   sudo apt install flatpak flatpak-builder
   # Or on Fedora:
   sudo dnf install flatpak flatpak-builder
   ```

2. **Update manifest**:
   - Replace `YOUR_USERNAME` with your GitHub username
   - Calculate SHA256 checksum of your Linux build
   - Update checksum in `com.secretguardian.app.yml`

3. **Build Flatpak**:
   ```bash
   cd packaging/flatpak
   flatpak-builder --repo=repo build com.secretguardian.app.yml
   flatpak build-bundle repo secret-guardian.flatpak com.secretguardian.app
   ```

4. **Test locally**:
   ```bash
   flatpak install secret-guardian.flatpak
   flatpak run com.secretguardian.app
   ```

5. **Publish to Flathub** (optional):
   - Fork https://github.com/flathub/flathub
   - Add your manifest
   - Submit pull request

6. **Users install with**:
   ```bash
   flatpak install flathub com.secretguardian.app
   # Or if hosting your own repo:
   flatpak install --from https://your-domain.com/secret-guardian.flatpak
   ```

## General Notes

- **Version Updates**: Update version numbers in all files when releasing new versions
- **Checksums**: Always calculate and verify checksums for security
- **Testing**: Test each package manager installation on clean systems before publishing
- **Automation**: Consider using GitHub Actions to automate package building and publishing

## GitHub Actions Automation

You can automate package building and publishing using GitHub Actions. See the main README for CI/CD setup examples.

