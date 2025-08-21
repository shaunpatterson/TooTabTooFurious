# Setting Up TooTabbedTooFurious with WebLLM Support

This guide will help you set up the extension with local AI model support using WebLLM.

## Prerequisites

- Node.js and npm installed on your system
- Git (for cloning the repository)
- Chrome browser

## Installation Steps

### 1. Clone and Set Up the Project

```bash
# Clone the repository
git clone https://github.com/shaunpatterson/TooTabbedTooFurious.git
cd TooTabbedTooFurious

# Install dependencies
npm install
```

### 2. Build WebLLM Bundle

Since Chrome extensions can't load external scripts, we need to bundle WebLLM locally:

```bash
# Install build tools
npm install --save-dev webpack webpack-cli

# Create webpack configuration
cat > webpack.config.js << 'EOF'
const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/webllm-bundle.js',
  output: {
    filename: 'webllm.bundle.js',
    path: path.resolve(__dirname, 'lib'),
    library: 'WebLLM',
    libraryTarget: 'umd'
  },
  resolve: {
    fallback: {
      "path": false,
      "fs": false,
    }
  }
};
EOF

# Create the bundle entry point
mkdir -p src
cat > src/webllm-bundle.js << 'EOF'
export * from '@mlc-ai/web-llm';
EOF

# Build the bundle
npx webpack
```

### 3. Update the Offscreen Document

Replace the content of `offscreen.js` with:

```javascript
// Load the bundled WebLLM
import * as WebLLM from './lib/webllm.bundle.js';

class OffscreenLLM {
  constructor() {
    this.engine = null;
    this.ready = false;
    this.loading = false;
    this.modelId = "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC";
    this.initializeModel();
  }

  async initializeModel() {
    if (this.loading || this.ready) return;
    
    try {
      this.loading = true;
      console.log('Initializing TinyLlama model...');
      
      // Create the engine with TinyLlama
      this.engine = await WebLLM.CreateMLCEngine(
        this.modelId,
        {
          initProgressCallback: (progress) => {
            // Send progress updates
            chrome.runtime.sendMessage({
              type: 'llm-progress',
              progress: Math.round((progress.progress || 0) * 100),
              text: progress.text || 'Loading model...'
            }).catch(() => {});
          }
        }
      );
      
      this.ready = true;
      this.loading = false;
      
      chrome.runtime.sendMessage({
        type: 'llm-ready'
      }).catch(() => {});
      
      console.log('TinyLlama model ready!');
    } catch (error) {
      console.error('Failed to initialize WebLLM:', error);
      this.loading = false;
      
      chrome.runtime.sendMessage({
        type: 'llm-error',
        error: error.message
      }).catch(() => {});
    }
  }

  // ... rest of the categorization code remains the same
}

// Initialize
const llm = new OffscreenLLM();
```

### 4. Load the Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select your TooTabbedTooFurious directory
5. The extension icon will appear in your toolbar

### 5. First Time Setup

When you first use the extension:

1. Click the extension icon
2. You'll see "Loading AI Model..." with a progress bar
3. The TinyLlama model (~240MB) will download
4. This only happens once - the model is cached locally
5. After loading completes, you'll see "AI Ready (TinyLlama)"
6. Click "Organize Tabs" to use AI-powered categorization

## What Happens During Model Download

- **First time**: Downloads TinyLlama model (~240MB)
- **Download location**: Chrome's IndexedDB storage
- **Progress indicator**: Shows download percentage in the popup
- **Time required**: 1-5 minutes depending on internet speed
- **After download**: Model loads instantly on future uses

## Troubleshooting

### Model Won't Load?

1. Check Chrome DevTools console for errors:
   - Right-click extension icon → "Inspect popup"
   - Check Console tab for error messages

2. Clear extension data and retry:
   - Go to chrome://extensions/
   - Click "Remove" on TooTabbedTooFurious
   - Reload the extension
   - Try again

3. Check available storage:
   - The model needs ~500MB free space
   - Chrome settings → Privacy → Site Settings → View permissions and data

### Using Fallback Mode

If WebLLM fails to load, the extension automatically falls back to pattern-based categorization which:
- Still works great for common websites
- Is instant (no download needed)
- Uses domain patterns and metadata

## Alternative: Use Without WebLLM

If you prefer not to use WebLLM, the extension works perfectly with pattern-based categorization:
1. Simply load the extension as-is
2. It will automatically use the fallback categorization
3. Still provides intelligent grouping based on domains and metadata

## Notes

- The model download is a one-time process
- Model files are stored in Chrome's local storage
- No data is sent to external servers
- Everything runs locally in your browser
- TinyLlama is optimized for speed and small size
