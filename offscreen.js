// Offscreen document for WebLLM processing
// Due to Chrome extension CSP restrictions, we can't load from external CDNs
// This will use the fallback categorization for now

// Placeholder for WebLLM - would need to be bundled locally
let CreateMLCEngine = null;

// For now, we'll use a flag to indicate WebLLM is not available
const WEBLLM_AVAILABLE = false;

async function loadWebLLM() {
  // WebLLM cannot be loaded from CDN due to Chrome CSP restrictions
  // To enable WebLLM:
  // 1. Install @mlc-ai/web-llm via npm
  // 2. Bundle it with webpack/vite
  // 3. Include the bundled file in the extension
  
  console.log('WebLLM is not available - using rule-based categorization');
  console.log('To enable AI categorization, WebLLM needs to be bundled locally');
  return false;
}

class OffscreenLLM {
  constructor() {
    this.engine = null;
    this.ready = false;
    this.loading = false;
    this.modelId = null;
    this.loadSettings().then(() => this.initializeModel());
  }

  async loadSettings() {
    // Always use TinyLlama model
    this.modelId = "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC";
    console.log('Using TinyLlama 1.1B model');
  }

  async initializeModel() {
    if (this.loading || this.ready) return;
    
    try {
      this.loading = true;
      console.log('Initializing WebLLM in offscreen document...');
      
      // First load WebLLM library
      const loaded = await loadWebLLM();
      if (!loaded) {
        throw new Error('Failed to load WebLLM library from CDN');
      }
      
      this.engine = await CreateMLCEngine(
        this.modelId,
        {
          initProgressCallback: (progress) => {
            // Send progress updates to service worker
            chrome.runtime.sendMessage({
              type: 'llm-progress',
              progress: Math.round((progress.progress || 0) * 100),
              text: progress.text || 'Loading model...'
            });
          }
        }
      );
      
      this.ready = true;
      this.loading = false;
      
      // Notify service worker that model is ready
      chrome.runtime.sendMessage({
        type: 'llm-ready'
      });
      
      console.log('WebLLM ready in offscreen document!');
    } catch (error) {
      console.error('Failed to initialize WebLLM:', error);
      this.loading = false;
      
      chrome.runtime.sendMessage({
        type: 'llm-error',
        error: error.message
      });
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
      
      // Parse and validate JSON
      const categories = JSON.parse(result);
      return categories;
    } catch (error) {
      console.error('LLM categorization failed:', error);
      return this.fallbackCategorization(tabs, maxGroups);
    }
  }

  createPrompt(tabs, maxGroups) {
    const tabList = tabs.map(t => {
      let info = `[${t.id}] ${t.domain}: ${t.title}`;
      if (t.description) info += ` | ${t.description.substring(0, 60)}`;
      if (t.keywords) info += ` | Keywords: ${t.keywords.substring(0, 40)}`;
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
    const categories = new Map();
    const patterns = {
      'Dev': /github|gitlab|stackoverflow|localhost|codepen/i,
      'Social': /facebook|twitter|instagram|linkedin|reddit/i,
      'Entertainment': /youtube|netflix|spotify|twitch/i,
      'Shopping': /amazon|ebay|etsy|walmart/i,
      'Work': /gmail|outlook|docs\.google|notion/i,
      'News': /cnn|bbc|reuters|bloomberg/i,
      'Cloud': /aws|azure|gcp|console/i
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

    // Limit groups
    let groups = Array.from(categories.values());
    if (groups.length > maxGroups) {
      groups = groups.slice(0, maxGroups - 1);
      const remaining = Array.from(categories.values()).slice(maxGroups - 1);
      groups.push({
        name: 'Other',
        color: 'grey',
        tabIds: remaining.flatMap(g => g.tabIds)
      });
    }

    return { groups };
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
    return true; // Keep channel open for async response
  } else if (request.action === 'getStatus') {
    sendResponse({
      ready: llm.ready,
      loading: llm.loading
    });
  }
});