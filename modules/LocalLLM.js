// Using WebLLM for local LLM inference
// This runs a small model directly in the browser without external API calls

export class LocalLLM {
  constructor() {
    this.engine = null;
    this.model = null;
    this.ready = false;
    this.loading = false;
    this.loadError = null;
    this.offscreenReady = false;
    // Smaller models available - TinyLlama is only ~240MB
    this.modelId = "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC"; // Smallest option
    // Other options:
    // "Llama-3.2-1B-Instruct-q4f16_1-MLC" (~500MB)
    // "gemma-2-2b-it-q4f16_1-MLC" (~1.3GB)
    // "Phi-3.5-mini-instruct-q4f16_1-MLC" (~2GB)
    this.loadProgress = 0;
    this.progressCallback = null;
  }

  async initialize() {
    if (this.loading || this.ready || this.offscreenReady) {
      return; // Already loading or loaded
    }
    
    try {
      this.loading = true;
      this.loadError = null;
      console.log('🤖 Creating offscreen document for categorization...');
      
      // Create offscreen document for LLM processing
      try {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['WORKERS'],
          justification: 'Run WebLLM for AI-powered tab categorization'
        });
        console.log('Offscreen document created');
      } catch (error) {
        // Document might already exist
        console.log('Offscreen document already exists or error:', error.message);
      }
      
      this.offscreenReady = true;
      this.loading = false;
      
      // Set a timeout to ensure we report status even if offscreen doesn't respond
      setTimeout(() => {
        if (this.loading && !this.ready) {
          this.loading = false;
          this.loadError = 'No GPU - using smart patterns';
          console.log('Defaulting to pattern matching mode');
        }
      }, 3000);
      
    } catch (error) {
      console.error('Failed to initialize offscreen document:', error);
      this.loadError = 'Using smart patterns';
      this.ready = false;
      this.loading = false;
      this.offscreenReady = true; // Can still use fallback
      
      // Fallback to rule-based
      console.log('Using pattern-based categorization');
    }
  }
  
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  isReady() {
    return this.ready;
  }

  getStatus() {
    if (this.loading) {
      return {
        status: 'loading',
        message: 'Loading model...',
        progress: this.loadProgress
      };
    } else if (this.ready) {
      return {
        status: 'ready',
        message: 'Model loaded',
        model: this.modelId
      };
    } else if (this.loadError) {
      // If there's an error but we're using fallback, report as fallback
      if (this.loadError.includes('GPU') || this.loadError.includes('pattern')) {
        return {
          status: 'fallback',
          message: 'Using smart pattern matching'
        };
      }
      return {
        status: 'error',
        message: this.loadError
      };
    } else {
      // Default to fallback mode
      return {
        status: 'fallback',
        message: 'Using smart pattern matching'
      };
    }
  }

  async categorizeTabs(tabs, maxGroups = 5) {
    // Try to use offscreen document for LLM processing
    if (this.offscreenReady) {
      try {
        // Send categorization request to offscreen document
        const response = await chrome.runtime.sendMessage({
          action: 'categorize',
          tabs: tabs,
          maxGroups: maxGroups
        });
        
        if (response && response.groups) {
          return this.validateCategories(response, tabs);
        } else if (response && response.error) {
          console.error('Offscreen LLM error:', response.error);
          return this.fallbackCategorization(tabs, maxGroups);
        }
      } catch (error) {
        console.error('Failed to communicate with offscreen document:', error);
        return this.fallbackCategorization(tabs, maxGroups);
      }
    }
    
    // Fallback to rule-based categorization
    return this.fallbackCategorization(tabs, maxGroups);
  }

  createCategorizationPrompt(tabs, maxGroups) {
    // Include enhanced metadata in the prompt
    const tabList = tabs.map(t => {
      let info = `[${t.id}] ${t.domain}: ${t.title.substring(0, 50)}`;
      
      // Add relevant metadata if available
      if (t.description) {
        info += ` | Desc: "${t.description.substring(0, 60)}"`;
      }
      if (t.keywords) {
        info += ` | Keywords: ${t.keywords.substring(0, 40)}`;
      }
      if (t.ogType) {
        info += ` | Type: ${t.ogType}`;
      }
      if (t.schemaType) {
        info += ` | Schema: ${t.schemaType}`;
      }
      
      return info;
    }).join('\n');

    return `Categorize these browser tabs into at most ${maxGroups} groups based on their content and metadata.
Use short names (1-2 words, PascalCase if 2 words, no spaces).

Tabs with metadata:
${tabList}

Consider the description, keywords, and content type when categorizing.
Return JSON only:
{
  "groups": [
    {
      "name": "GroupName",
      "color": "blue|red|yellow|green|pink|purple|cyan|orange",
      "tabIds": [tab_ids_here]
    }
  ]
}

Common groups: Dev, Social, Work, Entertainment, Shopping, News, Research, Docs, Education, Finance`;
  }

  async findBestGroup(tab, existingGroups) {
    if (!this.ready || existingGroups.length === 0) {
      return this.fallbackFindGroup(tab, existingGroups);
    }

    try {
      const prompt = `Which group best fits this tab?
Tab: ${tab.domain} - ${tab.title}
Groups: ${existingGroups.map(g => g.name).join(', ')}
Reply with just the group name or "none".`;

      const response = await this.engine.chat.completions.create({
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 20
      });

      const groupName = response.choices[0].message.content.trim().toLowerCase();
      
      if (groupName === 'none') {
        return null;
      }

      return existingGroups.find(g => 
        g.name.toLowerCase() === groupName
      ) || null;
    } catch (error) {
      console.error('Failed to find best group:', error);
      return this.fallbackFindGroup(tab, existingGroups);
    }
  }

  async categorizeTab(tab) {
    if (!this.ready) {
      return this.fallbackCategorizeTab(tab);
    }

    try {
      const prompt = `Categorize this tab with a short name (1-2 words, PascalCase):
${tab.domain} - ${tab.title}
Reply with just the category name.`;

      const response = await this.engine.chat.completions.create({
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 10
      });

      const name = response.choices[0].message.content.trim();
      return {
        name: this.sanitizeName(name),
        color: this.selectColor(name)
      };
    } catch (error) {
      console.error('Failed to categorize tab:', error);
      return this.fallbackCategorizeTab(tab);
    }
  }

  // Fallback rule-based categorization when LLM is not available
  fallbackCategorization(tabs, maxGroups) {
    const categories = new Map();
    const domainPatterns = {
      'Dev': /github|gitlab|stackoverflow|localhost|codepen|jsfiddle|replit|vercel|netlify/i,
      'Social': /facebook|twitter|instagram|linkedin|reddit|discord|slack|telegram/i,
      'Entertainment': /youtube|netflix|spotify|twitch|hulu|disney|amazon prime|vimeo/i,
      'Shopping': /amazon|ebay|etsy|alibaba|walmart|target|bestbuy/i,
      'Work': /gmail|outlook|office|docs\.google|drive\.google|notion|asana|trello|jira/i,
      'News': /cnn|bbc|reuters|bloomberg|techcrunch|hackernews|reddit\.com\/r\/news/i,
      'Cloud': /aws|azure|gcp|console\.cloud|portal\.azure|console\.aws/i,
      'Docs': /docs\.|documentation|wiki|mdn|w3schools|devdocs/i
    };

    // Categorize tabs
    tabs.forEach(tab => {
      let category = 'General';
      let color = 'grey';

      for (const [cat, pattern] of Object.entries(domainPatterns)) {
        if (pattern.test(tab.domain) || pattern.test(tab.title)) {
          category = cat;
          color = this.selectColor(cat);
          break;
        }
      }

      if (!categories.has(category)) {
        categories.set(category, {
          name: category,
          color: color,
          tabIds: []
        });
      }
      categories.get(category).tabIds.push(tab.id);
    });

    // Limit to maxGroups
    let groups = Array.from(categories.values());
    
    if (groups.length > maxGroups) {
      // Merge smallest groups into "Other"
      groups.sort((a, b) => b.tabIds.length - a.tabIds.length);
      const keepGroups = groups.slice(0, maxGroups - 1);
      const mergeGroups = groups.slice(maxGroups - 1);
      
      const otherGroup = {
        name: 'Other',
        color: 'grey',
        tabIds: mergeGroups.flatMap(g => g.tabIds)
      };
      
      groups = [...keepGroups, otherGroup];
    }

    return { groups };
  }

  fallbackFindGroup(tab, existingGroups) {
    const domainPatterns = {
      'dev': /github|gitlab|stackoverflow|localhost/i,
      'social': /facebook|twitter|instagram|linkedin|reddit/i,
      'entertainment': /youtube|netflix|spotify|twitch/i,
      'work': /gmail|outlook|office|docs\.google/i,
      'cloud': /aws|azure|gcp|console/i
    };

    for (const group of existingGroups) {
      const groupName = group.name.toLowerCase();
      if (domainPatterns[groupName]) {
        if (domainPatterns[groupName].test(tab.domain) || 
            domainPatterns[groupName].test(tab.title)) {
          return group;
        }
      }
    }

    return null;
  }

  fallbackCategorizeTab(tab) {
    const domain = tab.domain.toLowerCase();
    const title = tab.title.toLowerCase();

    if (/github|gitlab|stackoverflow/.test(domain)) {
      return { name: 'Dev', color: 'blue' };
    } else if (/youtube|netflix|spotify/.test(domain)) {
      return { name: 'Entertainment', color: 'red' };
    } else if (/facebook|twitter|instagram/.test(domain)) {
      return { name: 'Social', color: 'pink' };
    } else if (/aws|azure|gcp/.test(domain)) {
      return { name: 'Cloud', color: 'cyan' };
    } else {
      return { name: 'General', color: 'grey' };
    }
  }

  validateCategories(categories, tabs) {
    // Ensure all tabs are assigned
    const assignedTabIds = new Set();
    categories.groups.forEach(group => {
      group.tabIds.forEach(id => assignedTabIds.add(id));
    });

    const unassignedTabs = tabs.filter(t => !assignedTabIds.has(t.id));
    
    if (unassignedTabs.length > 0) {
      // Add unassigned tabs to a General group
      categories.groups.push({
        name: 'General',
        color: 'grey',
        tabIds: unassignedTabs.map(t => t.id)
      });
    }

    // Sanitize group names
    categories.groups.forEach(group => {
      group.name = this.sanitizeName(group.name);
    });

    return categories;
  }

  sanitizeName(name) {
    // Remove spaces, ensure PascalCase, limit length
    return name
      .replace(/\s+/g, '')
      .replace(/^./, str => str.toUpperCase())
      .substring(0, 15);
  }

  selectColor(name) {
    const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }
}