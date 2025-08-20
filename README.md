# TooTabTooFurious 🏁

A Chrome extension that uses local AI to automatically organize your browser tabs into smart groups. No API keys required - runs entirely in your browser!

## Features

- **🤖 Local AI-Powered**: Uses WebLLM to run small language models directly in Chrome
- **🚀 Auto-Organization**: Instantly categorize and group all open tabs
- **⚡ Auto Mode**: Automatically organize new tabs as you browse
- **🎯 Smart Categorization**: Groups tabs into categories like Dev, Social, Entertainment, Work, etc.
- **🎨 Customizable**: Set maximum number of groups (2-10)
- **🔒 Privacy-First**: No data leaves your browser - everything runs locally
- **📊 Statistics**: Track your tab organization habits

## Installation

### From Source
1. Clone this repository:
   ```bash
   git clone https://github.com/shaunpatterson/TooTabTooFurious.git
   cd TooTabTooFurious
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right

4. Click "Load unpacked" and select the TooTabTooFurious directory

5. The extension icon will appear in your toolbar!

### Generate Icons
1. Open `icons/generate-icons.html` in Chrome
2. Right-click each canvas and save as PNG with the specified filename
3. Or use the included SVG file to generate PNGs at different sizes

## Usage

### Quick Start
1. Click the TooTabTooFurious icon in your toolbar
2. Click "Organize Tabs Now" to instantly group all open tabs
3. Enable "Auto Mode" to automatically organize new tabs as you browse

### Settings
- **Max Groups**: Set the maximum number of tab groups (2-10, default: 5)
- **Auto Mode**: Automatically organize new tabs as they're opened
- **Collapse Groups**: Automatically collapse tab groups after creation
- **AI Model**: Choose between different local models:
  - Llama 3.2 1B (Fast, Small)
  - Phi 3.5 Mini (Balanced)
  - Gemma 2 2B (Better Quality)

## How It Works

TooTabTooFurious uses WebLLM to run a small language model directly in your browser. When you organize tabs:

1. The extension analyzes all open tabs (title, URL, domain)
2. The local AI model categorizes tabs into logical groups
3. Chrome's Tab Groups API creates colored, named groups
4. Your tabs are instantly organized!

### Default Categories
- **Dev**: GitHub, GitLab, StackOverflow, localhost
- **Social**: Facebook, Twitter, Instagram, LinkedIn
- **Entertainment**: YouTube, Netflix, Spotify, Twitch
- **Work**: Gmail, Google Docs, Office, Notion
- **Cloud**: AWS, Azure, GCP consoles
- **Shopping**: Amazon, eBay, Etsy
- **News**: CNN, BBC, TechCrunch

## Privacy

- ✅ **100% Local**: All AI processing happens in your browser
- ✅ **No API Keys**: No external services or API keys required
- ✅ **No Data Collection**: Your browsing data never leaves your device
- ✅ **Open Source**: Full transparency - review the code yourself

## Technical Details

### Technologies Used
- **WebLLM**: For running LLMs locally in the browser
- **Chrome Extensions Manifest V3**: Modern extension architecture
- **Chrome Tab Groups API**: Native tab grouping functionality
- **ES Modules**: Modern JavaScript module system

### Local AI Models
The extension uses quantized models optimized for browser execution:
- Models are downloaded once and cached locally
- Typical model size: 500MB-1GB
- Inference speed: 10-50 tokens/second

## Development

### Project Structure
```
TooTabTooFurious/
├── manifest.json           # Chrome extension manifest
├── background.js          # Service worker for tab management
├── popup.html/js/css      # Extension popup UI
├── options.html/js/css    # Settings page
├── modules/               # Core functionality
│   ├── LocalLLM.js       # AI model integration
│   ├── TabGroupManager.js # Tab grouping logic
│   └── StorageManager.js  # Settings & data persistence
└── icons/                 # Extension icons
```

### Building from Source
No build step required! The extension runs directly from source.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Author

Created by Shaun Patterson

---

**Note**: First-time loading of the AI model may take a few minutes as it downloads to your browser cache. Subsequent uses will be instant!