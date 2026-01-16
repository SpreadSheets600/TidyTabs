import { collectTabMetadata, getUniqueDomains, applyTabGroups, clearTabGroups, getCurrentWindowId } from "./lib/tabs.js";
import { getSettings, saveSettings, addToHistory } from "./lib/storage.js";
import { buildPrompt, callGemini } from "./lib/gemini.js";

const AUTO_ORGANIZE_ALARM = "tidytabs-auto-organize";
const MIN_INTERVAL_MINUTES = 2;

async function handleOrganizeTabs(options = {}) {
	const settings = await getSettings();
	const scope = options.scope || settings.scope;
	const mode = options.isAuto ? "instant" : options.mode || settings.mode;
	const isPreview = mode === "preview";

	if (!settings.apiKey) {
		return {
			success: false,
			error: "API key not configured. Please add your Gemini API key in settings.",
			needsApiKey: true,
		};
	}

	try {
		const tabs = await collectTabMetadata(scope, {
			respectPinned: settings.respectPinned,
			respectExistingGroups: settings.respectExistingGroups,
		});

		if (tabs.length === 0) {
			return {
				success: false,
				error: "No tabs to organize. Try changing your scope or filter settings.",
			};
		}

		if (tabs.length === 1) {
			return {
				success: false,
				error: "Only one tab available. Need at least 2 tabs to organize.",
			};
		}

		const variables = {
			TAB_DATA: tabs.map((t) => ({
				id: t.id,
				title: t.title,
				url: t.url,
				domain: t.domain,
			})),
			TAB_COUNT: tabs.length,
			DOMAINS: getUniqueDomains(tabs),
			WINDOW_ID: await getCurrentWindowId(),
		};

		const prompt = buildPrompt(settings.promptTemplate, variables);
		const response = await callGemini(settings.apiKey, prompt, settings.selectedModel);

		if (isPreview) {
			const enhancedGroups = response.groups.map((group) => ({
				...group,
				tabs: group.tabIds.map((id) => {
					const tab = tabs.find((t) => t.id === id);
					return tab ? { id, title: tab.title, domain: tab.domain } : { id, title: "Unknown" };
				}),
			}));

			return {
				success: true,
				preview: true,
				groups: enhancedGroups,
				tabCount: tabs.length,
			};
		}

		const windowId = await getCurrentWindowId();
		const result = await applyTabGroups(response.groups, windowId);

		await addToHistory({
			groups: response.groups,
			tabCount: tabs.length,
			auto: options.isAuto || false,
		});

		if (options.isAuto) {
			await saveSettings({ lastAutoOrganize: Date.now() });
		}

		return {
			success: result.success,
			applied: true,
			groupsCreated: result.groupsCreated,
			tabsGrouped: result.tabsGrouped,
			errors: result.errors,
		};
	} catch (error) {
		console.error("Organize tabs error:", error);
		return {
			success: false,
			error: error.message || "An unexpected error occurred",
		};
	}
}

async function handleApplyGroups(groups) {
	try {
		const windowId = await getCurrentWindowId();
		const result = await applyTabGroups(groups, windowId);

		await addToHistory({
			groups: groups,
			tabCount: groups.reduce((sum, g) => sum + g.tabIds.length, 0),
		});

		return {
			success: result.success,
			groupsCreated: result.groupsCreated,
			tabsGrouped: result.tabsGrouped,
			errors: result.errors,
		};
	} catch (error) {
		return {
			success: false,
			error: error.message,
		};
	}
}

async function handleClearGroups(options = {}) {
	const settings = await getSettings();
	const scope = options.scope || settings.scope;

	try {
		const result = await clearTabGroups(scope);
		return result;
	} catch (error) {
		return {
			success: false,
			error: error.message,
		};
	}
}

async function handleGetStats() {
	const settings = await getSettings();

	const allTabs = await collectTabMetadata("all", {
		respectPinned: false,
		respectExistingGroups: false,
	});

	const currentTabs = await collectTabMetadata("current", {
		respectPinned: false,
		respectExistingGroups: false,
	});

	return {
		allWindows: allTabs.length,
		currentWindow: currentTabs.length,
		hasApiKey: !!settings.apiKey,
		scope: settings.scope,
		mode: settings.mode,
		autoOrganize: settings.autoOrganize,
		autoOrganizeInterval: settings.autoOrganizeInterval,
		lastAutoOrganize: settings.lastAutoOrganize,
	};
}

async function setupAutoOrganizeAlarm(enabled, intervalMinutes) {
	await chrome.alarms.clear(AUTO_ORGANIZE_ALARM);

	if (enabled) {
		const interval = Math.max(intervalMinutes, MIN_INTERVAL_MINUTES);

		await chrome.alarms.create(AUTO_ORGANIZE_ALARM, {
			periodInMinutes: interval,
			delayInMinutes: interval,
		});

		console.log(`Auto-organize alarm set for every ${interval} minutes`);
	} else {
		console.log("Auto-organize alarm cleared");
	}
}

async function handleSetAutoOrganize(options) {
	const { enabled, interval } = options;

	await saveSettings({
		autoOrganize: enabled,
		autoOrganizeInterval: interval || 5,
	});

	await setupAutoOrganizeAlarm(enabled, interval || 5);

	return {
		success: true,
		autoOrganize: enabled,
		autoOrganizeInterval: interval || 5,
	};
}

async function handleGetAutoOrganizeStatus() {
	const settings = await getSettings();
	const alarm = await chrome.alarms.get(AUTO_ORGANIZE_ALARM);

	return {
		enabled: settings.autoOrganize,
		interval: settings.autoOrganizeInterval,
		lastRun: settings.lastAutoOrganize,
		nextRun: alarm ? alarm.scheduledTime : null,
	};
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === AUTO_ORGANIZE_ALARM) {
		console.log("Auto-organize triggered");

		const settings = await getSettings();

		if (!settings.autoOrganize) {
			await chrome.alarms.clear(AUTO_ORGANIZE_ALARM);
			return;
		}

		const timeSinceLastRun = Date.now() - (settings.lastAutoOrganize || 0);
		if (timeSinceLastRun < 60000) {
			console.log("Skipping auto-organize: rate limit");
			return;
		}

		const result = await handleOrganizeTabs({
			scope: settings.scope,
			mode: "instant",
			isAuto: true,
		});

		if (result.success) {
			console.log(`Auto-organize complete: ${result.groupsCreated} groups, ${result.tabsGrouped} tabs`);
		} else {
			console.error("Auto-organize failed:", result.error);
		}
	}
});

chrome.runtime.onStartup.addListener(async () => {
	const settings = await getSettings();
	if (settings.autoOrganize) {
		await setupAutoOrganizeAlarm(true, settings.autoOrganizeInterval);
	}
});

chrome.runtime.onInstalled.addListener(async () => {
	const settings = await getSettings();
	if (settings.autoOrganize) {
		await setupAutoOrganizeAlarm(true, settings.autoOrganizeInterval);
	}

	chrome.contextMenus.create({
		id: "tidytabs-organize",
		title: "Organize Tabs",
		contexts: ["page", "action"],
	});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	const { action, ...options } = message;

	let handler;

	switch (action) {
		case "organizeTabs":
			handler = handleOrganizeTabs(options);
			break;
		case "applyGroups":
			handler = handleApplyGroups(options.groups);
			break;
		case "clearGroups":
			handler = handleClearGroups(options);
			break;
		case "getStats":
			handler = handleGetStats();
			break;
		case "setAutoOrganize":
			handler = handleSetAutoOrganize(options);
			break;
		case "getAutoOrganizeStatus":
			handler = handleGetAutoOrganizeStatus();
			break;
		default:
			sendResponse({ success: false, error: "Unknown action" });
			return false;
	}

	handler.then(sendResponse).catch((error) => {
		sendResponse({ success: false, error: error.message });
	});

	return true;
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (info.menuItemId === "tidytabs-organize") {
		const settings = await getSettings();

		const notificationId = await chrome.notifications.create({
			type: "basic",
			iconUrl: chrome.runtime.getURL("icons/icon128.png"),
			title: "TidyTabs",
			message: "Analyzing tabs...",
			priority: 1,
		});

		const result = await handleOrganizeTabs({
			scope: settings.contextMenuScope || "all",
			mode: "instant",
		});

		chrome.notifications.clear(notificationId);

		if (result.success) {
			chrome.notifications.create({
				type: "basic",
				iconUrl: chrome.runtime.getURL("icons/icon128.png"),
				title: "TidyTabs - Success",
				message: `Organized ${result.tabsGrouped || 0} tabs into ${result.groupsCreated || 0} groups`,
				priority: 1,
			});
		} else {
			chrome.notifications.create({
				type: "basic",
				iconUrl: chrome.runtime.getURL("icons/icon128.png"),
				title: "TidyTabs - Error",
				message: result.error || "Failed to organize tabs",
				priority: 2,
			});
		}
	}
});

console.log("TidyTabs background service worker loaded");
