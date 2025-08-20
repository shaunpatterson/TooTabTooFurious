// Using WebLLM for local LLM inference
// This runs a small model directly in the browser without external API calls

export class LocalLLM {
  constructor() {
    this.engine = null;
    this.model = null;
    this.ready = false;
    this.loading = false;
    this.loadError = null;
    this.modelId = "Llama-3.2-1B-Instruct-q4f16_1-MLC"; // Small, fast model
    this.loadProgress = 0;
  }

  async initialize() {
    if (this.loading || this.ready) {
      return; // Already loading or loaded
    }
    
    try {
      this.loading = true;
      this.loadError = null;
      console.log('🤖 Initializing local LLM...');
      
      // For now, skip WebLLM initialization to avoid download issues
      // Use fallback categorization instead
      console.log('Using rule-based categorization (WebLLM disabled for stability)');
      this.ready = false; // Set to false to use fallback
      this.loading = false;
      
      /* Uncomment to enable WebLLM:
      // Dynamically import WebLLM
      const webllm = await import('https://esm.run/@mlc-ai/web-llm');
      
      // Create engine with the small model
      this.engine = await webllm.CreateMLCEngine(
        this.modelId,
        {
          initProgressCallback: (progress) => {
            console.log(`Loading model: ${progress.text}`);
            this.loadProgress = progress.progress || 0;
          }
        }
      );
      
      this.ready = true;
      this.loading = false;
      console.log('✅ Local LLM ready!');
      */
    } catch (error) {
      console.error('Failed to initialize LLM:', error);
      this.loadError = error.message;
      this.ready = false;
      this.loading = false;
    }
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
      return {
        status: 'error',
        message: this.loadError
      };
    } else {
      return {
        status: 'fallback',
        message: 'Using rule-based categorization'
      };
    }
  }

  async categorizeTabs(tabs, maxGroups = 5) {
    if (!this.ready) {
      return this.fallbackCategorization(tabs, maxGroups);
    }

    try {
      // Create a prompt for the LLM
      const prompt = this.createCategorizationPrompt(tabs, maxGroups);
      
      // Get response from local model
      const response = await this.engine.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You categorize browser tabs into groups. Respond only with JSON."
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
      
      // Parse the JSON response
      try {
        const categories = JSON.parse(result);
        return this.validateCategories(categories, tabs);
      } catch (parseError) {
        console.error('Failed to parse LLM response:', parseError);
        return this.fallbackCategorization(tabs, maxGroups);
      }
    } catch (error) {
      console.error('LLM categorization failed:', error);
      return this.fallbackCategorization(tabs, maxGroups);
    }
  }

  createCategorizationPrompt(tabs, maxGroups) {
    const tabList = tabs.map(t => 
      `- ${t.domain}: ${t.title.substring(0, 50)}`
    ).join('\n');

    return `Categorize these browser tabs into at most ${maxGroups} groups.
Use short names (1-2 words, PascalCase if 2 words, no spaces).

Tabs:
${tabList}

Return JSON only:
{
  "groups": [
    {
      "name": "GroupName",
      "color": "blue|red|yellow|green|pink|purple|cyan|orange",
      "tabIds": [...]
    }
  ]
}

Common groups: Dev, Social, Work, Entertainment, Shopping, News, Research, Docs`;
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