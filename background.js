import { TabGroupManager } from './modules/TabGroupManager.js';
// Use the fine-tuned tab categorizer with optimized patterns and prompts
import { FineTunedTabCategorizer as LocalLLM } from './modules/FineTunedTabCategorizer.js';
import { StorageManager } from './modules/StorageManager.js';

class TooTabbedTooFurious {
  constructor() {
    this.llm = new LocalLLM();
    this.tabManager = new TabGroupManager();
    this.storage = new StorageManager();
    this.isAutoMode = false;
    this.maxGroups = 5;
    this.initializeExtension();
  }

  async initializeExtension() {
    console.log('🏁 TooTabbedTooFurious starting up...');
    
    // Load settings
    const settings = await this.storage.getSettings();
    this.isAutoMode = settings.autoMode || false;
    this.maxGroups = settings.maxGroups || 5;
    
    // Initialize LLM
    await this.llm.initialize();
    
    // Set up listeners
    this.setupListeners();
    
    // Auto-organize and deduplicate on startup if auto mode is enabled
    if (this.isAutoMode) {
      console.log('🤖 Auto mode enabled - organizing and deduplicating tabs on startup...');
      
      // First clean up duplicates
      console.log('🧹 Running duplicate cleanup...');
      try {
        const result = await this.tabManager.cleanupAllDuplicates();
        console.log('Startup cleanup result:', result);
      } catch (error) {
        console.error('Failed to cleanup duplicates on startup:', error);
      }
      
      // Then organize tabs
      console.log('📊 Organizing tabs...');
      await this.organizeTabs();
    } else {
      // Even if auto mode is off, still clean up duplicates on startup
      console.log('🧹 Running duplicate cleanup on startup...');
      try {
        const result = await this.tabManager.cleanupAllDuplicates();
        console.log('Startup cleanup result:', result);
      } catch (error) {
        console.error('Failed to cleanup duplicates on startup:', error);
      }
    }
  }

  setupListeners() {
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Handle regular messages
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep channel open for async response
    });

    // Listen for tab events in auto mode
    chrome.tabs.onCreated.addListener((tab) => {
      if (this.isAutoMode) {
        this.handleNewTab(tab);
      }
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (this.isAutoMode && changeInfo.status === 'complete') {
        this.handleTabUpdate(tab);
      }
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'organizeTabs':
          const result = await this.organizeTabs();
          sendResponse({ success: true, result });
          break;
          
        case 'toggleAutoMode':
          this.isAutoMode = request.enabled;
          await this.storage.updateSettings({ autoMode: this.isAutoMode });
          sendResponse({ success: true, autoMode: this.isAutoMode });
          break;
          
        case 'getStatus':
          const llmStatus = this.llm.getStatus();
          sendResponse({
            success: true,
            status: {
              autoMode: this.isAutoMode,
              llmReady: this.llm.isReady(),
              llmStatus: llmStatus,
              maxGroups: this.maxGroups,
              tabCount: await this.getTabCount(),
              groupCount: await this.getGroupCount()
            }
          });
          break;
          
        case 'updateMaxGroups':
          this.maxGroups = request.maxGroups;
          await this.storage.updateSettings({ maxGroups: this.maxGroups });
          sendResponse({ success: true, maxGroups: this.maxGroups });
          break;
          
        case 'cleanupDuplicates':
          console.log('Running aggressive duplicate cleanup...');
          await this.tabManager.cleanupAllDuplicates();
          sendResponse({ success: true, message: 'Duplicate groups cleaned up' });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async organizeTabs() {
    console.log(`🚀 Organizing tabs across all windows...`);
    
    try {
      console.log('Step 1: Getting window info...');
      
      // Always organize all windows
      const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
      console.log(`Found ${windows.length} normal windows`);
      
      // Log each window
      for (const window of windows) {
        const windowTabs = await chrome.tabs.query({ windowId: window.id });
        console.log(`Window ${window.id} (${window.state}): ${windowTabs.length} tabs`);
      }
      
      // Get ALL tabs from ALL windows
      let tabs = await chrome.tabs.query({});
      console.log(`Step 2: Found ${tabs.length} total tabs across all windows`);
      
      // Filter to only normal window tabs
      const normalWindowIds = new Set(windows.map(w => w.id));
      tabs = tabs.filter(tab => normalWindowIds.has(tab.windowId));
      console.log(`After filtering to normal windows: ${tabs.length} tabs`);
      
      // Filter out chrome:// and extension pages and pinned tabs
      console.log(`Step 3: Filtering ${tabs.length} tabs...`);
      
      // Log what we're filtering
      const chromeTabs = tabs.filter(tab => tab.url && tab.url.startsWith('chrome://'));
      const extensionTabs = tabs.filter(tab => tab.url && tab.url.startsWith('chrome-extension://'));
      const pinnedTabs = tabs.filter(tab => tab.pinned);
      const noUrlTabs = tabs.filter(tab => !tab.url);
      
      console.log(`  - Chrome tabs: ${chromeTabs.length}`);
      console.log(`  - Extension tabs: ${extensionTabs.length}`);
      console.log(`  - Pinned tabs: ${pinnedTabs.length}`);
      console.log(`  - Tabs without URL: ${noUrlTabs.length}`);
      
      const organizableTabs = tabs.filter(tab => 
        tab.url && 
        !tab.url.startsWith('chrome://') && 
        !tab.url.startsWith('chrome-extension://') &&
        !tab.pinned
      );
      console.log(`Step 3b: ${organizableTabs.length} tabs to organize (after filtering)`);
      
      // Log first 5 organizable tabs for debugging
      console.log('Sample of organizable tabs:');
      organizableTabs.slice(0, 5).forEach(tab => {
        console.log(`  - [${tab.id}] ${tab.url.substring(0, 50)}... (window: ${tab.windowId})`);
      });
      
      if (organizableTabs.length === 0) {
        console.log('No tabs to organize');
        return { message: 'No tabs to organize' };
      }
      
      console.log('Step 4: Getting tab metadata...');
      // Get enhanced tab information with metadata
      const tabInfo = await Promise.all(organizableTabs.map(async tab => {
        let metadata = {};
        
        // Try to get metadata from content script
        try {
          metadata = await chrome.tabs.sendMessage(tab.id, { action: 'extractMetadata' });
        } catch (error) {
          // Content script not available or failed
          console.log(`  Could not extract metadata from tab ${tab.id}: ${error.message}`);
        }
        
        return {
          id: tab.id,
          title: tab.title || '',
          url: tab.url,
          domain: new URL(tab.url).hostname,
          // Enhanced metadata for better categorization
          description: metadata.description || metadata.ogDescription || '',
          keywords: metadata.keywords || '',
          ogType: metadata.ogType || '',
          ogSiteName: metadata.ogSiteName || '',
          schemaType: metadata.schemaType || '',
          applicationName: metadata.applicationName || '',
          generator: metadata.generator || '',
          mainHeading: metadata.mainHeading || '',
          bodyPreview: metadata.bodyText || ''
        };
      }));
      console.log('Step 5: Metadata collected');
      
      console.log('Step 6: Initializing LLM if needed...');
      if (!this.llm.isReady()) {
        console.log('  LLM not ready, initializing...');
        await this.llm.initialize();
      }
      console.log('  LLM status:', this.llm.getStatus());
      
      console.log('Step 7: Calling LLM.categorizeTabs()...');
      // Use LLM to categorize tabs with enhanced metadata
      const categories = await this.llm.categorizeTabs(tabInfo, this.maxGroups);
      console.log('Step 8: Categories received:', categories);
    
      console.log('Step 9: Creating/merging tab groups...');
      
      // Group tabs by window ID
      const tabsByWindow = {};
      organizableTabs.forEach(tab => {
        if (!tabsByWindow[tab.windowId]) {
          tabsByWindow[tab.windowId] = [];
        }
        tabsByWindow[tab.windowId].push(tab);
      });
      
      // Create groups in each window separately
      const allGroups = [];
      for (const [windowId, windowTabs] of Object.entries(tabsByWindow)) {
        console.log(`Creating groups in window ${windowId} with ${windowTabs.length} tabs`);
        const windowGroups = await this.tabManager.createGroups(categories, windowTabs);
        allGroups.push(...windowGroups);
      }
      
      const groups = allGroups;
      console.log('Step 10: Groups created across all windows:', groups);
      
      console.log('Step 11: Saving group history...');
      // Save group history
      await this.storage.saveGroupHistory(groups);
      console.log('Step 12: Complete!');
      
      return {
        message: 'Tabs organized successfully',
        groupsCreated: groups.length,
        tabsOrganized: organizableTabs.length
      };
      
    } catch (error) {
      console.error('Error during organization:', error);
      console.error('Stack trace:', error.stack);
      throw error;
    }
  }

  async handleNewTab(tab) {
    // Wait a bit for the tab to load
    setTimeout(async () => {
      const updatedTab = await chrome.tabs.get(tab.id);
      if (updatedTab.url && !updatedTab.url.startsWith('chrome://')) {
        await this.assignTabToGroup(updatedTab);
      }
    }, 2000);
  }

  async handleTabUpdate(tab) {
    if (tab.groupId === -1 && tab.url && !tab.url.startsWith('chrome://')) {
      await this.assignTabToGroup(tab);
    }
  }

  async assignTabToGroup(tab) {
    // Get existing groups
    const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
    
    if (groups.length === 0) {
      // No groups exist, organize all tabs
      await this.organizeTabs();
      return;
    }
    
    // Use LLM to find best matching group
    const tabInfo = {
      id: tab.id,
      title: tab.title || '',
      url: tab.url,
      domain: new URL(tab.url).hostname
    };
    
    const existingCategories = groups.map(g => ({
      id: g.id,
      name: g.title || 'Untitled',
      color: g.color
    }));
    
    const bestGroup = await this.llm.findBestGroup(tabInfo, existingCategories);
    
    if (bestGroup) {
      await chrome.tabs.group({
        tabIds: [tab.id],
        groupId: bestGroup.id
      });
    } else if (groups.length < this.maxGroups) {
      // Create new group if under limit
      const category = await this.llm.categorizeTab(tabInfo);
      await this.tabManager.createNewGroup([tab], category);
    }
  }

  async getTabCount() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs.length;
  }

  async getGroupCount() {
    const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    return groups.length;
  }
}

// Initialize extension immediately
new TooTabbedTooFurious();
