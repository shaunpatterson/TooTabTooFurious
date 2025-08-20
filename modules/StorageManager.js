export class StorageManager {
  constructor() {
    this.storageKey = {
      settings: 'tttf_settings',
      groupHistory: 'tttf_group_history',
      stats: 'tttf_stats'
    };
  }

  async getSettings() {
    try {
      const result = await chrome.storage.local.get(this.storageKey.settings);
      return result[this.storageKey.settings] || {
        autoMode: false,
        maxGroups: 5,
        llmModel: 'local',
        theme: 'default'
      };
    } catch (error) {
      console.error('Failed to get settings:', error);
      return {
        autoMode: false,
        maxGroups: 5,
        llmModel: 'local',
        theme: 'default'
      };
    }
  }

  async updateSettings(updates) {
    try {
      const current = await this.getSettings();
      const updated = { ...current, ...updates };
      await chrome.storage.local.set({
        [this.storageKey.settings]: updated
      });
      return updated;
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  }

  async saveGroupHistory(groups) {
    try {
      const history = await this.getGroupHistory();
      const entry = {
        timestamp: Date.now(),
        groups: groups.map(g => ({
          name: g.name,
          color: g.color,
          tabCount: g.tabCount
        }))
      };

      // Keep last 50 entries
      history.unshift(entry);
      if (history.length > 50) {
        history.pop();
      }

      await chrome.storage.local.set({
        [this.storageKey.groupHistory]: history
      });

      // Update stats
      await this.updateStats(groups);
    } catch (error) {
      console.error('Failed to save group history:', error);
    }
  }

  async getGroupHistory() {
    try {
      const result = await chrome.storage.local.get(this.storageKey.groupHistory);
      return result[this.storageKey.groupHistory] || [];
    } catch (error) {
      console.error('Failed to get group history:', error);
      return [];
    }
  }

  async getRecentGroups(limit = 5) {
    try {
      const history = await this.getGroupHistory();
      if (history.length === 0) return [];

      // Get the most recent entry
      const recent = history[0];
      return recent.groups.slice(0, limit);
    } catch (error) {
      console.error('Failed to get recent groups:', error);
      return [];
    }
  }

  async updateStats(groups) {
    try {
      const stats = await this.getStats();
      
      stats.totalOrganizations = (stats.totalOrganizations || 0) + 1;
      stats.totalTabsOrganized = (stats.totalTabsOrganized || 0) + 
        groups.reduce((sum, g) => sum + g.tabCount, 0);
      stats.totalGroupsCreated = (stats.totalGroupsCreated || 0) + groups.length;
      stats.lastOrganized = Date.now();

      // Track most common groups
      if (!stats.commonGroups) {
        stats.commonGroups = {};
      }
      
      groups.forEach(group => {
        stats.commonGroups[group.name] = (stats.commonGroups[group.name] || 0) + 1;
      });

      await chrome.storage.local.set({
        [this.storageKey.stats]: stats
      });

      return stats;
    } catch (error) {
      console.error('Failed to update stats:', error);
    }
  }

  async getStats() {
    try {
      const result = await chrome.storage.local.get(this.storageKey.stats);
      return result[this.storageKey.stats] || {
        totalOrganizations: 0,
        totalTabsOrganized: 0,
        totalGroupsCreated: 0,
        lastOrganized: null,
        commonGroups: {}
      };
    } catch (error) {
      console.error('Failed to get stats:', error);
      return {
        totalOrganizations: 0,
        totalTabsOrganized: 0,
        totalGroupsCreated: 0,
        lastOrganized: null,
        commonGroups: {}
      };
    }
  }

  async clearHistory() {
    try {
      await chrome.storage.local.remove([
        this.storageKey.groupHistory,
        this.storageKey.stats
      ]);
      console.log('History cleared');
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }

  async exportData() {
    try {
      const settings = await this.getSettings();
      const history = await this.getGroupHistory();
      const stats = await this.getStats();

      return {
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        settings,
        history,
        stats
      };
    } catch (error) {
      console.error('Failed to export data:', error);
      throw error;
    }
  }

  async importData(data) {
    try {
      if (data.settings) {
        await chrome.storage.local.set({
          [this.storageKey.settings]: data.settings
        });
      }

      if (data.history) {
        await chrome.storage.local.set({
          [this.storageKey.groupHistory]: data.history
        });
      }

      if (data.stats) {
        await chrome.storage.local.set({
          [this.storageKey.stats]: data.stats
        });
      }

      console.log('Data imported successfully');
    } catch (error) {
      console.error('Failed to import data:', error);
      throw error;
    }
  }
}