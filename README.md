# TooTabbedTooFurious 🏁

A Chrome extension that automatically organizes your browser tabs into smart groups using local AI models (WebLLM with Llama 3.2 8B). Clean, minimal design that matches Chrome's aesthetic.

## Features

- **AI-Powered Tab Grouping**: Uses Llama 3.2 8B model running locally via WebLLM for intelligent categorization
- **WebGPU Acceleration**: Leverages GPU for fast, efficient AI inference
- **Smart Duplicate Prevention**: Merges tabs into existing groups instead of creating duplicates
- **Auto Mode**: Automatically organize new tabs as you browse
- **100% Local Processing**: All AI runs in your browser - no data sent to external servers
- **Configurable Groups**: Set maximum number of groups (2-10, default: 5)
- **Clean UI**: Minimal design that matches Chrome's default theme
- **Statistics Tracking**: Monitor your tab organization habits
- **Fallback Mode**: Smart pattern-based categorization when AI is unavailable

## Prerequisites

### Enable WebGPU in Chrome
**IMPORTANT**: WebGPU must be enabled for AI features to work.

1. Navigate to `chrome://flags`
2. Search for "WebGPU"
3. Enable the following flags:
   - **Unsafe WebGPU Support** (`#enable-unsafe-webgpu`)
   - **WebGPU Developer Features** (`#enable-webgpu-developer-features`)
4. Click "Relaunch" to restart Chrome with WebGPU enabled

To verify WebGPU is working, visit https://webgpureport.org/

## Installation

### 1. Clone the Repository
```bash
git clone https://github.com/shaunpatterson/TooTabbedTooFurious.git
cd TooTabbedTooFurious
```

### 2. Install Dependencies & Build
```bash
npm install
npx webpack
```

### 3. Load the Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" toggle in the top right
3. Click "Load unpacked"
4. Select the TooTabbedTooFurious directory
5. The extension icon will appear in your toolbar

### 4. Pin the Extension (recommended)
- Click the puzzle piece icon in Chrome toolbar
- Click the pin icon next to "TooTabbedTooFurious"

## Usage

### Quick Start
1. Click the TooTabbedTooFurious icon in your toolbar
2. Wait for AI model to load (first time only, ~30 seconds)
3. Click "Organize Tabs Now" to instantly group all open tabs
4. Enable "Auto Mode" to automatically organize new tabs as you browse

### AI Model Status
The extension shows the current AI status in the popup:
- **Loading AI Model...**: Model is being downloaded/initialized (first time only)
- **AI Ready (Llama 8B)**: AI categorization is active
- **Smart Pattern Mode**: Fallback mode using pattern matching (if WebGPU unavailable)

### Settings

Access settings by clicking the extension icon and then "Settings", or right-click the extension icon and select "Options".

- **Maximum Groups**: Set how many tab groups to create (2-10, default: 5)
- **Auto Mode**: Toggle automatic organization of new tabs as you browse
- **Collapse Groups**: Automatically collapse tab groups after creation to save space

## How It Works

### AI-Powered Categorization
1. **Llama 3.2 8B Model**: Uses a powerful language model running entirely in your browser
2. **WebGPU Acceleration**: Leverages your GPU for fast inference (1-2 seconds per tab batch)
3. **Smart Prompting**: Analyzes URLs, titles, and content to intelligently group tabs
4. **Context-Aware**: Understands relationships between different types of content

### Fallback Pattern Matching
When AI is unavailable, the extension uses intelligent pattern matching:
- Domain analysis (e.g., github.com → Dev)
- Title keyword matching
- URL pattern recognition
- Metadata extraction from pages

### Common Categories
The AI model automatically identifies and creates groups like:
- **Development**: GitHub, GitLab, StackOverflow, localhost, CodePen
- **Social Media**: Facebook, Twitter/X, Instagram, LinkedIn, Reddit
- **Entertainment**: YouTube, Netflix, Spotify, Twitch, streaming services
- **Work/Productivity**: Gmail, Outlook, Google Docs, Notion, Slack
- **Shopping**: Amazon, eBay, Etsy, online stores
- **News & Articles**: News sites, blogs, Medium, Substack
- **Documentation**: MDN, API docs, wikis, technical references
- **Finance**: Banking, investing, cryptocurrency
- **Education**: Coursera, Khan Academy, educational content
- And many more based on your browsing patterns!

## Technical Details

### Architecture
- **Chrome Extensions Manifest V3**: Modern, secure extension architecture
- **Service Worker**: Background script with webpack bundling
- **WebLLM Integration**: @mlc-ai/web-llm for local AI inference
- **WebGPU**: Hardware acceleration for AI model execution
- **Chrome APIs**: Tabs, Tab Groups, Storage, and Runtime APIs

### Build System
- **Webpack**: Bundles modules and dependencies
- **Babel**: Transpiles modern JavaScript
- **Source Maps**: For development debugging

### AI Model Details
- **Model**: Llama-3.2-3B-Instruct-q4f16_1-MLC
- **Size**: ~2GB (downloaded once, cached locally)
- **Quantization**: 4-bit for optimal performance/quality balance
- **Context Window**: 4096 tokens
- **Performance**: 1-3 seconds for categorizing 20-30 tabs

### Privacy & Security
- **100% Local**: All AI processing happens in your browser
- **No External APIs**: Never sends your browsing data anywhere
- **No Tracking**: No analytics or telemetry
- **Open Source**: Full transparency - review the code yourself
- **Secure**: Uses Chrome's permission model - only accesses tabs when you click organize

## Development

### Project Structure
```
TooTabbedTooFurious/
├── manifest.json           # Chrome extension manifest
├── background.js           # Service worker (main logic)
├── webpack.config.js       # Webpack bundling configuration
├── dist/                   # Built files
│   └── background.bundle.js
├── modules/                # Core functionality
│   ├── LocalLLM.js        # WebLLM AI integration
│   ├── TabGroupManager.js # Tab grouping logic
│   └── StorageManager.js  # Settings & persistence
├── popup.html/js/css      # Extension popup UI
├── options.html/js/css    # Settings page
├── lib/                   # External libraries
│   └── webllm.bundle.js   # WebLLM library
└── icons/                 # Extension icons
```

### Building from Source
```bash
# Install dependencies
npm install

# Build the extension
npx webpack

# For development with watch mode
npx webpack --watch
```

### Rebuilding After Changes
```bash
npx webpack
```
Then reload the extension in Chrome:
1. Go to `chrome://extensions/`
2. Click the refresh icon on the TooTabbedTooFurious card

## Troubleshooting

### AI Model Not Loading?
1. **Check WebGPU**: Ensure WebGPU flags are enabled in `chrome://flags`
2. **Verify Support**: Visit https://webgpureport.org/ to confirm WebGPU is working
3. **Storage Space**: Model requires ~2GB of storage for initial download
4. **Console Errors**: Check the extension's background page console for errors

### Extension Not Working?
1. Make sure you've enabled Developer Mode in Chrome
2. Check that the extension is enabled in `chrome://extensions/`
3. Try rebuilding with `npx webpack`
4. Reload the extension

### Tabs Not Grouping?
1. Verify Chrome tab groups are enabled (default in modern Chrome)
2. Check that you have ungrouped tabs (extension only organizes loose tabs)
3. Wait for AI model to load (check status in popup)
4. Try clicking "Refresh" in the popup

### WebGPU Errors?
1. Ensure Chrome is updated to latest version (Chrome 113+)
2. Enable WebGPU flags as described in Prerequisites
3. Check GPU compatibility at chrome://gpu/
4. Try restarting Chrome after enabling flags

### Building Errors?
1. Ensure Node.js is installed (v14+)
2. Run `npm install` to get dependencies
3. Check webpack.config.js paths are correct
4. Clear dist/ folder and rebuild

## Performance Tips

- **First Load**: Initial model download takes 30-60 seconds (one-time)
- **Subsequent Loads**: Model loads from cache in 5-10 seconds
- **Categorization Speed**: 1-3 seconds for typical tab sets
- **GPU Acceleration**: Ensure dedicated GPU is being used (check chrome://gpu/)
- **Memory Usage**: Extension uses ~2-3GB RAM when AI is active

## Future Enhancements

- [ ] Support for multiple AI models (user choice)
- [ ] Custom category training based on user feedback
- [ ] Keyboard shortcuts for quick organization
- [ ] Tab session saving and restoration
- [ ] Cross-device sync via Chrome Sync API
- [ ] Rule-based overrides for specific domains
- [ ] Batch processing optimization
- [ ] Export/import tab groups

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Author

Created by Shaun Patterson

## Acknowledgments

- WebLLM team for making local AI inference possible
- MLC-AI project for model optimization
- Chrome Extensions team for the powerful APIs
- Llama model by Meta

---

**Note**: This extension requires WebGPU support and will download a ~2GB AI model on first use. The model is cached locally for future use. Internet connection required only for initial model download.