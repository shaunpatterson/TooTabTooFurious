document.addEventListener('DOMContentLoaded', async () => {
  const elements = {
    maxGroups: document.getElementById('maxGroups'),
    autoMode: document.getElementById('autoMode'),
    collapseGroups: document.getElementById('collapseGroups'),
    modelStatusValue: document.getElementById('modelStatusValue'),
    totalOrganizations: document.getElementById('totalOrganizations'),
    totalTabsOrganized: document.getElementById('totalTabsOrganized'),
    totalGroupsCreated: document.getElementById('totalGroupsCreated'),
    commonGroupsList: document.getElementById('commonGroupsList'),
    saveBtn: document.getElementById('saveBtn')
  };
  
  // Log any missing elements for debugging
  for (const [key, element] of Object.entries(elements)) {
    if (!element) {
      console.warn(`Element not found: ${key}`);
    }
  }

  let settings = {};
  let stats = {};

  // Load current settings
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['tttf_settings', 'tttf_stats']);
      
      settings = result.tttf_settings || {
        autoMode: false,
        maxGroups: 5,
        collapseGroups: false,
        llmModel: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC'
      };
      
      stats = result.tttf_stats || {
        totalOrganizations: 0,
        totalTabsOrganized: 0,
        totalGroupsCreated: 0,
        commonGroups: {}
      };

      // Update UI with loaded settings
      elements.maxGroups.value = settings.maxGroups;
      elements.autoMode.checked = settings.autoMode;
      elements.collapseGroups.checked = settings.collapseGroups;

      // Update stats
      updateStats();
      
      // Check model status
      checkModelStatus();
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  // Save settings
  async function saveSettings() {
    try {
      settings.maxGroups = parseInt(elements.maxGroups.value);
      settings.autoMode = elements.autoMode.checked;
      settings.collapseGroups = elements.collapseGroups.checked;

      await chrome.storage.local.set({ tttf_settings: settings });
      
      // Notify background script
      await chrome.runtime.sendMessage({
        action: 'updateMaxGroups',
        maxGroups: settings.maxGroups
      });
      
      await chrome.runtime.sendMessage({
        action: 'toggleAutoMode',
        enabled: settings.autoMode
      });

      // Show success feedback
      elements.saveBtn.textContent = 'Saved!';
      elements.saveBtn.style.background = 'linear-gradient(135deg, #34A853, #188038)';
      
      setTimeout(() => {
        elements.saveBtn.textContent = 'Save Settings';
        elements.saveBtn.style.background = '';
      }, 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      elements.saveBtn.textContent = 'Error';
      
      setTimeout(() => {
        elements.saveBtn.textContent = 'Save Settings';
      }, 2000);
    }
  }

  // Update statistics display
  function updateStats() {
    elements.totalOrganizations.textContent = stats.totalOrganizations || 0;
    elements.totalTabsOrganized.textContent = stats.totalTabsOrganized || 0;
    elements.totalGroupsCreated.textContent = stats.totalGroupsCreated || 0;

    // Display common groups
    if (stats.commonGroups && Object.keys(stats.commonGroups).length > 0) {
      const sortedGroups = Object.entries(stats.commonGroups)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      elements.commonGroupsList.innerHTML = sortedGroups.map(([name, count]) => `
        <div class="group-badge">
          ${name}<span>${count}</span>
        </div>
      `).join('');
    } else {
      elements.commonGroupsList.innerHTML = '<div class="no-data">No groups created yet</div>';
    }
  }

  // Check model status
  async function checkModelStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
      if (response.success && response.status.llmStatus) {
        const llmStatus = response.status.llmStatus;
        
        switch (llmStatus.status) {
          case 'ready':
            elements.modelStatusValue.textContent = 'Model Loaded';
            elements.modelStatusValue.style.color = '#34A853';
            break;
          case 'loading':
            elements.modelStatusValue.textContent = `Loading... ${llmStatus.progress}%`;
            elements.modelStatusValue.style.color = '#FBBC04';
            break;
          case 'error':
            elements.modelStatusValue.textContent = 'Load Failed';
            elements.modelStatusValue.style.color = '#EA4335';
            break;
          case 'fallback':
            elements.modelStatusValue.textContent = 'Rule-based Mode';
            elements.modelStatusValue.style.color = '#1a73e8';
            break;
          default:
            elements.modelStatusValue.textContent = 'Unknown';
            elements.modelStatusValue.style.color = '#888';
        }
      } else {
        elements.modelStatusValue.textContent = 'Not Available';
        elements.modelStatusValue.style.color = '#888';
      }
    } catch (error) {
      elements.modelStatusValue.textContent = 'Connection Error';
      elements.modelStatusValue.style.color = '#888';
    }
  }


  // Setup event listeners
  function setupEventListeners() {
    // Check if elements exist before adding listeners
    if (elements.saveBtn) {
      elements.saveBtn.addEventListener('click', saveSettings);
    }

    // Auto-save on change
    if (elements.maxGroups) {
      elements.maxGroups.addEventListener('change', saveSettings);
    }
    if (elements.autoMode) {
      elements.autoMode.addEventListener('change', saveSettings);
    }
    if (elements.collapseGroups) {
      elements.collapseGroups.addEventListener('change', saveSettings);
    }
  }

  // Initialize
  await loadSettings();
  setupEventListeners();
});