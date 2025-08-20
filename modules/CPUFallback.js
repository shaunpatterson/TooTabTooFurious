import { pipeline } from '@xenova/transformers';

export class CPUFallback {
  constructor() {
    this.classifier = null;
    this.ready = false;
    this.loading = false;
    this.error = null;
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
              console.log(`Loading CPU model: ${percent}%`);
            }
          }
        }
      );
      
      this.ready = true;
      this.loading = false;
      console.log('✅ CPU fallback ready with transformers.js');
      
    } catch (error) {
      console.error('Failed to initialize CPU fallback:', error);
      this.error = error.message;
      this.loading = false;
      this.ready = false;
    }
  }

  async categorizeTabs(tabs, maxGroups = 5) {
    if (!this.ready) {
      console.log('CPU fallback not ready, using pattern matching');
      return this.patternBasedCategorization(tabs, maxGroups);
    }

    try {
      const candidateLabels = [
        'Development', 'Social Media', 'Entertainment', 'Shopping', 
        'Work', 'News', 'Cloud Services', 'Documentation', 
        'Education', 'Finance', 'Research', 'Gaming'
      ];
      
      const groups = new Map();
      const colorMap = {
        'Development': 'blue',
        'Social Media': 'pink',
        'Entertainment': 'red',
        'Shopping': 'orange',
        'Work': 'green',
        'News': 'purple',
        'Cloud Services': 'cyan',
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
        const simplifiedLabel = topLabel.replace(' ', '');
        
        if (!groups.has(simplifiedLabel)) {
          groups.set(simplifiedLabel, {
            name: simplifiedLabel,
            color: colorMap[topLabel] || 'grey',
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

    let groups = Array.from(categories.values());
    
    if (groups.length > maxGroups) {
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

  selectColor(name) {
    const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  getStatus() {
    if (this.loading) {
      return {
        status: 'loading',
        message: 'Loading CPU model...'
      };
    } else if (this.ready) {
      return {
        status: 'ready',
        message: 'CPU model ready (transformers.js)'
      };
    } else if (this.error) {
      return {
        status: 'error',
        message: this.error
      };
    } else {
      return {
        status: 'idle',
        message: 'CPU fallback not initialized'
      };
    }
  }
}