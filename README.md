# Secret Guardian 🛡️

A desktop application that monitors your clipboard and alerts you when you copy sensitive data like API keys, tokens, or secrets. Helps prevent accidentally sharing sensitive information.

## Features

- 🔍 **Automatic Detection**: Monitors clipboard in real-time
- 🚨 **Smart Alerts**: Notifies you when secrets are detected
- 🔐 **Pattern Recognition**: Detects AWS keys, GitHub tokens, JWTs, private keys, and high-entropy secrets
- 💻 **System Tray**: Runs quietly in the background
- 🔕 **Non-Intrusive**: Only alerts when sensitive data is detected

## Installation

### Option 1: Download Pre-built Installers

**For macOS:**
- **Option 1 - Homebrew (Recommended):**
  ```bash
  brew install --cask secret-guardian
  ```
- **Option 2 - Manual Install:**
  - Download the `.dmg` file from [Releases](https://github.com/YOUR_USERNAME/secret-guardian/releases)
  - Open the `.dmg` file
  - Drag `Secret Guardian` to your Applications folder
  - Open from Applications (you may need to allow it in System Preferences > Security)

**For Windows:**
- **Option 1 - Chocolatey (Recommended):**
  ```powershell
  choco install secret-guardian
  ```
- **Option 2 - Manual Install:**
  - Download the `.exe` installer from [Releases](https://github.com/YOUR_USERNAME/secret-guardian/releases)
  - Run the installer
  - Launch Secret Guardian from Start Menu

**For Linux:**
- **Option 1 - Snap (Recommended):**
  ```bash
  sudo snap install secret-guardian
  ```
- **Option 2 - Flatpak:**
  ```bash
  flatpak install flathub com.secretguardian.app
  ```
- **Option 3 - Manual Install:**
  - Download the `.deb` (Debian/Ubuntu) or `.rpm` (Fedora/RHEL) file from [Releases](https://github.com/YOUR_USERNAME/secret-guardian/releases)
  - Install using your package manager:
    ```bash
    # For .deb files
    sudo dpkg -i secret-guardian*.deb
    
    # For .rpm files
    sudo rpm -i secret-guardian*.rpm
    ```

### Option 2: Build from Source

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/secret-guardian.git
   cd secret-guardian
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm start
   ```

4. Build installers for your platform:
   ```bash
   npm run make
   ```

   The installers will be in the `out/make/` directory.

## How to Deploy (Make it Live)

### Step 1: Build Installers for All Platforms

To build installers for all platforms, you'll need to run the build on each platform (or use CI/CD):

```bash
# Build for current platform
npm run make

# This creates installers in out/make/
```

### Step 2: Host the Installers

#### Option A: GitHub Releases (Recommended - Free)

1. **Create a GitHub repository** (if you haven't already):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/secret-guardian.git
   git push -u origin main
   ```

2. **Create a release**:
   - Go to your repository on GitHub
   - Click "Releases" → "Create a new release"
   - Tag version (e.g., `v1.0.0`)
   - Upload all installer files from `out/make/`
   - Add release notes
   - Publish the release

3. **Share the link**: Users can download from `https://github.com/YOUR_USERNAME/secret-guardian/releases`

#### Option B: Your Own Website

1. Upload installer files to your web server
2. Create a download page with links to each installer
3. Optionally add auto-update support using Electron's auto-updater

#### Option C: Package Managers

Distribute through package managers for easy installation:

**Homebrew (macOS):**
```bash
brew install --cask secret-guardian
# Or if using a custom tap:
brew tap YOUR_USERNAME/homebrew-cask
brew install --cask secret-guardian
```

**Chocolatey (Windows):**
```powershell
choco install secret-guardian
```

**Snap (Linux):**
```bash
sudo snap install secret-guardian
```

**Flatpak (Linux):**
```bash
flatpak install flathub com.secretguardian.app
```

See `packaging/README.md` for detailed setup instructions for each package manager.

### Step 3: Set Up Auto-Updates (Optional)

To enable automatic updates, you'll need to:

1. Set up an update server (e.g., using `electron-updater` with GitHub Releases)
2. Configure the app to check for updates on startup
3. This requires additional setup - see [electron-updater documentation](https://www.electron.build/auto-update)

### Step 4: Create a Landing Page (Optional)

Create a simple website that:
- Explains what Secret Guardian does
- Provides download links for each platform
- Shows screenshots or demo

You can host this on:
- **Vercel** (free): `vercel deploy`
- **Netlify** (free): `netlify deploy`
- **GitHub Pages** (free): Enable in repository settings
- **Your own domain**

## Development

### Project Structure

```
secret-guardian/
├── src/
│   ├── main.ts          # Main Electron process
│   ├── renderer.ts      # Renderer process
│   ├── preload.ts       # Preload script
│   ├── detectSecrets.ts # Secret detection logic
│   └── assets/          # Icons and images
├── forge.config.ts      # Electron Forge configuration
└── package.json
```

### Scripts

- `npm start` - Run in development mode
- `npm run package` - Package the app (no installers)
- `npm run make` - Build installers for current platform
- `npm run lint` - Run ESLint

## How It Works

Secret Guardian runs in the background and:

1. Monitors your clipboard every 500ms
2. Checks copied text against known patterns (AWS keys, GitHub tokens, etc.)
3. Calculates entropy for generic secret detection
4. Shows a notification if sensitive data is detected
5. Remembers seen secrets for 5 minutes to avoid spam

## Privacy

- **No data is sent anywhere** - everything runs locally
- **No network access** - completely offline
- **No logging** - clipboard data is never stored

## License

MIT

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

