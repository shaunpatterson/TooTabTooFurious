// LocalLLM with WebGPU support (via WebLLM) and CPU fallback (via transformers.js)
import { pipeline, env } from '@xenova/transformers';
import * as webllm from '@mlc-ai/web-llm';

// Configure transformers.js for Chrome extension environment
env.allowLocalModels = false;
env.useBrowserCache = true;

export class LocalLLM {
  constructor() {
    this.ready = false;
    this.loading = false;
    this.loadError = null;
    this.mode = null; // 'gpu', 'cpu', or 'pattern'
    this.engine = null; // WebLLM engine for GPU
    this.classifier = null; // transformers.js classifier for CPU
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
          const modelId = "Llama-3.2-3B-Instruct-q4f16_1-MLC";

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

      // Fallback to transformers.js for CPU-based inference
      try {
        console.log('Loading transformers.js for CPU inference...');

        // Use a smaller model for faster loading
        this.classifier = await pipeline(
          'zero-shot-classification',
          'Xenova/mobilebert-uncased-mnli', // Smaller, faster model
          {
            progress_callback: (progress) => {
              if (progress.status === 'progress') {
                const percent = Math.round((progress.loaded / progress.total) * 100);
                console.log(`Loading CPU model: ${percent}%`);
              }
            }
          }
        );

        this.ready = true;
        this.mode = 'cpu';
        console.log('✅ CPU model loaded successfully');

      } catch (cpuError) {
        console.log('Failed to load transformers.js:', cpuError.message);
        console.log('Falling back to pattern-based categorization');
        this.mode = 'pattern';
        this.ready = true;
      }

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
        'cpu': 'CPU model active',
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
    } else if (this.mode === 'cpu' && this.classifier) {
      return this.cpuCategorization(tabs, maxGroups);
    } else {
      return this.patternBasedCategorization(tabs, maxGroups);
    }
  }

  async gpuCategorization(tabs, maxGroups, retryCount = 0) {
    try {
      // Create a prompt for the LLM
      const tabList = tabs.map(t =>
        `[${t.id}] ${t.domain}: ${t.title.substring(0, 250)}`
      ).join('\n');

      // Create a clear, structured prompt
      const prompt = `Categorize these browser tabs into groups.

Input tabs:
${tabList}

Task: Group these tabs by their purpose and return JSON.

Available categories: AI, Dev, Cloud, Work, Docs, News, Finance, Social, Entertainment, Shopping, Education, Gaming, Other
Available colors: blue, red, yellow, green, pink, purple, cyan, orange, grey

Guidelines:
- github.com → Dev (blue)
- claude.ai, huggingface.co → AI (purple)
- portal.azure.com, azurediagrams.com → Cloud (cyan)
- docs.*, *.documentation → Docs (yellow)
- atlassian.net, jira → Work (green)

Return a JSON object with this structure:
{"groups":[{"name":"<category>","color":"<color>","tabIds":[<actual_tab_ids>]}]}

Important: Use the actual tab ID numbers from the input list above.`;

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
        max_tokens: 6000
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

      // Validate the result structure
      if (!result.groups || !Array.isArray(result.groups)) {
        throw new Error('Invalid response structure: missing groups array');
      }

      // Log parsed groups before cleanup
      console.log('🤖 LLM GPU Categorization Results (before cleanup):');
      result.groups.forEach(group => {
        console.log(`  - ${group.name}: ${group.tabIds?.length || 0} tabs`);
      });

      // Validate group names and fix any invalid ones
      const validatedGroups = this.validateGroupNames(result.groups);

      // Ensure no duplicate groups
      const groups = this.deduplicateGroups(validatedGroups);

      // Log final groups after cleanup
      console.log('🤖 LLM GPU Final Groups (after cleanup):');
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

  async cpuCategorization(tabs, maxGroups) {
    try {
      console.log('📝 CPU Categorization - Processing tabs:');
      tabs.forEach(tab => {
        console.log(`  [${tab.id}] ${tab.domain}: ${tab.title}`);
      });

      const candidateLabels = [
        'development programming coding',
        'social media networking',
        'entertainment video music streaming',
        'shopping ecommerce retail',
        'work productivity office email',
        'news media journalism',
        'cloud computing services',
        'documentation reference learning',
        'finance banking money',
        'artificial intelligence machine learning',
        'education course tutorial',
        'gaming video games'
      ];

      const labelToCategory = {
        'development programming coding': { name: 'Dev', color: 'blue' },
        'social media networking': { name: 'Social', color: 'pink' },
        'entertainment video music streaming': { name: 'Entertainment', color: 'red' },
        'shopping ecommerce retail': { name: 'Shopping', color: 'orange' },
        'work productivity office email': { name: 'Work', color: 'green' },
        'news media journalism': { name: 'News', color: 'purple' },
        'cloud computing services': { name: 'Cloud', color: 'cyan' },
        'documentation reference learning': { name: 'Docs', color: 'yellow' },
        'finance banking money': { name: 'Finance', color: 'green' },
        'artificial intelligence machine learning': { name: 'AI', color: 'purple' },
        'education course tutorial': { name: 'Education', color: 'blue' },
        'gaming video games': { name: 'Gaming', color: 'red' }
      };

      // Use Map to prevent duplicates
      const categories = new Map();

      // Process tabs
      for (const tab of tabs) {
        const text = `${tab.domain} ${tab.title} ${tab.description || ''}`.substring(0, 512);

        try {
          const result = await this.classifier(text, candidateLabels, {
            multi_label: false,
            hypothesis_template: 'This webpage is about {}.'
          });

          const topLabel = result.labels[0];
          const category = labelToCategory[topLabel];

          if (!categories.has(category.name)) {
            categories.set(category.name, {
              name: category.name,
              color: category.color,
              tabIds: []
            });
          }

          categories.get(category.name).tabIds.push(tab.id);

        } catch (error) {
          console.error('Failed to classify tab:', error);
          // Add to Other category if classification fails
          if (!categories.has('Other')) {
            categories.set('Other', {
              name: 'Other',
              color: 'grey',
              tabIds: []
            });
          }
          categories.get('Other').tabIds.push(tab.id);
        }
      }

      // Convert to array and limit groups
      let groups = Array.from(categories.values());

      // Log what the LLM categorized
      console.log('🤖 LLM CPU Categorization Results:');
      groups.forEach(group => {
        console.log(`  - ${group.name}: ${group.tabIds.length} tabs`);
      });

      groups = this.limitGroups(groups, maxGroups);

      return { groups };

    } catch (error) {
      console.error('CPU categorization failed:', error);
      return this.patternBasedCategorization(tabs, maxGroups);
    }
  }

  patternBasedCategorization(tabs, maxGroups) {
    console.log('📝 Pattern-Based Categorization - Processing tabs:');
    tabs.forEach(tab => {
      console.log(`  [${tab.id}] ${tab.domain}: ${tab.title}`);
    });

    // Use Map to prevent duplicate groups
    const categories = new Map();
    const patterns = {
      'Dev': /github|gitlab|stackoverflow|localhost|codepen|jsfiddle|replit|vercel|netlify|npm|yarn/i,
      'Social': /facebook|twitter|instagram|linkedin|reddit|discord|slack|telegram|whatsapp|mastodon/i,
      'Entertainment': /youtube|netflix|spotify|twitch|hulu|disney|prime video|vimeo|soundcloud/i,
      'Shopping': /amazon|ebay|etsy|alibaba|walmart|target|bestbuy|shopify/i,
      'Work': /gmail|outlook|office|docs\.google|drive\.google|notion|asana|trello|jira|monday/i,
      'News': /cnn|bbc|reuters|bloomberg|techcrunch|hackernews|nytimes|wsj|guardian/i,
      'Cloud': /aws|azure|gcp|console\.cloud|portal\.azure|console\.aws|digitalocean|heroku/i,
      'Docs': /docs\.|documentation|wiki|mdn|w3schools|devdocs|readme|api\./i,
      'Finance': /bank|paypal|venmo|crypto|coinbase|binance|robinhood|fidelity|chase|schwab|vanguard|etrade|ameritrade|wellsfargo|bofa|citibank|capital\s*one|discover|amex|mastercard|visa|mint|quicken|turbotax/i,
      'AI': /openai|claude|anthropic|huggingface|colab|kaggle|chatgpt|bard|gemini/i,
      'Education': /coursera|udemy|khan|edx|udacity|pluralsight|skillshare/i,
      'Gaming': /steam|epic|xbox|playstation|nintendo|itch\.io|gog/i
    };

    // Track which tabs belong to which category
    tabs.forEach(tab => {
      let category = null;
      let bestMatchLength = 0;

      // Find the best matching pattern (longest match wins)
      for (const [cat, pattern] of Object.entries(patterns)) {
        const domainMatch = tab.domain.match(pattern);
        const titleMatch = tab.title.match(pattern);
        const matchLength = (domainMatch ? domainMatch[0].length : 0) +
                           (titleMatch ? titleMatch[0].length : 0);

        if (matchLength > bestMatchLength) {
          category = cat;
          bestMatchLength = matchLength;
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

  validateGroupNames(groups) {
    const validCategories = ['Dev', 'Social', 'Entertainment', 'Shopping', 'Work',
                            'News', 'Cloud', 'Docs', 'Finance', 'AI', 'Education',
                            'Communication', 'Health', 'Travel', 'Design', 'Analytics',
                            'Security', 'Marketing', 'Government', 'Food', 'Photography',
                            'Real Estate', 'HR', 'Legal', 'Insurance', 'Utilities',
                            'Gaming', 'Other'];

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
    } else if (this.mode === 'cpu' && this.classifier) {
      return this.cpuFindGroup(tab, existingGroups);
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

  async cpuFindGroup(tab, existingGroups) {
    try {
      const text = `${tab.domain} ${tab.title}`.substring(0, 256);
      const labels = existingGroups.map(g => g.name.toLowerCase());
      labels.push('none');

      const result = await this.classifier(text, labels, {
        multi_label: false
      });

      const topLabel = result.labels[0];
      if (topLabel === 'none') {
        return null;
      }

      return existingGroups.find(g =>
        g.name.toLowerCase() === topLabel
      ) || null;

    } catch (error) {
      console.error('Failed to find group with CPU:', error);
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
    } else if (this.mode === 'cpu' && this.classifier) {
      return this.cpuCategorizeTab(tab);
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

  async cpuCategorizeTab(tab) {
    try {
      const text = `${tab.domain} ${tab.title}`.substring(0, 256);
      const labels = ['Dev', 'Social', 'Entertainment', 'Work', 'Shopping', 'News', 'Cloud', 'Docs', 'Other'];

      const result = await this.classifier(text, labels, {
        multi_label: false
      });

      const topLabel = result.labels[0];
      return {
        name: topLabel,
        color: this.selectColor(topLabel)
      };

    } catch (error) {
      console.error('Failed to categorize tab with CPU:', error);
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
    const validCategories = ['Dev', 'Social', 'Entertainment', 'Shopping', 'Work',
                            'News', 'Cloud', 'Docs', 'Finance', 'AI', 'Education',
                            'Communication', 'Health', 'Travel', 'Design', 'Analytics',
                            'Security', 'Marketing', 'Government', 'Food', 'Photography',
                            'Real Estate', 'HR', 'Legal', 'Insurance', 'Utilities',
                            'Gaming', 'Other'];

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
    const colorMap = {
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
      'Gaming': 'red',
      'Other': 'grey'
    };

    return colorMap[name] || this.hashColor(name);
  }

  hashColor(name) {
    const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }
}
