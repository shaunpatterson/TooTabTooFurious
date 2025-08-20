#!/bin/bash

# Setup script to download WebLLM library locally

echo "Setting up TooTabTooFurious Chrome Extension..."

# Create lib directory if it doesn't exist
mkdir -p lib

# Download WebLLM library
echo "Downloading WebLLM library..."
curl -L "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.46/lib/index.js" -o lib/web-llm.js

echo "✓ WebLLM library downloaded to lib/web-llm.js"

# Make the script executable
echo ""
echo "Setup complete! The extension is ready to load in Chrome."
echo ""
echo "Note: Due to Chrome's security restrictions, WebLLM must be bundled locally."
echo "For now, the extension will use rule-based categorization."
echo ""
echo "To use AI categorization, you would need to:"
echo "1. Install Node.js and npm"
echo "2. Run: npm install @mlc-ai/web-llm"
echo "3. Bundle it with a tool like webpack or vite"