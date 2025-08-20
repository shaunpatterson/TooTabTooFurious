export class TabGroupManager {
  constructor() {
    this.groupColors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  }

  async createGroups(categories, tabs) {
    const groups = [];
    const tabMap = new Map(tabs.map(t => [t.id, t]));
    
    // Get existing groups to avoid duplicates
    const existingGroups = await chrome.tabGroups.query({});
    const existingGroupsByName = new Map();
    
    // Create a map of existing groups by normalized name
    for (const group of existingGroups) {
      if (group.title) {
        const normalizedName = group.title.toLowerCase().trim();
        existingGroupsByName.set(normalizedName, group);
      }
    }

    for (const category of categories.groups) {
      if (category.tabIds.length === 0) continue;

      try {
        // Get valid tab IDs (tabs that still exist)
        const validTabIds = category.tabIds.filter(id => tabMap.has(id));
        
        if (validTabIds.length === 0) continue;

        const normalizedCategoryName = category.name.toLowerCase().trim();
        const existingGroup = existingGroupsByName.get(normalizedCategoryName);

        let groupId;
        let action;

        if (existingGroup) {
          // Add tabs to existing group instead of creating duplicate
          groupId = existingGroup.id;
          await chrome.tabs.group({
            tabIds: validTabIds,
            groupId: groupId
          });
          action = 'merged into existing';
        } else {
          // Create new group
          groupId = await chrome.tabs.group({
            tabIds: validTabIds
          });

          // Update group properties
          await chrome.tabGroups.update(groupId, {
            title: category.name,
            color: category.color || this.selectColor(category.name),
            collapsed: false
          });
          action = 'created new';
        }

        groups.push({
          id: groupId,
          name: category.name,
          color: existingGroup ? existingGroup.color : category.color,
          tabCount: validTabIds.length,
          tabs: validTabIds.map(id => ({
            id,
            title: tabMap.get(id).title,
            url: tabMap.get(id).url
          }))
        });

        console.log(`✅ ${action} group: ${category.name} with ${validTabIds.length} tabs`);
      } catch (error) {
        console.error(`Failed to create/merge group ${category.name}:`, error);
      }
    }

    return groups;
  }

  async createNewGroup(tabs, category) {
    try {
      const tabIds = tabs.map(t => t.id);
      
      // Create the group
      const groupId = await chrome.tabs.group({
        tabIds: tabIds
      });

      // Update group properties
      await chrome.tabGroups.update(groupId, {
        title: category.name,
        color: category.color || this.selectColor(category.name),
        collapsed: false
      });

      console.log(`✅ Created new group: ${category.name}`);
      return groupId;
    } catch (error) {
      console.error('Failed to create new group:', error);
      return null;
    }
  }

  async ungroupTabs(tabIds) {
    try {
      await chrome.tabs.ungroup(tabIds);
      console.log(`Ungrouped ${tabIds.length} tabs`);
    } catch (error) {
      console.error('Failed to ungroup tabs:', error);
    }
  }

  async getExistingGroups(windowId) {
    try {
      const groups = await chrome.tabGroups.query({ windowId });
      return groups.map(g => ({
        id: g.id,
        name: g.title || 'Untitled',
        color: g.color,
        collapsed: g.collapsed
      }));
    } catch (error) {
      console.error('Failed to get existing groups:', error);
      return [];
    }
  }

  async collapseAllGroups() {
    try {
      const groups = await chrome.tabGroups.query({});
      for (const group of groups) {
        await chrome.tabGroups.update(group.id, { collapsed: true });
      }
    } catch (error) {
      console.error('Failed to collapse groups:', error);
    }
  }

  async expandAllGroups() {
    try {
      const groups = await chrome.tabGroups.query({});
      for (const group of groups) {
        await chrome.tabGroups.update(group.id, { collapsed: false });
      }
    } catch (error) {
      console.error('Failed to expand groups:', error);
    }
  }

  selectColor(name) {
    // Use a hash of the name to consistently pick a color
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return this.groupColors[hash % this.groupColors.length];
  }

  async mergeGroups(sourceGroupId, targetGroupId) {
    try {
      // Get all tabs from source group
      const tabs = await chrome.tabs.query({ groupId: sourceGroupId });
      const tabIds = tabs.map(t => t.id);
      
      if (tabIds.length > 0) {
        // Move tabs to target group
        await chrome.tabs.group({
          tabIds: tabIds,
          groupId: targetGroupId
        });
        
        console.log(`Merged ${tabIds.length} tabs from group ${sourceGroupId} to ${targetGroupId}`);
      }
    } catch (error) {
      console.error('Failed to merge groups:', error);
    }
  }

  async reorganizeGroups(maxGroups) {
    try {
      const groups = await chrome.tabGroups.query({});
      
      if (groups.length <= maxGroups) {
        return; // No need to reorganize
      }

      // Sort groups by tab count
      const groupsWithCounts = await Promise.all(groups.map(async (group) => {
        const tabs = await chrome.tabs.query({ groupId: group.id });
        return {
          group,
          tabCount: tabs.length
        };
      }));

      groupsWithCounts.sort((a, b) => b.tabCount - a.tabCount);

      // Keep the largest groups, merge the rest
      const groupsToKeep = groupsWithCounts.slice(0, maxGroups - 1);
      const groupsToMerge = groupsWithCounts.slice(maxGroups - 1);

      if (groupsToMerge.length > 0) {
        // Create an "Other" group for merged tabs
        const mergedTabs = [];
        for (const { group } of groupsToMerge) {
          const tabs = await chrome.tabs.query({ groupId: group.id });
          mergedTabs.push(...tabs.map(t => t.id));
        }

        if (mergedTabs.length > 0) {
          const otherGroupId = await chrome.tabs.group({
            tabIds: mergedTabs
          });

          await chrome.tabGroups.update(otherGroupId, {
            title: 'Other',
            color: 'grey',
            collapsed: false
          });
        }
      }
    } catch (error) {
      console.error('Failed to reorganize groups:', error);
    }
  }
}