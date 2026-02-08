import { collectTabMetadata, getUniqueDomains, applyTabGroups, clearTabGroups, getCurrentWindowId } from "./lib/tabs.js";
import { getSettings, saveSettings, addToHistory } from "./lib/storage.js";
import { buildPrompt, callOpenRouter } from "./lib/openrouter.js";

const browserAPI = globalThis.browser || globalThis.chrome;

const AUTO_ORGANIZE_ALARM = "tidytabs-auto-organize";
const CONTEXT_MENU_ID = "tidytabs-organize";
const MIN_INTERVAL_MINUTES = 2;

let cachedOrganizeResult = null;
let cachedTabsSignature = null;

function generateTabsSignature(tabs) {
	return tabs
		.map((t) => `${t.id}:${t.url}`)
		.sort()
		.join("|");
}

function getActionContext() {
	return browserAPI.action ? "action" : "browser_action";
}

function buildGroupingErrorMessage(result) {
	if (result?.error) {
		return result.error;
	}

	if (Array.isArray(result?.errors) && result.errors.length > 0) {
		const firstError = result.errors[0]?.error;
		if (firstError) {
			return firstError;
		}
	}

	return "Tab grouping failed in this browser. Firefox may not support tab groups on your current version.";
}

async function ensureContextMenu() {
	const actionContext = getActionContext();

	try {
		await browserAPI.contextMenus.remove(CONTEXT_MENU_ID);
	} catch {}

	browserAPI.contextMenus.create({
		id: CONTEXT_MENU_ID,
		title: "Organize Tabs",
		contexts: ["page", actionContext],
	});
}

async function handleOrganizeTabs(options = {}) {
	const settings = await getSettings();
	const scope = options.scope || settings.scope;
	const mode = options.isAuto ? "instant" : options.mode || settings.mode;
	const isPreview = mode === "preview";
	const forceRefresh = options.forceRefresh || false;

	if (!settings.apiKey) {
		return {
			success: false,
			error: "API key not configured. Please add your OpenRouter API key in settings.",
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

		const currentSignature = generateTabsSignature(tabs);

		let response;
		if (isPreview && !forceRefresh && cachedTabsSignature === currentSignature && cachedOrganizeResult) {
			console.log("Using cached organize result for deterministic preview");
			response = cachedOrganizeResult;
		} else {
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
			response = await callOpenRouter(settings.apiKey, prompt, settings.selectedModel);

			if (isPreview) {
				cachedOrganizeResult = response;
				cachedTabsSignature = currentSignature;
				console.log("Cached new organize result for deterministic preview");
			}
		}

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
			error: result.success ? undefined : buildGroupingErrorMessage(result),
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

		cachedOrganizeResult = null;
		cachedTabsSignature = null;

		return {
			success: result.success,
			groupsCreated: result.groupsCreated,
			tabsGrouped: result.tabsGrouped,
			errors: result.errors,
			error: result.success ? undefined : buildGroupingErrorMessage(result),
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
	await browserAPI.alarms.clear(AUTO_ORGANIZE_ALARM);

	if (enabled) {
		const interval = Math.max(intervalMinutes, MIN_INTERVAL_MINUTES);

		await browserAPI.alarms.create(AUTO_ORGANIZE_ALARM, {
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
	const alarm = await browserAPI.alarms.get(AUTO_ORGANIZE_ALARM);

	return {
		enabled: settings.autoOrganize,
		interval: settings.autoOrganizeInterval,
		lastRun: settings.lastAutoOrganize,
		nextRun: alarm ? alarm.scheduledTime : null,
	};
}

browserAPI.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === AUTO_ORGANIZE_ALARM) {
		console.log("Auto-organize triggered");

		const settings = await getSettings();

		if (!settings.autoOrganize) {
			await browserAPI.alarms.clear(AUTO_ORGANIZE_ALARM);
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

browserAPI.runtime.onStartup.addListener(async () => {
	const settings = await getSettings();
	if (settings.autoOrganize) {
		await setupAutoOrganizeAlarm(true, settings.autoOrganizeInterval);
	}

	await ensureContextMenu();
});

browserAPI.runtime.onInstalled.addListener(async () => {
	const settings = await getSettings();
	if (settings.autoOrganize) {
		await setupAutoOrganizeAlarm(true, settings.autoOrganizeInterval);
	}

	await ensureContextMenu();
});

browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

browserAPI.contextMenus.onClicked.addListener(async (info, tab) => {
	if (info.menuItemId === CONTEXT_MENU_ID) {
		const settings = await getSettings();

		const notificationId = await browserAPI.notifications.create({
			type: "basic",
			iconUrl: browserAPI.runtime.getURL("icons/icon128.png"),
			title: "TidyTabs",
			message: "Analyzing tabs...",
			priority: 1,
		});

		const result = await handleOrganizeTabs({
			scope: settings.contextMenuScope || "all",
			mode: "instant",
		});

		browserAPI.notifications.clear(notificationId);

		if (result.success) {
			browserAPI.notifications.create({
				type: "basic",
				iconUrl: browserAPI.runtime.getURL("icons/icon128.png"),
				title: "TidyTabs - Success",
				message: `Organized ${result.tabsGrouped || 0} tabs into ${result.groupsCreated || 0} groups`,
				priority: 1,
			});
		} else {
			browserAPI.notifications.create({
				type: "basic",
				iconUrl: browserAPI.runtime.getURL("icons/icon128.png"),
				title: "TidyTabs - Error",
				message: result.error || "Failed to organize tabs",
				priority: 2,
			});
		}
	}
});

ensureContextMenu().catch((error) => {
	console.error("Failed to initialize context menu:", error);
});

console.log("TidyTabs background service worker loaded");
