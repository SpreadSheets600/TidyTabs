import { assignGroupColors } from "./colors.js";

const browserAPI = globalThis.browser || globalThis.chrome;

function extractDomain(url) {
	try {
		const urlObj = new URL(url);
		return urlObj.hostname;
	} catch {
		return "";
	}
}

function isRestrictedUrl(url = "") {
	if (!url) {
		return true;
	}

	return /^(chrome|edge|about|moz-extension|chrome-extension):/i.test(url);
}

function supportsTabGrouping() {
	return typeof browserAPI?.tabs?.group === "function";
}

function supportsTabUngrouping() {
	return typeof browserAPI?.tabs?.ungroup === "function";
}

function supportsTabGroupMetadataUpdate() {
	return typeof browserAPI?.tabGroups?.update === "function";
}

export async function collectTabMetadata(scope = "current", options = {}) {
	const { respectPinned = true, respectExistingGroups = false } = options;

	let queryOptions = {};

	if (scope === "current") {
		queryOptions.currentWindow = true;
	}

	const tabs = await browserAPI.tabs.query(queryOptions);

	let filteredTabs = tabs.filter((tab) => {
		if (isRestrictedUrl(tab.url)) {
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

	if (!supportsTabGrouping()) {
		return {
			success: false,
			groupsCreated: 0,
			tabsGrouped: 0,
			errors: [{ group: "all", error: "Tab grouping API is not available in this browser build." }],
		};
	}

	const labels = groups.map((g) => g.label);
	const colorMap = assignGroupColors(labels);

	let allTabIds;
	try {
		const tabs = await browserAPI.tabs.query({});
		allTabIds = new Set(tabs.map((t) => t.id));
	} catch (e) {
		return {
			success: false,
			groupsCreated: 0,
			tabsGrouped: 0,
			errors: [{ group: "all", error: "Failed to verify tabs: " + e.message }],
		};
	}

	for (const group of groups) {
		try {
			if (!group.tabIds || group.tabIds.length === 0) {
				continue;
			}

			const validTabIds = group.tabIds.filter((id) => allTabIds.has(id));

			if (validTabIds.length === 0) {
				continue;
			}

			const groupId = await browserAPI.tabs.group({
				tabIds: validTabIds,
			});

			if (supportsTabGroupMetadataUpdate()) {
				await browserAPI.tabGroups.update(groupId, {
					title: group.label,
					color: colorMap[group.label] || "grey",
					collapsed: false,
				});
			}

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
	if (!supportsTabUngrouping()) {
		return {
			success: false,
			groupsRemoved: 0,
			tabsUngrouped: 0,
			error: "Tab ungroup API is not available in this browser build.",
		};
	}

	const queryOptions = scope === "current" ? { currentWindow: true } : {};
	const tabs = await browserAPI.tabs.query(queryOptions);

	const groupIds = [...new Set(tabs.filter((t) => t.groupId !== -1).map((t) => t.groupId))];

	let ungroupedCount = 0;

	for (const groupId of groupIds) {
		try {
			const groupTabs = tabs.filter((t) => t.groupId === groupId);

			await browserAPI.tabs.ungroup(groupTabs.map((t) => t.id));
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
	const window = await browserAPI.windows.getCurrent();
	return window.id;
}
