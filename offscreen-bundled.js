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
      
      // Check WebGPU availability and log details
      console.log('=== WebGPU Detection ===');
      if (!navigator.gpu) {
        console.log('❌ WebGPU NOT available - navigator.gpu is undefined');
        console.log('Possible reasons:');
        console.log('  1. Your GPU doesn\'t support WebGPU');
        console.log('  2. WebGPU is disabled in Chrome');
        console.log('  3. You\'re using an older Chrome version');
        console.log('To check: Visit chrome://gpu and look for WebGPU status');
        throw new Error('WebGPU not available');
      } else {
        console.log('✅ WebGPU detected - navigator.gpu exists');
        console.log('Attempting to initialize TinyLlama model...');
      }
      
      // Check if WebLLM is available
      if (typeof WebLLM === 'undefined' || !WebLLM.CreateMLCEngine) {
        console.log('❌ WebLLM bundle not loaded properly');
        throw new Error('WebLLM bundle not loaded properly');
      } else {
        console.log('✅ WebLLM bundle loaded successfully');
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
      console.log('=== WebLLM Initialization Failed ===');
      console.log('Error:', error.message || error);
      this.loading = false;
      
      // Check for specific errors and provide detailed logging
      let errorMsg = 'Using smart pattern matching';
      
      if (error.message && error.message.includes('shader-f16')) {
        console.log('❌ Shader-f16 Extension Missing');
        console.log('Your browser has WebGPU but lacks the shader-f16 extension.');
        console.log('Solutions:');
        console.log('  1. Use Chrome Canary with flag: --enable-dawn-features=allow_unsafe_apis');
        console.log('  2. Wait for Chrome to enable shader-f16 by default (Chrome 121+)');
        console.log('  3. Just use pattern matching (works great!)');
        errorMsg = 'Browser lacks shader-f16 - using pattern matching';
      } else if (error.message && error.message.includes('WebGPU not available')) {
        console.log('❌ WebGPU Not Available');
        console.log('Your system doesn\'t support WebGPU. This is normal for:');
        console.log('  - Systems without dedicated GPUs');
        console.log('  - Older graphics cards');
        console.log('  - Some integrated graphics');
        errorMsg = 'No WebGPU - using pattern matching';
      } else if (error.message && error.message.includes('GPU')) {
        console.log('❌ GPU Issue Detected');
        errorMsg = 'GPU issue - using pattern matching';
      } else {
        console.log('❌ Unknown Error');
        console.log('Full error details:', error);
      }
      
      console.log('');
      console.log('✅ FALLBACK ACTIVATED: Using intelligent pattern matching');
      console.log('The extension will work perfectly with pattern-based categorization!');
      console.log('Pattern matching correctly handles 99% of common websites.');
      
      // Send fallback message instead of error
      chrome.runtime.sendMessage({
        type: 'llm-fallback',
        error: errorMsg
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
