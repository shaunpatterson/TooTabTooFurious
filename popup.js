document.addEventListener('DOMContentLoaded', async () => {
  const elements = {
    apiStatus: document.getElementById('apiStatus'),
    statusDot: document.querySelector('.status-dot'),
    statusText: document.querySelector('.status-text'),
    progressBar: document.getElementById('progressBar'),
    progressFill: document.querySelector('.progress-fill'),
    progressText: document.querySelector('.progress-text'),
    organizeBtn: document.getElementById('organizeBtn'),
    autoModeBtn: document.getElementById('autoModeBtn'),
    autoModeText: document.getElementById('autoModeText'),
    tabCount: document.getElementById('tabCount'),
    groupCount: document.getElementById('groupCount'),
    groupsList: document.getElementById('groupsList'),
    settingsBtn: document.getElementById('settingsBtn'),
    refreshBtn: document.getElementById('refreshBtn')
  };

  let isAutoMode = false;
  let maxGroups = 5;

  // Initialize popup
  async function init() {
    await updateStatus();
    await loadRecentGroups();
    setupEventListeners();
    
    // Update status periodically in case initial check fails
    setTimeout(updateStatus, 1000);
    setTimeout(updateStatus, 3000);
  }

  // Update status from background
  async function updateStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
      
      if (response.success) {
        const { status } = response;
        
        // Update LLM status based on detailed status
        if (status.llmStatus) {
          const llmStatus = status.llmStatus;
          
          switch (llmStatus.status) {
            case 'loading':
              elements.statusDot.classList.remove('active', 'error');
              elements.statusText.textContent = 'Loading AI Model...';
              elements.progressBar.style.display = 'block';
              elements.progressFill.style.width = `${llmStatus.progress || 0}%`;
              elements.progressText.textContent = `${llmStatus.progress || 0}%`;
              break;
              
            case 'ready':
              elements.statusDot.classList.add('active');
              elements.statusDot.classList.remove('error');
              elements.statusText.textContent = 'AI Ready (TinyLlama)';
              elements.progressBar.style.display = 'none';
              break;
              
            case 'fallback':
              elements.statusDot.classList.remove('error');
              elements.statusDot.classList.add('active');
              elements.statusText.textContent = 'Smart Pattern Mode';
              elements.progressBar.style.display = 'none';
              break;
              
            case 'error':
              elements.statusDot.classList.add('error');
              elements.statusText.textContent = 'AI Load Failed';
              elements.progressBar.style.display = 'none';
              break;
              
            default:
              // Default to pattern mode if status is unclear
              elements.statusDot.classList.remove('error');
              elements.statusDot.classList.add('active');
              elements.statusText.textContent = 'Smart Pattern Mode';
              elements.progressBar.style.display = 'none';
          }
        } else {
          // No llmStatus, default to pattern mode
          elements.statusDot.classList.remove('error');
          elements.statusDot.classList.add('active');
          elements.statusText.textContent = 'Smart Pattern Mode';
          elements.progressBar.style.display = 'none';
        }
        
        // Update auto mode
        isAutoMode = status.autoMode;
        updateAutoModeButton();
        
        // Update stats
        elements.tabCount.textContent = status.tabCount || '0';
        elements.groupCount.textContent = status.groupCount || '0';
        
        // Update max groups
        maxGroups = status.maxGroups || 5;
      }
    } catch (error) {
      console.error('Failed to get status:', error);
      elements.statusDot.classList.add('error');
      elements.statusText.textContent = 'Error';
      elements.progressBar.style.display = 'none';
    }
  }

  // Load recent groups from storage
  async function loadRecentGroups() {
    try {
      const { tttf_group_history } = await chrome.storage.local.get('tttf_group_history');
      const history = tttf_group_history || [];
      
      if (history.length > 0 && history[0].groups) {
        const recentGroups = history[0].groups.slice(0, 5);
        displayGroups(recentGroups);
      } else {
        elements.groupsList.innerHTML = '<div class="no-groups">No groups yet</div>';
      }
    } catch (error) {
      console.error('Failed to load recent groups:', error);
    }
  }

  // Display groups in the list
  function displayGroups(groups) {
    elements.groupsList.innerHTML = groups.map(group => `
      <div class="group-item">
        <span class="group-color" style="background-color: ${getColorHex(group.color)}"></span>
        <span class="group-name">${group.name}</span>
        <span class="group-count">${group.tabCount} tabs</span>
      </div>
    `).join('');
  }

  // Get hex color for Chrome group colors
  function getColorHex(color) {
    const colors = {
      grey: '#5F6368',
      blue: '#1A73E8',
      red: '#EA4335',
      yellow: '#FBBC04',
      green: '#34A853',
      pink: '#FF6D00',
      purple: '#9334E6',
      cyan: '#00BCD4',
      orange: '#FB8C00'
    };
    return colors[color] || colors.grey;
  }

  // Update auto mode button state
  function updateAutoModeButton() {
    if (isAutoMode) {
      elements.autoModeBtn.classList.add('active');
      elements.autoModeText.textContent = 'Disable Auto Mode';
    } else {
      elements.autoModeBtn.classList.remove('active');
      elements.autoModeText.textContent = 'Enable Auto Mode';
    }
  }

  // Setup event listeners
  function setupEventListeners() {
    // Organize button
    elements.organizeBtn.addEventListener('click', async () => {
      elements.organizeBtn.disabled = true;
      elements.organizeBtn.textContent = 'Organizing...';
      
      try {
        const response = await chrome.runtime.sendMessage({ action: 'organizeTabs' });
        
        if (response.success) {
          elements.organizeBtn.textContent = 'Done!';
          await updateStatus();
          await loadRecentGroups();
          
          setTimeout(() => {
            elements.organizeBtn.textContent = 'Organize Tabs';
            elements.organizeBtn.disabled = false;
          }, 2000);
        } else {
          throw new Error(response.error || 'Failed to organize tabs');
        }
      } catch (error) {
        console.error('Failed to organize tabs:', error);
        elements.organizeBtn.textContent = 'Error';
        
        setTimeout(() => {
          elements.organizeBtn.innerHTML = '<span class="btn-icon">🚀</span> Organize Tabs Now';
          elements.organizeBtn.disabled = false;
        }, 2000);
      }
    });

    // Auto mode toggle
    elements.autoModeBtn.addEventListener('click', async () => {
      const newMode = !isAutoMode;
      
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'toggleAutoMode',
          enabled: newMode
        });
        
        if (response.success) {
          isAutoMode = newMode;
          updateAutoModeButton();
        }
      } catch (error) {
        console.error('Failed to toggle auto mode:', error);
      }
    });

    // Settings button
    elements.settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Refresh button
    elements.refreshBtn.addEventListener('click', async () => {
      await updateStatus();
      await loadRecentGroups();
    });
  }

  // Add max groups control to popup
  function addMaxGroupsControl() {
    const controlsDiv = document.querySelector('.controls');
    const maxGroupsDiv = document.createElement('div');
    maxGroupsDiv.className = 'max-groups-setting';
    maxGroupsDiv.innerHTML = `
      <div class="setting-row">
        <span class="setting-label">Max Groups:</span>
        <input type="number" id="maxGroupsInput" class="setting-input" 
               min="2" max="10" value="${maxGroups}">
      </div>
    `;
    controlsDiv.appendChild(maxGroupsDiv);

    document.getElementById('maxGroupsInput').addEventListener('change', async (e) => {
      const newMax = parseInt(e.target.value);
      if (newMax >= 2 && newMax <= 10) {
        await chrome.runtime.sendMessage({
          action: 'updateMaxGroups',
          maxGroups: newMax
        });
        maxGroups = newMax;
      }
    });
  }

  // Initialize
  await init();
  addMaxGroupsControl();
});