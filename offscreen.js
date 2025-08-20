// Offscreen document for WebLLM/CPU fallback processing
// Supports both WebGPU (via WebLLM) and CPU (via transformers.js)

// Try to import transformers.js for CPU fallback
let pipeline = null;
let CreateMLCEngine = null;
let cpuFallback = null;

// Flags for availability
let WEBLLM_AVAILABLE = false;
let TRANSFORMERS_AVAILABLE = false;

async function loadTransformersJS() {
  try {
    // Try to load transformers.js for CPU fallback
    const transformersModule = await import('@xenova/transformers');
    pipeline = transformersModule.pipeline;
    TRANSFORMERS_AVAILABLE = true;
    console.log('✅ Transformers.js loaded successfully for CPU fallback');
    return true;
  } catch (error) {
    console.log('⚠️ Transformers.js not available:', error.message);
    return false;
  }
}

async function loadWebLLM() {
  try {
    // Check if WebGPU is available
    if (!navigator.gpu) {
      console.log('⚠️ WebGPU not available in this browser');
      return false;
    }
    
    // Try to load WebLLM if bundled
    // This would need the WebLLM library to be bundled locally
    console.log('Checking for WebLLM availability...');
    
    // For now, WebLLM needs to be bundled locally
    return false;
  } catch (error) {
    console.log('⚠️ WebLLM not available:', error.message);
    return false;
  }
}

class CPUFallback {
  constructor() {
    this.classifier = null;
    this.ready = false;
    this.loading = false;
  }

  async initialize() {
    if (this.loading || this.ready) return;
    
    try {
      this.loading = true;
      console.log('🔄 Initializing CPU fallback with transformers.js...');
      
      this.classifier = await pipeline(
        'zero-shot-classification', 
        'Xenova/bart-large-mnli',
        {
          device: 'cpu',
          progress_callback: (progress) => {
            if (progress.status === 'progress') {
              const percent = Math.round((progress.loaded / progress.total) * 100);
              chrome.runtime.sendMessage({
                type: 'llm-progress',
                progress: percent,
                text: `Loading CPU model: ${percent}%`
              });
            }
          }
        }
      );
      
      this.ready = true;
      this.loading = false;
      console.log('✅ CPU model ready');
      
      chrome.runtime.sendMessage({
        type: 'llm-ready',
        mode: 'cpu'
      });
      
    } catch (error) {
      console.error('Failed to initialize CPU fallback:', error);
      this.loading = false;
      chrome.runtime.sendMessage({
        type: 'llm-error',
        error: error.message
      });
    }
  }

  async categorize(tabs, maxGroups) {
    if (!this.ready) {
      return this.patternBasedCategorization(tabs, maxGroups);
    }

    try {
      const candidateLabels = [
        'Development', 'Social Media', 'Entertainment', 'Shopping', 
        'Work', 'News', 'Cloud Services', 'Documentation', 
        'Education', 'Finance', 'Research', 'Gaming'
      ];
      
      // Use a Map to track groups and ensure no duplicates
      const groups = new Map();
      const colorMap = {
        'Development': 'blue',
        'SocialMedia': 'pink',
        'Entertainment': 'red',
        'Shopping': 'orange',
        'Work': 'green',
        'News': 'purple',
        'CloudServices': 'cyan',
        'Documentation': 'yellow',
        'Education': 'grey',
        'Finance': 'green',
        'Research': 'blue',
        'Gaming': 'red'
      };

      for (const tab of tabs) {
        const text = `${tab.domain} ${tab.title} ${tab.description || ''}`;
        
        const result = await this.classifier(text, candidateLabels, {
          multi_label: false,
          hypothesis_template: 'This webpage is about {}.'
        });
        
        const topLabel = result.labels[0];
        const simplifiedLabel = topLabel.replace(/\s+/g, '');
        
        if (!groups.has(simplifiedLabel)) {
          groups.set(simplifiedLabel, {
            name: simplifiedLabel,
            color: colorMap[simplifiedLabel] || this.selectColor(simplifiedLabel),
            tabIds: []
          });
        }
        
        groups.get(simplifiedLabel).tabIds.push(tab.id);
      }

      let groupArray = Array.from(groups.values());
      
      if (groupArray.length > maxGroups) {
        groupArray.sort((a, b) => b.tabIds.length - a.tabIds.length);
        const keepGroups = groupArray.slice(0, maxGroups - 1);
        const mergeGroups = groupArray.slice(maxGroups - 1);
        
        const otherGroup = {
          name: 'Other',
          color: 'grey',
          tabIds: mergeGroups.flatMap(g => g.tabIds)
        };
        
        groupArray = [...keepGroups, otherGroup];
      }

      return { groups: groupArray };
      
    } catch (error) {
      console.error('CPU categorization failed:', error);
      return this.patternBasedCategorization(tabs, maxGroups);
    }
  }

  patternBasedCategorization(tabs, maxGroups) {
    // Use a Map to ensure no duplicate groups
    const categories = new Map();
    const patterns = {
      'Dev': /github|gitlab|stackoverflow|localhost|codepen/i,
      'Social': /facebook|twitter|instagram|linkedin|reddit/i,
      'Entertainment': /youtube|netflix|spotify|twitch/i,
      'Shopping': /amazon|ebay|etsy|walmart/i,
      'Work': /gmail|outlook|docs\.google|notion/i,
      'News': /cnn|bbc|reuters|bloomberg/i,
      'Cloud': /aws|azure|gcp|console/i,
      'Docs': /docs\.|documentation|wiki|mdn|w3schools/i,
      'Video': /vimeo|dailymotion|rumble/i,
      'Finance': /bank|paypal|venmo|crypto|coinbase/i
    };

    tabs.forEach(tab => {
      let category = null;
      
      for (const [cat, pattern] of Object.entries(patterns)) {
        if (pattern.test(tab.domain) || pattern.test(tab.title)) {
          category = cat;
          break;
        }
      }
      
      // Use 'Other' instead of duplicating with different names
      if (!category) {
        category = 'Other';
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

class OffscreenLLM {
  constructor() {
    this.engine = null;
    this.ready = false;
    this.loading = false;
    this.modelId = null;
    this.mode = null; // 'webgpu', 'cpu', or 'pattern'
    this.loadSettings().then(() => this.initializeModel());
  }

  async loadSettings() {
    this.modelId = "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC";
    console.log('Configured to use TinyLlama 1.1B model');
  }

  async initializeModel() {
    if (this.loading || this.ready) return;
    
    try {
      this.loading = true;
      console.log('Initializing LLM in offscreen document...');
      
      // Try WebLLM first (WebGPU)
      const webllmLoaded = await loadWebLLM();
      if (webllmLoaded && CreateMLCEngine) {
        console.log('Attempting to use WebGPU via WebLLM...');
        try {
          this.engine = await CreateMLCEngine(
            this.modelId,
            {
              initProgressCallback: (progress) => {
                chrome.runtime.sendMessage({
                  type: 'llm-progress',
                  progress: Math.round((progress.progress || 0) * 100),
                  text: progress.text || 'Loading WebGPU model...'
                });
              }
            }
          );
          
          this.ready = true;
          this.loading = false;
          this.mode = 'webgpu';
          
          chrome.runtime.sendMessage({
            type: 'llm-ready',
            mode: 'webgpu'
          });
          
          console.log('✅ WebLLM ready with WebGPU!');
          return;
        } catch (webllmError) {
          console.log('WebGPU/WebLLM failed:', webllmError.message);
        }
      }
      
      // Fallback to CPU with transformers.js
      const transformersLoaded = await loadTransformersJS();
      if (transformersLoaded && pipeline) {
        console.log('Falling back to CPU with transformers.js...');
        cpuFallback = new CPUFallback();
        await cpuFallback.initialize();
        this.ready = true;
        this.loading = false;
        this.mode = 'cpu';
        return;
      }
      
      // Final fallback to pattern-based
      console.log('Using pattern-based categorization (no ML models available)');
      this.ready = true;
      this.loading = false;
      this.mode = 'pattern';
      
      chrome.runtime.sendMessage({
        type: 'llm-ready',
        mode: 'pattern'
      });
      
    } catch (error) {
      console.error('Failed to initialize any LLM mode:', error);
      this.loading = false;
      this.mode = 'pattern';
      
      chrome.runtime.sendMessage({
        type: 'llm-error',
        error: error.message
      });
    }
  }

  async categorize(tabs, maxGroups) {
    if (this.mode === 'cpu' && cpuFallback) {
      return cpuFallback.categorize(tabs, maxGroups);
    } else if (this.mode === 'webgpu' && this.engine) {
      return this.webgpuCategorize(tabs, maxGroups);
    } else {
      return this.fallbackCategorization(tabs, maxGroups);
    }
  }

  async webgpuCategorize(tabs, maxGroups) {
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
      console.error('WebGPU categorization failed:', error);
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
    // Use Map to prevent duplicate groups - key by exact name
    const categories = new Map();
    const patterns = {
      'Dev': /github|gitlab|stackoverflow|localhost|codepen/i,
      'Social': /facebook|twitter|instagram|linkedin|reddit/i,
      'Entertainment': /youtube|netflix|spotify|twitch/i,
      'Shopping': /amazon|ebay|etsy|walmart/i,
      'Work': /gmail|outlook|docs\.google|notion/i,
      'News': /cnn|bbc|reuters|bloomberg/i,
      'Cloud': /aws|azure|gcp|console/i,
      'Docs': /docs\.|documentation|wiki|mdn|w3schools/i,
      'Video': /vimeo|dailymotion|rumble/i,
      'Finance': /bank|paypal|venmo|crypto|coinbase/i
    };

    tabs.forEach(tab => {
      let category = null;
      
      // Try to find a matching pattern
      for (const [cat, pattern] of Object.entries(patterns)) {
        if (pattern.test(tab.domain) || pattern.test(tab.title)) {
          category = cat;
          break;
        }
      }
      
      // If no pattern matches, use 'Other' instead of 'General'
      if (!category) {
        category = 'Other';
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
      loading: llm.loading,
      mode: llm.mode
    });
  }
});