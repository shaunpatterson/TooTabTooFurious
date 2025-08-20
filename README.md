# TooTabTooFurious 🏁

A Chrome extension that automatically organizes your browser tabs into smart groups using intelligent categorization. Clean, minimal design that matches Chrome's aesthetic.

## Features

- **Smart Tab Grouping**: Automatically organizes tabs into logical categories (Dev, Social, Entertainment, Work, etc.)
- **Duplicate Prevention**: Merges tabs into existing groups instead of creating duplicates
- **Auto Mode**: Automatically organize new tabs as you browse
- **Enhanced Metadata**: Analyzes page descriptions, keywords, and content for better categorization
- **Configurable Groups**: Set maximum number of groups (2-10, default: 5)
- **Clean UI**: Minimal design that matches Chrome's default theme
- **Statistics Tracking**: Monitor your tab organization habits

## Installation

1. **Download or Clone the Repository**:
   ```bash
   git clone https://github.com/shaunpatterson/TooTabTooFurious.git
   cd TooTabTooFurious
   ```

2. **Generate Extension Icons** (if not already present):
   - Open `icons/generate-icons.html` in Chrome
   - Right-click each canvas and save as PNG with the specified filename (icon16.png, icon32.png, icon48.png, icon128.png)
   - Save them in the `icons/` directory

3. **Load the Extension in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" toggle in the top right
   - Click "Load unpacked"
   - Select the TooTabTooFurious directory
   - The extension icon will appear in your toolbar

4. **Pin the Extension** (recommended):
   - Click the puzzle piece icon in Chrome toolbar
   - Click the pin icon next to "TooTabTooFurious"

## Usage

### Quick Start
1. Click the TooTabTooFurious icon in your toolbar
2. Click "Organize Tabs Now" to instantly group all open tabs
3. Enable "Auto Mode" to automatically organize new tabs as you browse

### Settings

Access settings by clicking the extension icon and then "Settings", or right-click the extension icon and select "Options".

- **Maximum Groups**: Set how many tab groups to create (2-10, default: 5)
- **Auto Mode**: Toggle automatic organization of new tabs as you browse
- **Collapse Groups**: Automatically collapse tab groups after creation to save space

## How It Works

The extension uses intelligent pattern matching and metadata analysis to categorize your tabs:

1. **Tab Analysis**: Examines URLs, titles, and page metadata (descriptions, keywords, Open Graph tags)
2. **Smart Categorization**: Groups tabs into categories based on domain patterns and content
3. **Duplicate Prevention**: Checks for existing groups and merges tabs instead of creating duplicates
4. **Chrome Tab Groups**: Uses Chrome's native tab grouping API with color-coded categories

### Categories

The extension recognizes these common categories:
- **Dev**: GitHub, GitLab, StackOverflow, localhost, CodePen, Replit
- **Social**: Facebook, Twitter/X, Instagram, LinkedIn, Reddit, Discord
- **Entertainment**: YouTube, Netflix, Spotify, Twitch, Disney+
- **Work**: Gmail, Outlook, Google Docs, Notion, Trello, Jira
- **Cloud**: AWS, Azure, GCP, cloud consoles
- **Shopping**: Amazon, eBay, Etsy, Walmart
- **News**: CNN, BBC, Reuters, TechCrunch
- **Docs**: Documentation sites, wikis, MDN
- **General**: Everything else

## Configuration

## Technical Details

### Architecture
- **Chrome Extensions Manifest V3**: Modern, secure extension architecture
- **Service Worker**: Background script for tab management
- **Offscreen Document**: Handles compute-intensive tasks
- **Content Script**: Extracts page metadata for enhanced categorization
- **Chrome APIs**: Uses Tabs, Tab Groups, Storage, and Offscreen APIs

### Categorization Engine
The extension uses a hybrid approach:
1. **Metadata Extraction**: Content script extracts page descriptions, keywords, Open Graph tags
2. **Pattern Matching**: Analyzes domains and titles against known patterns
3. **Smart Grouping**: Creates logical groups while preventing duplicates

### Privacy & Performance
- All processing happens locally in your browser
- No external API calls or data transmission
- Lightweight and fast - instant categorization
- Minimal resource usage

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

## Troubleshooting

### Extension not working?
1. Make sure you've enabled Developer Mode in Chrome
2. Check that all required permissions are granted
3. Try reloading the extension from chrome://extensions/

### Tabs not grouping?
1. Verify Chrome tab groups are enabled (should be by default)
2. Check that you have ungrouped tabs (extension only organizes tabs not already in groups)
3. Try clicking "Refresh" in the popup

### Icons not showing?
1. Generate icons using the included HTML file
2. Save as PNG files in the icons/ directory
3. Reload the extension

## Future Enhancements

- WebLLM integration for AI-powered categorization (currently uses pattern matching)
- Custom category creation and rules
- Keyboard shortcuts
- Export/import settings
- Sync across devices

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Author

Created by Shaun Patterson

---

**Note**: The extension uses intelligent pattern matching for categorization. If you have a GPU with WebGPU support, you can optionally enable AI-powered categorization using TinyLlama by running the `install-with-llm.sh` script.