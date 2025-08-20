import { TabGroupManager } from './modules/TabGroupManager.js';
import { LocalLLM } from './modules/LocalLLM.js';
import { StorageManager } from './modules/StorageManager.js';

class TooTabTooFurious {
  constructor() {
    this.llm = new LocalLLM();
    this.tabManager = new TabGroupManager();
    this.storage = new StorageManager();
    this.isAutoMode = false;
    this.maxGroups = 5;
    this.initializeExtension();
  }

  async initializeExtension() {
    console.log('🏁 TooTabTooFurious starting up...');
    
    // Load settings
    const settings = await this.storage.getSettings();
    this.isAutoMode = settings.autoMode || false;
    this.maxGroups = settings.maxGroups || 5;
    
    // Initialize LLM
    await this.llm.initialize();
    
    // Set up listeners
    this.setupListeners();
    
    // Initial organization if auto mode is on
    if (this.isAutoMode) {
      this.organizeTabs();
    }
  }

  setupListeners() {
    // Listen for messages from popup and offscreen document
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Handle LLM progress updates from offscreen document
      if (request.type === 'llm-progress') {
        this.llm.loadProgress = request.progress;
        this.llm.loading = true;
        console.log(`LLM Loading: ${request.progress}% - ${request.text}`);
        return false;
      } else if (request.type === 'llm-ready') {
        this.llm.ready = true;
        this.llm.loading = false;
        this.llm.loadProgress = 100;
        console.log('LLM Ready!');
        return false;
      } else if (request.type === 'llm-error') {
        this.llm.loadError = request.error;
        this.llm.loading = false;
        console.error('LLM Error:', request.error);
        return false;
      } else if (request.type === 'llm-fallback') {
        this.llm.ready = false;
        this.llm.loading = false;
        this.llm.loadError = request.error || 'No GPU - using smart patterns';
        this.llm.offscreenReady = true; // Still ready to process with fallback
        console.log('Using fallback categorization:', request.error);
        return false;
      }
      
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
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async organizeTabs() {
    console.log('🚀 Organizing tabs...');
    
    // Get all tabs
    const tabs = await chrome.tabs.query({ currentWindow: true });
    
    // Filter out chrome:// and extension pages, and already grouped tabs
    const organizableTabs = tabs.filter(tab => 
      tab.url && 
      !tab.url.startsWith('chrome://') && 
      !tab.url.startsWith('chrome-extension://') &&
      tab.groupId === -1 // Only organize ungrouped tabs
    );
    
    if (organizableTabs.length === 0) {
      return { message: 'No ungrouped tabs to organize' };
    }
    
    // Get enhanced tab information with metadata
    const tabInfo = await Promise.all(organizableTabs.map(async tab => {
      let metadata = {};
      
      // Try to get metadata from content script
      try {
        metadata = await chrome.tabs.sendMessage(tab.id, { action: 'extractMetadata' });
      } catch (error) {
        // Content script not available or failed
        console.log(`Could not extract metadata from tab ${tab.id}:`, error.message);
      }
      
      return {
        id: tab.id,
        title: tab.title || '',
        url: tab.url,
        domain: new URL(tab.url).hostname,
        // Enhanced metadata for better categorization
        description: metadata.description || '',
        keywords: metadata.keywords || '',
        ogType: metadata.ogType || '',
        schemaType: metadata.schemaType || '',
        mainHeading: metadata.mainHeading || '',
        bodyPreview: metadata.bodyText || ''
      };
    }));
    
    // Use LLM to categorize tabs with enhanced metadata
    const categories = await this.llm.categorizeTabs(tabInfo, this.maxGroups);
    
    // Create tab groups (will merge with existing groups if names match)
    const groups = await this.tabManager.createGroups(categories, organizableTabs);
    
    // Save group history
    await this.storage.saveGroupHistory(groups);
    
    return {
      message: 'Tabs organized successfully',
      groupsCreated: groups.length,
      tabsOrganized: organizableTabs.length
    };
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

// Initialize extension
const extension = new TooTabTooFurious();