// LocalLLM with WebGPU support (via WebLLM) and pattern fallback
import * as webllm from '../lib/webllm.bundle.js';

export class LocalLLM {
  constructor() {
    this.ready = false;
    this.loading = false;
    this.loadError = null;
    this.mode = null; // 'gpu' or 'pattern'
    this.engine = null; // WebLLM engine for GPU

    // Central category configuration
    this.VALID_CATEGORIES = ['Dev', 'Social', 'Entertainment', 'Shopping', 'Work',
                             'News', 'Cloud', 'Docs', 'Finance', 'AI', 'Education',
                             'Communication', 'Health', 'Travel', 'Design', 'Analytics',
                             'Security', 'Marketing', 'Government', 'Food', 'Photography',
                             'Real Estate', 'HR', 'Legal', 'Insurance', 'Utilities',
                             'Other'];

    this.CATEGORY_COLORS = {
      'Dev': 'blue',
      'Social': 'pink',
      'Entertainment': 'red',
      'Shopping': 'orange',
      'Work': 'green',
      'News': 'purple',
      'Cloud': 'cyan',
      'Docs': 'yellow',
      'Finance': 'green',
      'AI': 'purple',
      'Education': 'blue',
      'Communication': 'pink',
      'Health': 'green',
      'Travel': 'orange',
      'Design': 'purple',
      'Analytics': 'blue',
      'Security': 'red',
      'Marketing': 'orange',
      'Government': 'grey',
      'Food': 'yellow',
      'Photography': 'purple',
      'Real Estate': 'green',
      'HR': 'blue',
      'Legal': 'grey',
      'Insurance': 'green',
      'Utilities': 'grey',
      'Other': 'grey'
    };
  }

  async initialize() {
    if (this.loading || this.ready) return;

    try {
      this.loading = true;
      console.log('🤖 Initializing AI categorization...');

      // Try WebGPU first if available
      if (navigator.gpu) {
        console.log('WebGPU detected! Attempting to load GPU-accelerated model...');
        try {
          // Use a larger, more capable model
          // Options:
          // - "Llama-3.2-3B-Instruct-q4f16_1-MLC" (3B params, better instruction following)
          // - "Phi-3.5-mini-instruct-q4f16_1-MLC" (3.8B params, Microsoft)
          // - "gemma-2-2b-it-q4f16_1-MLC" (2B params, Google)
          // - "Qwen2.5-3B-Instruct-q4f16_1-MLC" (3B params, Alibaba)
          // - "Llama-3.1-8B-Instruct-q4f16_1-MLC" (8B params, largest available)
          // - "Qwen2.5-7B-Instruct-q4f16_1-MLC" (7B params, very capable)
          const modelId = "Llama-3.1-8B-Instruct-q4f16_1-MLC"; // Using the 8B model for better accuracy

          this.engine = await webllm.CreateMLCEngine(modelId, {
            initProgressCallback: (progress) => {
              const percent = Math.round((progress.progress || 0) * 100);
              console.log(`Loading GPU model: ${percent}% - ${progress.text || ''}`);
            }
          });

          this.ready = true;
          this.mode = 'gpu';
          console.log('✅ GPU model loaded successfully with WebLLM!');
          return; // Success with GPU

        } catch (gpuError) {
          console.log('Failed to load WebLLM GPU model:', gpuError.message);
          console.log('Falling back to CPU...');
        }
      }

      // Fallback to pattern-based categorization
      console.log('WebGPU not available or failed to load. Falling back to pattern-based categorization');
      this.mode = 'pattern';
      this.ready = true;

    } catch (error) {
      console.error('Failed to initialize LocalLLM:', error);
      this.loadError = error.message;
      this.mode = 'pattern';
      this.ready = true; // Still ready with pattern fallback
    } finally {
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
        message: 'Loading AI model...'
      };
    } else if (this.ready) {
      const modeMessages = {
        'gpu': 'WebGPU acceleration active',
        'pattern': 'Smart pattern matching active'
      };
      return {
        status: 'ready',
        message: modeMessages[this.mode] || 'Ready'
      };
    } else if (this.loadError) {
      return {
        status: 'error',
        message: this.loadError
      };
    } else {
      return {
        status: 'idle',
        message: 'Not initialized'
      };
    }
  }

  async categorizeTabs(tabs, maxGroups = 5) {
    console.log(`📊 Categorizing ${tabs.length} tabs using mode: ${this.mode || 'pattern'}`);

    if (this.mode === 'gpu' && this.engine) {
      return this.gpuCategorization(tabs, maxGroups);
    } else {
      return this.patternBasedCategorization(tabs, maxGroups);
    }
  }

  async gpuCategorization(tabs, maxGroups, retryCount = 0) {
    try {
      // Create a prompt for the LLM with enhanced metadata
      const tabList = tabs.map(t => {
        let info = `[${t.id}] ${t.domain}: ${t.title.substring(0, 50)}`;
        
        // Add metadata hints if available
        const hints = [];
        if (t.ogSiteName) hints.push(`site:${t.ogSiteName}`);
        if (t.ogType) hints.push(`type:${t.ogType}`);
        if (t.schemaType) hints.push(`schema:${t.schemaType}`);
        if (t.applicationName) hints.push(`app:${t.applicationName}`);
        if (t.generator) hints.push(`tech:${t.generator}`);
        if (t.keywords) hints.push(`keywords:${t.keywords.substring(0, 30)}`);
        
        if (hints.length > 0) {
          info += ` (${hints.join(', ')})`;
        }
        
        return info;
      }).join('\n');

      // Create a simpler prompt for tab categorization
      const prompt = `Categorize these browser tabs into appropriate categories.

Tabs to categorize:
${tabList}

Available categories: ${this.VALID_CATEGORIES.join(', ')}

Return ONLY a JSON object where each key is a tab ID and each value is ONE category from the list above.
Format: {"tabId":"category"}

Example output: {"1803249002":"AI","1803249030":"Docs","1803249067":"Dev"}

Important: 
- Use ONLY the tab IDs shown above
- Each tab ID must appear exactly once
- Use ONLY categories from the provided list
- Return ONLY valid JSON, no other text`;

      console.log(`📝 LLM GPU Prompt (attempt ${retryCount + 1}/3):`);
      console.log(prompt);
      console.log('---End of Prompt---');

      const response = await this.engine.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "Output ONLY JSON. No explanations. No code. No markdown. Just the JSON object with groups array."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.0,
        max_tokens: Math.min(tabs.length * 30 + 200, 6000) // Dynamically size based on tab count
      });

      let resultText = response.choices[0].message.content;

      // Log raw LLM response
      console.log('🤖 LLM GPU Raw Response:', resultText);

      // Clean up the response
      resultText = resultText.trim();

      // Strip markdown code blocks if present
      resultText = resultText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

      // Check if response starts with array or object
      const firstBrace = resultText.indexOf('{');
      const firstBracket = resultText.indexOf('[');

      let jsonStr;

      // Handle array response (convert to expected format)
      if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
        const lastBracket = resultText.lastIndexOf(']');
        if (lastBracket === -1) {
          throw new Error('Incomplete array in response');
        }
        const arrayStr = resultText.substring(firstBracket, lastBracket + 1);
        // Wrap array in expected format
        jsonStr = `{"groups": ${arrayStr}}`;
        console.log('📦 Detected array response, wrapping in groups object');
      }
      // Handle object response
      else if (firstBrace !== -1) {
        const lastBrace = resultText.lastIndexOf('}');
        if (lastBrace === -1 || lastBrace < firstBrace) {
          throw new Error('Incomplete object in response');
        }
        jsonStr = resultText.substring(firstBrace, lastBrace + 1);
      }
      else {
        throw new Error('No valid JSON structure found in response');
      }

      // Log the extracted JSON before parsing
      console.log('🔍 Extracted JSON to parse:', jsonStr.substring(0, 500) + (jsonStr.length > 500 ? '...' : ''));

      // Try to parse the JSON
      let result;
      try {
        // First, try to fix common issues with duplicate "groups" keys
        // Convert {"groups":[...],"groups":[...]} to {"groups":[...,...]}
        if (jsonStr.includes(',"groups":')) {
          console.log('Detected duplicate "groups" keys, attempting to fix...');

          // Extract all groups arrays
          const groupArrays = [];
          const regex = /"groups"\s*:\s*\[(.*?)\]/g;
          let match;
          while ((match = regex.exec(jsonStr)) !== null) {
            try {
              const groupContent = '[' + match[1] + ']';
              const parsed = JSON.parse(groupContent);
              groupArrays.push(...parsed);
            } catch (e) {
              console.error('Failed to parse group segment:', e);
            }
          }

          if (groupArrays.length > 0) {
            jsonStr = JSON.stringify({ groups: groupArrays });
            console.log('Fixed JSON structure, merged multiple groups arrays');
          }
        }

        result = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error('JSON parse error:', parseError.message);

        // If JSON is incomplete and we haven't retried yet, retry with higher token limit
        if (retryCount < 2) {
          console.log(`Retrying with higher token limit (attempt ${retryCount + 1}/2)...`);

          // Recursive call with incremented retry count
          // This will regenerate the prompt and try again
          return this.gpuCategorization(tabs, maxGroups, retryCount + 1);
        }

        throw new Error(`Failed to parse JSON after ${retryCount + 1} attempts: ${parseError.message}`);
      }

      // Process the dictionary response (tabId -> category mapping)
      console.log('🤖 Processing tab-to-category mapping');

      // Build groups from the mapping
      const groupMap = new Map();
      const colorMap = this.CATEGORY_COLORS;
      const processedTabIds = new Set(); // Track processed tabs to avoid duplicates

      // Create a set of valid tab IDs for validation
      const validTabIds = new Set(tabs.map(t => t.id));
      
      // Process each tab assignment
      for (const [tabIdStr, category] of Object.entries(result)) {
        const tabId = parseInt(tabIdStr);
        if (isNaN(tabId)) continue;
        
        // Skip if this tab ID doesn't exist in our input (LLM hallucination)
        if (!validTabIds.has(tabId)) {
          console.warn(`Skipping non-existent tab ID ${tabId} from LLM response`);
          continue;
        }
        
        // Skip if we've already processed this tab ID (handles LLM repetition bug)
        if (processedTabIds.has(tabId)) {
          console.warn(`Skipping duplicate tab ID ${tabId} in LLM response`);
          continue;
        }
        processedTabIds.add(tabId);

        // Validate and normalize category name
        const validCategory = this.validateSingleCategoryName(category);

        if (!groupMap.has(validCategory)) {
          groupMap.set(validCategory, {
            name: validCategory,
            color: colorMap[validCategory] || 'grey',
            tabIds: []
          });
        }

        groupMap.get(validCategory).tabIds.push(tabId);
      }
      
      // Check if we missed any tabs due to truncation or hallucination
      const missingTabs = tabs.filter(t => !processedTabIds.has(t.id));
      if (missingTabs.length > 0) {
        console.warn(`LLM response missing ${missingTabs.length} tabs out of ${tabs.length} total`);
        
        // If more than 50% of tabs are missing, the LLM response is too unreliable
        if (missingTabs.length > tabs.length * 0.5) {
          console.error('LLM response too unreliable (>50% tabs missing), falling back to pattern-based categorization');
          return this.patternBasedCategorization(tabs, maxGroups);
        }
        
        // Otherwise, add missing tabs to Other category
        if (!groupMap.has('Other')) {
          groupMap.set('Other', {
            name: 'Other',
            color: 'grey',
            tabIds: []
          });
        }
        groupMap.get('Other').tabIds.push(...missingTabs.map(t => t.id));
      }

      // Convert to array
      const groups = Array.from(groupMap.values());

      // Log final groups
      console.log('🤖 LLM GPU Final Groups:');
      groups.forEach(group => {
        console.log(`  - ${group.name}: ${group.tabIds.length} tabs`);
      });

      return { groups };

    } catch (error) {
      console.error('GPU categorization failed:', error);
      // Fallback to pattern-based
      return this.patternBasedCategorization(tabs, maxGroups);
    }
  }


  patternBasedCategorization(tabs, maxGroups) {
    console.log('📝 Pattern-Based Categorization - Processing tabs:');
    tabs.forEach(tab => {
      const metadata = [];
      if (tab.ogSiteName) metadata.push(`site:${tab.ogSiteName}`);
      if (tab.ogType) metadata.push(`type:${tab.ogType}`);
      if (tab.applicationName) metadata.push(`app:${tab.applicationName}`);
      const metaStr = metadata.length > 0 ? ` (${metadata.join(', ')})` : '';
      console.log(`  [${tab.id}] ${tab.domain}: ${tab.title}${metaStr}`);
    });

    // Use Map to prevent duplicate groups
    const categories = new Map();
    const patterns = {
      'Dev': /github|gitlab|stackoverflow|localhost|codepen|jsfiddle|replit|vercel|netlify|npm|yarn/i,
      'Social': /facebook|twitter|instagram|linkedin|reddit|discord|slack|telegram|whatsapp|mastodon/i,
      'Entertainment': /youtube|netflix|spotify|twitch|hulu|disney|prime video|vimeo|soundcloud|steam|epic|xbox|playstation|nintendo|itch\.io|gog/i,
      'Shopping': /amazon|ebay|etsy|alibaba|walmart|target|bestbuy|shopify/i,
      'Work': /gmail|outlook|office|docs\.google|drive\.google|notion|asana|trello|jira|monday/i,
      'News': /cnn|bbc|reuters|bloomberg|techcrunch|hackernews|nytimes|wsj|guardian/i,
      'Cloud': /aws|azure|gcp|console\.cloud|portal\.azure|console\.aws|digitalocean|heroku/i,
      'Docs': /docs\.|documentation|wiki|mdn|w3schools|devdocs|readme|api\./i,
      'Finance': /bank|paypal|venmo|crypto|coinbase|binance|robinhood|fidelity|chase|schwab|vanguard|etrade|ameritrade|wellsfargo|bofa|citibank|capital\s*one|discover|amex|mastercard|visa|mint|quicken|turbotax/i,
      'AI': /openai|claude|anthropic|huggingface|colab|kaggle|chatgpt|bard|gemini/i,
      'Education': /coursera|udemy|khan|edx|udacity|pluralsight|skillshare/i
    };

    // Track which tabs belong to which category
    tabs.forEach(tab => {
      let category = null;
      let bestMatchLength = 0;

      // Check metadata hints first for better categorization
      if (tab.ogType) {
        const ogTypeLower = tab.ogType.toLowerCase();
        if (ogTypeLower.includes('article') || ogTypeLower.includes('blog')) {
          category = 'News';
        } else if (ogTypeLower.includes('video') || ogTypeLower.includes('music')) {
          category = 'Entertainment';
        } else if (ogTypeLower.includes('product') || ogTypeLower.includes('shopping')) {
          category = 'Shopping';
        } else if (ogTypeLower.includes('profile') || ogTypeLower.includes('person')) {
          category = 'Social';
        }
      }
      
      if (tab.schemaType) {
        const schemaLower = tab.schemaType.toLowerCase();
        if (schemaLower.includes('softwareapplication') || schemaLower.includes('code')) {
          category = 'Dev';
        } else if (schemaLower.includes('article') || schemaLower.includes('newsarticle')) {
          category = 'News';
        } else if (schemaLower.includes('product') || schemaLower.includes('offer')) {
          category = 'Shopping';
        } else if (schemaLower.includes('course') || schemaLower.includes('educational')) {
          category = 'Education';
        }
      }

      // If no metadata match, use pattern matching
      if (!category) {
        // Find the best matching pattern (longest match wins)
        for (const [cat, pattern] of Object.entries(patterns)) {
          const domainMatch = tab.domain.match(pattern);
          const titleMatch = tab.title.match(pattern);
          const siteNameMatch = tab.ogSiteName ? tab.ogSiteName.match(pattern) : null;
          const appNameMatch = tab.applicationName ? tab.applicationName.match(pattern) : null;
          
          const matchLength = (domainMatch ? domainMatch[0].length : 0) +
                             (titleMatch ? titleMatch[0].length : 0) +
                             (siteNameMatch ? siteNameMatch[0].length : 0) +
                             (appNameMatch ? appNameMatch[0].length : 0);

          if (matchLength > bestMatchLength) {
            category = cat;
            bestMatchLength = matchLength;
          }
        }
      }

      // If no pattern matches, categorize as 'Other'
      if (!category) {
        category = 'Other';
      }

      // Add to category map
      if (!categories.has(category)) {
        categories.set(category, {
          name: category,
          color: this.selectColor(category),
          tabIds: []
        });
      }
      categories.get(category).tabIds.push(tab.id);
    });

    // Convert to array and limit groups
    let groups = Array.from(categories.values());

    // Log what pattern matching found
    console.log('🔍 Pattern-Based Categorization Results:');
    groups.forEach(group => {
      console.log(`  - ${group.name}: ${group.tabIds.length} tabs`);
    });

    groups = this.limitGroups(groups, maxGroups);

    return { groups };
  }

  validateSingleCategoryName(category) {
    // Check if it's already valid
    const matched = this.VALID_CATEGORIES.find(cat =>
      cat.toLowerCase() === category.toLowerCase().trim()
    );
    if (matched) return matched;

    // If not valid, return Other
    return 'Other';
  }

  validateGroupNames(groups) {
    const validCategories = this.VALID_CATEGORIES;

    const validatedGroups = [];

    for (const group of groups) {
      let groupName = group.name;

      // Check if the group name is valid
      const isValid = validCategories.some(cat =>
        cat.toLowerCase() === groupName.toLowerCase().trim()
      );

      if (!isValid) {
        console.warn(`Invalid group name detected: "${groupName}"`);

        // Try to categorize based on the invalid name
        const lowerName = groupName.toLowerCase();

        // Check for common website-based names and map them appropriately
        if (lowerName.includes('stocktwits') || lowerName.includes('robinhood') ||
            lowerName.includes('schwab') || lowerName.includes('fidelity')) {
          groupName = 'Finance';
        } else if (lowerName.includes('github') || lowerName.includes('gitlab') ||
                   lowerName.includes('stackoverflow')) {
          groupName = 'Dev';
        } else if (lowerName.includes('youtube') || lowerName.includes('netflix') ||
                   lowerName.includes('spotify')) {
          groupName = 'Entertainment';
        } else if (lowerName.includes('facebook') || lowerName.includes('twitter') ||
                   lowerName.includes('instagram') || lowerName.includes('linkedin')) {
          groupName = 'Social';
        } else if (lowerName.includes('amazon') || lowerName.includes('ebay') ||
                   lowerName.includes('shopify')) {
          groupName = 'Shopping';
        } else if (lowerName.includes('google') || lowerName.includes('gmail') ||
                   lowerName.includes('outlook')) {
          groupName = 'Work';
        } else if (lowerName.includes('.com') || lowerName.includes('.org') ||
                   lowerName.includes('.net') || lowerName.includes('http')) {
          // If it looks like a website name, put it in Other
          groupName = 'Other';
        } else {
          // Default to Other for any unrecognized names
          groupName = 'Other';
        }

        console.log(`Converted "${group.name}" to "${groupName}"`);
      }

      // Find the proper case version of the validated name
      const properName = validCategories.find(cat =>
        cat.toLowerCase() === groupName.toLowerCase()
      ) || groupName;

      validatedGroups.push({
        ...group,
        name: properName,
        color: group.color || this.selectColor(properName)
      });
    }

    return validatedGroups;
  }

  deduplicateGroups(groups) {
    const seen = new Map();
    const deduplicated = [];

    for (const group of groups) {
      const normalizedName = group.name.toLowerCase().trim();
      if (!seen.has(normalizedName)) {
        seen.set(normalizedName, true);
        deduplicated.push(group);
      } else {
        // Merge tab IDs into existing group
        const existing = deduplicated.find(g =>
          g.name.toLowerCase().trim() === normalizedName
        );
        if (existing) {
          existing.tabIds.push(...group.tabIds);
        }
      }
    }

    return deduplicated;
  }

  limitGroups(groups, maxGroups) {
    // Sort by number of tabs (descending)
    groups.sort((a, b) => b.tabIds.length - a.tabIds.length);

    if (groups.length > maxGroups) {
      // Keep the largest groups
      const keepGroups = groups.slice(0, maxGroups - 1);
      const mergeGroups = groups.slice(maxGroups - 1);

      // Merge smaller groups into 'Other'
      const otherTabIds = mergeGroups.flatMap(g => g.tabIds);
      if (otherTabIds.length > 0) {
        // Check if 'Other' already exists in keepGroups
        const existingOther = keepGroups.find(g => g.name === 'Other');
        if (existingOther) {
          existingOther.tabIds.push(...otherTabIds);
        } else {
          keepGroups.push({
            name: 'Other',
            color: 'grey',
            tabIds: otherTabIds
          });
        }
      }

      groups = keepGroups;
    }

    return groups;
  }

  async findBestGroup(tab, existingGroups) {
    if (this.mode === 'gpu' && this.engine) {
      return this.gpuFindGroup(tab, existingGroups);
    }
    return this.patternFindGroup(tab, existingGroups);
  }

  async gpuFindGroup(tab, existingGroups) {
    try {
      const prompt = `Which group best fits this tab?
Tab: ${tab.domain} - ${tab.title}
Groups: ${existingGroups.map(g => g.name).join(', ')}
Reply with just the group name or "none" if no match.`;

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
      console.error('Failed to find group with GPU:', error);
      return this.patternFindGroup(tab, existingGroups);
    }
  }


  patternFindGroup(tab, existingGroups) {
    const domainPatterns = {
      'dev': /github|gitlab|stackoverflow|localhost/i,
      'social': /facebook|twitter|instagram|linkedin|reddit/i,
      'entertainment': /youtube|netflix|spotify|twitch/i,
      'work': /gmail|outlook|office|docs\.google/i,
      'cloud': /aws|azure|gcp|console/i,
      'shopping': /amazon|ebay|etsy|walmart/i,
      'news': /cnn|bbc|reuters|bloomberg/i
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

  async categorizeTab(tab) {
    if (this.mode === 'gpu' && this.engine) {
      return this.gpuCategorizeTab(tab);
    }
    return this.patternCategorizeTab(tab);
  }

  async gpuCategorizeTab(tab) {
    try {
      const prompt = `Categorize this tab with a short name (1-2 words):
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
      console.error('Failed to categorize tab with GPU:', error);
      return this.patternCategorizeTab(tab);
    }
  }


  patternCategorizeTab(tab) {
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
    } else if (/gmail|outlook|docs\.google/.test(domain)) {
      return { name: 'Work', color: 'green' };
    } else {
      return { name: 'Other', color: 'grey' };
    }
  }

  sanitizeName(name) {
    // Clean up garbled or nonsensical names from LLM
    let cleaned = name.trim();

    // Fix known bad/garbled names
    const badPatterns = [
      /^categorize/i,
      /^uncategor/i,
      /^misc/i,
      /^general$/i,
      /^various$/i,
      /^mixed$/i,
      /^unknown$/i
    ];

    for (const pattern of badPatterns) {
      if (pattern.test(cleaned)) {
        return 'Other';
      }
    }

    // Check if name is garbled (too many consonants in a row or no vowels)
    if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(cleaned) || !/[aeiou]/i.test(cleaned)) {
      console.warn(`Garbled category name detected: "${name}", using "Other"`);
      return 'Other';
    }

    // Check if it's a valid category name
    const validCategories = this.VALID_CATEGORIES;

    // If it matches a valid category (case insensitive), use that
    const matched = validCategories.find(cat =>
      cat.toLowerCase() === cleaned.toLowerCase()
    );
    if (matched) return matched;

    // Otherwise clean it up
    cleaned = cleaned
      .replace(/\s+/g, '')
      .replace(/^./, str => str.toUpperCase())
      .substring(0, 15);

    // Final check - if it's still weird, use Other
    if (cleaned.length < 2 || /^\d+$/.test(cleaned)) {
      return 'Other';
    }

    return cleaned;
  }

  selectColor(name) {
    return this.CATEGORY_COLORS[name] || this.hashColor(name);
  }

  hashColor(name) {
    const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }
}
