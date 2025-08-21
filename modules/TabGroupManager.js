export class TabGroupManager {
  constructor() {
    this.groupColors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  }

  async createGroups(categories, tabs) {
    const groups = [];
    const tabMap = new Map(tabs.map(t => [t.id, t]));
    
    // Get the window ID from the first tab - we'll only work within this window
    if (tabs.length === 0) return [];
    
    const targetWindowId = tabs[0].windowId;
    const targetWindow = await chrome.windows.get(targetWindowId);
    
    if (targetWindow.type !== 'normal') {
      console.warn(`Cannot create groups in ${targetWindow.type} window`);
      return [];
    }
    
    // Create a set of valid tab IDs for this window
    const validWindowTabIds = new Set(tabs.map(t => t.id));
    
    console.log(`Working within window ${targetWindowId} only`);
    
    // First, clean up any existing duplicate groups IN THIS WINDOW ONLY
    await this.mergeDuplicateGroups();
    
    // Get existing groups IN THIS WINDOW ONLY
    const existingGroups = await chrome.tabGroups.query({ windowId: targetWindowId });
    const existingGroupsByName = new Map();
    const normalizedNames = new Set();
    
    // Create a map of existing groups by normalized name
    for (const group of existingGroups) {
      if (group.title) {
        const normalizedName = group.title.toLowerCase().trim();
        // Store all variations - with spaces, without spaces, etc.
        existingGroupsByName.set(normalizedName, group);
        existingGroupsByName.set(normalizedName.replace(/\s+/g, ''), group);
        existingGroupsByName.set(normalizedName.replace(/[\s-_]+/g, ''), group);
        normalizedNames.add(normalizedName);
        
        // Special handling for "Other" group - store all common variations
        if (normalizedName === 'other' || normalizedName === 'misc' || normalizedName === 'general') {
          existingGroupsByName.set('other', group);
          existingGroupsByName.set('misc', group);
          existingGroupsByName.set('general', group);
          existingGroupsByName.set('miscellaneous', group);
        }
      }
    }

    // Track which categories we've already processed to avoid duplicates
    const processedCategories = new Set();

    for (const category of categories.groups) {
      if (category.tabIds.length === 0) continue;

      // Normalize category name in multiple ways
      const normalizedCategoryName = category.name.toLowerCase().trim();
      const normalizedNoSpace = normalizedCategoryName.replace(/\s+/g, '');
      const normalizedNoSpecial = normalizedCategoryName.replace(/[\s-_]+/g, '');
      
      // Check if we've already processed this category
      if (processedCategories.has(normalizedNoSpace)) {
        console.log(`Skipping duplicate category: ${category.name}`);
        continue;
      }
      processedCategories.add(normalizedNoSpace);

      try {
        // Get valid tab IDs (tabs that still exist and are in the SAME window)
        const validTabIds = [];
        for (const id of category.tabIds) {
          if (tabMap.has(id)) {
            const tab = tabMap.get(id);
            // Only include tabs from the target window
            if (tab.windowId === targetWindowId) {
              validTabIds.push(id);
            } else {
              console.log(`Skipping tab ${id} - in different window ${tab.windowId}`);
            }
          }
        }
        
        if (validTabIds.length === 0) {
          console.log(`No valid tabs for category ${category.name} in window ${targetWindowId}`);
          continue;
        }

        // Check for existing group with various normalizations
        console.log(`Looking for existing group for "${category.name}" (normalized: "${normalizedCategoryName}", "${normalizedNoSpace}")`);
        console.log(`Existing groups map has keys:`, Array.from(existingGroupsByName.keys()));
        
        const existingGroup = existingGroupsByName.get(normalizedCategoryName) || 
                             existingGroupsByName.get(normalizedNoSpace) ||
                             existingGroupsByName.get(normalizedNoSpecial);
        
        if (existingGroup) {
          console.log(`Found existing group: ${existingGroup.title} (ID: ${existingGroup.id})`);
        } else {
          console.log(`No existing group found for "${category.name}"`);
        }

        let groupId;
        let action;

        if (existingGroup) {
          // Verify the group still exists and is in a normal window
          try {
            const groupInfo = await chrome.tabGroups.get(existingGroup.id);
            // Verify the group is in the same window
            const tabsInGroup = await chrome.tabs.query({ groupId: existingGroup.id });
            if (tabsInGroup.length > 0 && tabsInGroup[0].windowId !== targetWindowId) {
              throw new Error(`Group is in different window ${tabsInGroup[0].windowId}, target is ${targetWindowId}`);
            }
            
            // Double-check all tabs are in the same window before grouping
            const tabsToGroup = validTabIds.filter(id => {
              const tab = tabMap.get(id);
              return tab && tab.windowId === targetWindowId;
            });
            
            if (tabsToGroup.length === 0) {
              throw new Error('No tabs in target window to group');
            }
            
            // Add tabs to existing group
            groupId = existingGroup.id;
            await chrome.tabs.group({
              tabIds: tabsToGroup,
              groupId: groupId
            });
            action = 'merged into existing';
          } catch (error) {
            // Group doesn't exist anymore or is in wrong window type, create new
            console.log(`Existing group ${existingGroup.id} not available: ${error.message}`);
            groupId = await chrome.tabs.group({
              tabIds: validTabIds
            });
            
            await chrome.tabGroups.update(groupId, {
              title: category.name,
              color: category.color || this.selectColor(category.name),
              collapsed: false
            });
            action = 'created new (existing unavailable)';
          }
          
          // Update the existing groups map to prevent future duplicates
          const groupToStore = { id: groupId, title: category.name, color: category.color };
          existingGroupsByName.set(normalizedCategoryName, groupToStore);
          existingGroupsByName.set(normalizedNoSpace, groupToStore);
        } else {
          // Double-check all tabs are in the same window before creating group
          const tabsToGroup = validTabIds.filter(id => {
            const tab = tabMap.get(id);
            return tab && tab.windowId === targetWindowId;
          });
          
          if (tabsToGroup.length === 0) {
            console.log(`No tabs in target window ${targetWindowId} to create group ${category.name}`);
            continue;
          }
          
          // Create new group
          groupId = await chrome.tabs.group({
            tabIds: tabsToGroup
          });

          // Update group properties
          await chrome.tabGroups.update(groupId, {
            title: category.name,
            color: category.color || this.selectColor(category.name),
            collapsed: false
          });
          action = 'created new';
          
          // Add to existing groups map to prevent duplicates in same run
          const newGroup = { id: groupId, title: category.name, color: category.color };
          existingGroupsByName.set(normalizedCategoryName, newGroup);
          existingGroupsByName.set(normalizedNoSpace, newGroup);
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

  async mergeDuplicateGroups() {
    try {
      // Get current window and check if it's normal
      const currentWindow = await chrome.windows.getCurrent();
      if (currentWindow.type !== 'normal') {
        console.log(`Skipping merge in ${currentWindow.type} window`);
        return 0;
      }
      
      const groups = await chrome.tabGroups.query({ windowId: currentWindow.id });
      
      // Track groups by normalized name
      const groupsByName = new Map();
      
      for (const group of groups) {
        if (!group.title) {
          // Treat untitled groups as "Other"
          group.title = 'Other';
        }
        
        // Normalize the group name (lowercase, trim, remove spaces)
        let normalizedName = group.title.toLowerCase().trim().replace(/[\s-_]+/g, '');
        
        // Treat "general" as "other" to consolidate them
        if (normalizedName === 'general' || normalizedName === 'misc' || normalizedName === 'miscellaneous') {
          normalizedName = 'other';
        }
        
        if (!groupsByName.has(normalizedName)) {
          // First occurrence of this group name
          groupsByName.set(normalizedName, [group]);
        } else {
          // Duplicate found
          groupsByName.get(normalizedName).push(group);
        }
      }
      
      // Merge duplicates
      let totalMerged = 0;
      for (const [name, duplicateGroups] of groupsByName.entries()) {
        if (duplicateGroups.length > 1) {
          console.log(`Found ${duplicateGroups.length} duplicate groups for "${duplicateGroups[0].title}"`);
          
          // Sort by number of tabs (descending) to keep the group with most tabs
          const groupsWithTabCount = await Promise.all(
            duplicateGroups.map(async (group) => {
              const tabs = await chrome.tabs.query({ groupId: group.id });
              return { group, tabCount: tabs.length };
            })
          );
          
          groupsWithTabCount.sort((a, b) => b.tabCount - a.tabCount);
          
          const targetGroup = groupsWithTabCount[0].group; // Keep the group with most tabs
          const groupsToMerge = groupsWithTabCount.slice(1); // Merge all others into it
          
          // Rename target group to "Other" if it's "General"
          if (targetGroup.title.toLowerCase() === 'general') {
            await chrome.tabGroups.update(targetGroup.id, {
              title: 'Other'
            });
          }
          
          for (const { group: sourceGroup } of groupsToMerge) {
            // Get all tabs from the duplicate group
            const tabs = await chrome.tabs.query({ groupId: sourceGroup.id });
            
            if (tabs.length > 0) {
              const tabIds = tabs.map(t => t.id);
              
              // Move tabs to the target group
              await chrome.tabs.group({
                tabIds: tabIds,
                groupId: targetGroup.id
              });
              
              totalMerged += tabs.length;
              console.log(`Merged ${tabs.length} tabs from duplicate group "${sourceGroup.title}" (ID: ${sourceGroup.id}) into group ID: ${targetGroup.id}`);
            }
            
            // The empty group will be automatically removed by Chrome
          }
        }
      }
      
      console.log(`Duplicate group cleanup complete. Merged ${totalMerged} tabs total.`);
      return totalMerged;
      
    } catch (error) {
      console.error('Failed to merge duplicate groups:', error);
      return 0;
    }
  }
  
  async cleanupAllDuplicates() {
    // Nuclear option - ungroup everything and regroup properly
    try {
      console.log('Starting NUCLEAR duplicate cleanup...');
      
      // Get current window
      const currentWindow = await chrome.windows.getCurrent();
      
      // Only proceed if it's a normal window
      if (currentWindow.type !== 'normal') {
        console.log(`Skipping cleanup in ${currentWindow.type} window - only normal windows supported`);
        return { processed: 0, consolidated: 0 };
      }
      
      console.log(`Cleaning duplicates ONLY in window ${currentWindow.id}`);
      
      // Get ALL groups in current window ONLY
      const allGroups = await chrome.tabGroups.query({ windowId: currentWindow.id });
      console.log(`Found ${allGroups.length} groups in current window`);
      
      // Build a map of tabs by normalized group name
      const tabsByGroupName = new Map();
      const groupsToDelete = [];
      
      for (const group of allGroups) {
        const title = (group.title || 'untitled').toLowerCase().trim();
        
        // Get all tabs in this group
        const tabs = await chrome.tabs.query({ groupId: group.id });
        console.log(`Group "${group.title}" (ID: ${group.id}) has ${tabs.length} tabs`);
        
        if (tabs.length === 0) {
          console.log(`Empty group will be auto-removed`);
          continue;
        }
        
        // Normalize the name
        let normalizedName = title.replace(/[\s-_]+/g, '');
        
        // Consolidate General/Misc/etc into Other
        if (normalizedName === 'general' || 
            normalizedName === 'misc' || 
            normalizedName === 'miscellaneous' || 
            normalizedName === 'untitled' || 
            normalizedName === '') {
          normalizedName = 'other';
        }
        
        if (!tabsByGroupName.has(normalizedName)) {
          tabsByGroupName.set(normalizedName, {
            originalTitle: group.title === 'General' || group.title === 'Misc' ? 'Other' : group.title,
            color: group.color,
            tabs: [],
            groups: []
          });
        }
        
        tabsByGroupName.get(normalizedName).tabs.push(...tabs);
        tabsByGroupName.get(normalizedName).groups.push(group);
        
        // Mark for ungrouping if this is a duplicate
        if (tabsByGroupName.get(normalizedName).groups.length > 1) {
          groupsToDelete.push(group);
        }
      }
      
      console.log(`Found ${tabsByGroupName.size} unique group names`);
      console.log('Groups to consolidate:', Array.from(tabsByGroupName.keys()));
      
      // Now ungroup ALL tabs from duplicate groups and recreate them properly
      let totalProcessed = 0;
      const newGroups = [];
      
      for (const [normalizedName, data] of tabsByGroupName.entries()) {
        if (data.groups.length <= 1 && data.originalTitle !== 'Other') {
          console.log(`Skipping "${data.originalTitle}" - no duplicates`);
          continue;
        }
        
        console.log(`\nProcessing "${data.originalTitle}" with ${data.tabs.length} total tabs from ${data.groups.length} groups`);
        
        // Get all tab IDs
        const allTabIds = data.tabs.map(t => t.id);
        
        if (allTabIds.length === 0) continue;
        
        try {
          // First, ungroup ALL these tabs
          console.log(`Ungrouping ${allTabIds.length} tabs...`);
          await chrome.tabs.ungroup(allTabIds);
          
          // Wait a bit for Chrome to process
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Now create a single new group with all these tabs
          console.log(`Creating new consolidated group...`);
          const newGroupId = await chrome.tabs.group({
            tabIds: allTabIds
          });
          
          // Set the group properties
          const finalTitle = data.originalTitle === 'General' || data.originalTitle === 'Misc' ? 'Other' : data.originalTitle;
          await chrome.tabGroups.update(newGroupId, {
            title: finalTitle,
            color: data.color || 'grey',
            collapsed: false
          });
          
          console.log(`Created new group "${finalTitle}" with ${allTabIds.length} tabs`);
          newGroups.push(finalTitle);
          totalProcessed += allTabIds.length;
          
        } catch (error) {
          console.error(`Failed to consolidate "${data.originalTitle}":`, error);
          
          // Try a less aggressive approach - just rename duplicates
          for (let i = 1; i < data.groups.length; i++) {
            const dupGroup = data.groups[i];
            try {
              const suffix = ` (${i + 1})`;
              await chrome.tabGroups.update(dupGroup.id, {
                title: data.originalTitle + suffix
              });
              console.log(`Renamed duplicate to "${data.originalTitle}${suffix}"`);
            } catch (e) {
              console.error(`Failed to rename group ${dupGroup.id}:`, e);
            }
          }
        }
      }
      
      console.log(`\nNUCLEAR cleanup complete!`);
      console.log(`Processed ${totalProcessed} tabs`);
      console.log(`Created/consolidated groups: ${newGroups.join(', ')}`);
      
      // Final check
      const finalGroups = await chrome.tabGroups.query({ windowId: currentWindow.id });
      console.log(`Window now has ${finalGroups.length} groups`);
      
      // List all group names to verify
      const finalNames = {};
      for (const group of finalGroups) {
        const name = group.title || 'untitled';
        finalNames[name] = (finalNames[name] || 0) + 1;
      }
      console.log('Final group counts:', finalNames);
      
      // If we still have duplicates, report them
      const stillDuplicates = Object.entries(finalNames).filter(([name, count]) => count > 1);
      if (stillDuplicates.length > 0) {
        console.warn('⚠️ Still have duplicates:', stillDuplicates);
        console.log('These may be synced groups that Chrome protects from modification');
      }
      
      return { processed: totalProcessed, consolidated: newGroups.length };
      
    } catch (error) {
      console.error('Nuclear cleanup failed:', error);
      return { processed: 0, consolidated: 0 };
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