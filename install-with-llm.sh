#!/bin/bash

# TooTabTooFurious - WebLLM Setup Script
# This script sets up the Chrome extension with local AI model support

set -e  # Exit on error

echo "================================================"
echo "TooTabTooFurious - WebLLM Setup Script"
echo "================================================"
echo ""

# Step 1: Install dependencies
echo "📦 Installing dependencies..."
npm install @mlc-ai/web-llm
npm install --save-dev webpack webpack-cli
echo "✓ Dependencies installed"
echo ""

# Step 2: Create webpack configuration
echo "⚙️ Creating webpack configuration..."
cat > webpack.config.js << 'EOF'
const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/webllm-bundle.js',
  output: {
    filename: 'webllm.bundle.js',
    path: path.resolve(__dirname, 'lib'),
    library: 'WebLLM',
    libraryTarget: 'var',
    libraryExport: 'default'
  },
  resolve: {
    fallback: {
      "path": false,
      "fs": false,
      "crypto": false,
      "buffer": false,
      "stream": false,
    }
  },
  performance: {
    maxAssetSize: 50000000,
    maxEntrypointSize: 50000000,
  }
};
EOF
echo "✓ Webpack config created"
echo ""

# Step 3: Create source directory and bundle entry
echo "📁 Setting up source files..."
mkdir -p src lib

cat > src/webllm-bundle.js << 'EOF'
// Bundle WebLLM for use in Chrome extension
import * as webllm from '@mlc-ai/web-llm';

// Export everything
export default webllm;
export const CreateMLCEngine = webllm.CreateMLCEngine;
export const CreateWebWorkerMLCEngine = webllm.CreateWebWorkerMLCEngine;
export const hasModelInCache = webllm.hasModelInCache;
export const deleteModelAllInfoInCache = webllm.deleteModelAllInfoInCache;
EOF
echo "✓ Source files created"
echo ""

# Step 4: Build the WebLLM bundle
echo "🔨 Building WebLLM bundle (this may take a minute)..."
npx webpack --config webpack.config.js
echo "✓ WebLLM bundle created at lib/webllm.bundle.js"
echo ""

# Step 5: Update offscreen.html to load the bundle
echo "📝 Updating offscreen.html..."
cat > offscreen.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>TooTabTooFurious AI Processing</title>
</head>
<body>
  <script src="lib/webllm.bundle.js"></script>
  <script src="offscreen-bundled.js"></script>
</body>
</html>
EOF
echo "✓ offscreen.html updated"
echo ""

# Step 6: Create new offscreen script that uses the bundle
echo "📝 Creating offscreen-bundled.js..."
cat > offscreen-bundled.js << 'EOF'
// Offscreen document for WebLLM processing
// Uses the bundled WebLLM library

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
      
      // Check if WebLLM is available
      if (typeof WebLLM === 'undefined' || !WebLLM.CreateMLCEngine) {
        throw new Error('WebLLM bundle not loaded properly');
      }
      
      // Create the engine with TinyLlama
      this.engine = await WebLLM.CreateMLCEngine(
        this.modelId,
        {
          initProgressCallback: (progress) => {
            const progressPercent = Math.round((progress.progress || 0) * 100);
            console.log(`Loading: ${progressPercent}% - ${progress.text}`);
            
            // Send progress updates to service worker
            chrome.runtime.sendMessage({
              type: 'llm-progress',
              progress: progressPercent,
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
      
      console.log('✓ TinyLlama model ready!');
    } catch (error) {
      console.error('Failed to initialize WebLLM:', error);
      this.loading = false;
      
      chrome.runtime.sendMessage({
        type: 'llm-error',
        error: error.message
      }).catch(() => {});
    }
  }

  async categorize(tabs, maxGroups) {
    if (!this.ready) {
      return this.fallbackCategorization(tabs, maxGroups);
    }

    try {
      const prompt = this.createPrompt(tabs, maxGroups);
      
      const response = await this.engine.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You categorize browser tabs into groups. Respond only with valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      const result = response.choices[0].message.content;
      const categories = JSON.parse(result);
      return categories;
    } catch (error) {
      console.error('Categorization failed:', error);
      return this.fallbackCategorization(tabs, maxGroups);
    }
  }

  createPrompt(tabs, maxGroups) {
    const tabList = tabs.map(t => {
      let info = `[${t.id}] ${t.domain}: ${t.title}`;
      if (t.description) info += ` | ${t.description.substring(0, 60)}`;
      return info;
    }).join('\n');

    return `Categorize these tabs into at most ${maxGroups} groups.
Use short group names (1-2 words, PascalCase, no spaces).

Tabs:
${tabList}

Return JSON:
{
  "groups": [
    {"name": "GroupName", "color": "blue", "tabIds": [1,2,3]}
  ]
}`;
  }

  fallbackCategorization(tabs, maxGroups) {
    console.log('Using fallback categorization');
    const categories = new Map();
    const patterns = {
      'Dev': /github|gitlab|stackoverflow|localhost/i,
      'Social': /facebook|twitter|instagram|linkedin|reddit/i,
      'Entertainment': /youtube|netflix|spotify|twitch/i,
      'Shopping': /amazon|ebay|etsy/i,
      'Work': /gmail|outlook|docs\.google|notion/i,
      'News': /cnn|bbc|reuters/i
    };

    tabs.forEach(tab => {
      let category = 'General';
      for (const [cat, pattern] of Object.entries(patterns)) {
        if (pattern.test(tab.domain) || pattern.test(tab.title)) {
          category = cat;
          break;
        }
      }

      if (!categories.has(category)) {
        categories.set(category, {
          name: category,
          color: this.selectColor(category),
          tabIds: []
        });
      }
      categories.get(category).tabIds.push(tab.id);
    });

    return { groups: Array.from(categories.values()).slice(0, maxGroups) };
  }

  selectColor(name) {
    const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }
}

// Initialize LLM
const llm = new OffscreenLLM();

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'categorize') {
    llm.categorize(request.tabs, request.maxGroups)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  } else if (request.action === 'getStatus') {
    sendResponse({
      ready: llm.ready,
      loading: llm.loading
    });
  }
});
EOF
echo "✓ offscreen-bundled.js created"
echo ""

# Step 7: Generate icons if they don't exist
echo "🎨 Checking icons..."
mkdir -p icons
if [ ! -f "icons/icon128.png" ]; then
    echo "⚠️  Icons not found. Please generate them:"
    echo "   1. Open icons/generate-icons.html in Chrome"
    echo "   2. Save each canvas as PNG in the icons/ directory"
else
    echo "✓ Icons found"
fi
echo ""

# Step 8: Instructions for loading in Chrome
echo "================================================"
echo "✅ Setup Complete!"
echo "================================================"
echo ""
echo "To load the extension in Chrome:"
echo ""
echo "1. Open Chrome and go to: chrome://extensions/"
echo "2. Enable 'Developer mode' (top right)"
echo "3. Click 'Load unpacked'"
echo "4. Select this directory: $(pwd)"
echo "5. Pin the extension to your toolbar"
echo ""
echo "📝 First Use:"
echo "- The TinyLlama model (~240MB) will download on first use"
echo "- You'll see a progress bar during download"
echo "- This only happens once - the model is cached"
echo "- After loading, you'll see 'AI Ready (TinyLlama)'"
echo ""
echo "🚀 The extension is ready with WebLLM support!"
echo ""
