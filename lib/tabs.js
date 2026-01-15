import { assignGroupColors } from "./colors.js";

function extractDomain(url) {
	try {
		const urlObj = new URL(url);
		return urlObj.hostname;
	} catch {
		return "";
	}
}

export async function collectTabMetadata(scope = "current", options = {}) {
	const { respectPinned = true, respectExistingGroups = false } = options;

	let queryOptions = {};

	if (scope === "current") {
		queryOptions.currentWindow = true;
	}

	const tabs = await chrome.tabs.query(queryOptions);

	let filteredTabs = tabs.filter((tab) => {
		if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("chrome-extension://")) {
			return false;
		}

		if (respectPinned && tab.pinned) {
			return false;
		}

		if (respectExistingGroups && tab.groupId !== -1) {
			return false;
		}

		return true;
	});

	return filteredTabs.map((tab) => ({
		id: tab.id,
		url: tab.url,
		title: tab.title || "",
		domain: extractDomain(tab.url),
		windowId: tab.windowId,
		groupId: tab.groupId,
		pinned: tab.pinned,
		index: tab.index,
	}));
}

export function getUniqueDomains(tabs) {
	return [...new Set(tabs.map((t) => t.domain).filter(Boolean))];
}

export async function applyTabGroups(groups, windowId) {
	const results = {
		success: true,
		groupsCreated: 0,
		tabsGrouped: 0,
		errors: [],
	};

	const labels = groups.map((g) => g.label);
	const colorMap = assignGroupColors(labels);

	for (const group of groups) {
		try {
			if (!group.tabIds || group.tabIds.length === 0) {
				continue;
			}

			const validTabIds = [];
			for (const tabId of group.tabIds) {
				try {
					await chrome.tabs.get(tabId);
					validTabIds.push(tabId);
				} catch {}
			}

			if (validTabIds.length === 0) {
				continue;
			}

			const groupId = await chrome.tabs.group({
				tabIds: validTabIds,
			});

			await chrome.tabGroups.update(groupId, {
				title: group.label,
				color: colorMap[group.label] || "grey",
				collapsed: false,
			});

			results.groupsCreated++;
			results.tabsGrouped += validTabIds.length;
		} catch (error) {
			results.errors.push({
				group: group.label,
				error: error.message,
			});
		}
	}

	if (results.errors.length > 0) {
		results.success = false;
	}

	return results;
}

export async function clearTabGroups(scope = "current") {
	const queryOptions = scope === "current" ? { currentWindow: true } : {};
	const tabs = await chrome.tabs.query(queryOptions);

	const groupIds = [...new Set(tabs.filter((t) => t.groupId !== -1).map((t) => t.groupId))];

	let ungroupedCount = 0;

	for (const groupId of groupIds) {
		try {
			const groupTabs = tabs.filter((t) => t.groupId === groupId);

			await chrome.tabs.ungroup(groupTabs.map((t) => t.id));
			ungroupedCount += groupTabs.length;
		} catch (error) {
			console.error("Error ungrouping:", error);
		}
	}

	return {
		success: true,
		groupsRemoved: groupIds.length,
		tabsUngrouped: ungroupedCount,
	};
}

export async function getCurrentWindowId() {
	const window = await chrome.windows.getCurrent();
	return window.id;
}
