import { getSettings, saveSettings } from "./lib/storage.js";
import { getColorForGroup } from "./lib/colors.js";

const elements = {
	// Stats
	tabCount: document.getElementById("tabCount"),
	scopeDisplay: document.getElementById("scopeDisplay"),

	// Warning
	apiKeyWarning: document.getElementById("apiKeyWarning"),
	addApiKeyBtn: document.getElementById("addApiKeyBtn"),

	// Controls
	scopeCurrent: document.getElementById("scopeCurrent"),
	scopeAll: document.getElementById("scopeAll"),
	modePreview: document.getElementById("modePreview"),
	modeInstant: document.getElementById("modeInstant"),

	// Auto-organize
	autoOrganizeToggle: document.getElementById("autoOrganizeToggle"),
	autoStatus: document.getElementById("autoStatus"),

	// Actions
	organizeBtn: document.getElementById("organizeBtn"),
	clearBtn: document.getElementById("clearBtn"),
	settingsBtn: document.getElementById("settingsBtn"),

	// Preview
	previewSection: document.getElementById("previewSection"),
	previewContent: document.getElementById("previewContent"),
	closePreviewBtn: document.getElementById("closePreviewBtn"),
	applyBtn: document.getElementById("applyBtn"),
	editBtn: document.getElementById("editBtn"),

	// Status
	loadingOverlay: document.getElementById("loadingOverlay"),
	errorMessage: document.getElementById("errorMessage"),
	errorText: document.getElementById("errorText"),
	dismissErrorBtn: document.getElementById("dismissErrorBtn"),
	successMessage: document.getElementById("successMessage"),
	successText: document.getElementById("successText"),
};

// State
let currentSettings = {};
let previewGroups = null;

async function init() {
	currentSettings = await getSettings();

	updateControls();
	updateAutoOrganizeUI();

	await updateStats();
	checkApiKey();

	attachEventListeners();

	document.addEventListener("keydown", handleKeydown);
}

function styleToggleButton(button, active) {
	button.classList.toggle("btn-primary", active);
	button.classList.toggle("btn-outline", !active);
}

function updateControls() {
	const scopeCurrentActive = currentSettings.scope === "current";
	const scopeAllActive = currentSettings.scope === "all";

	styleToggleButton(elements.scopeCurrent, scopeCurrentActive);
	styleToggleButton(elements.scopeAll, scopeAllActive);

	const modePreviewActive = currentSettings.mode === "preview";
	const modeInstantActive = currentSettings.mode === "instant";

	styleToggleButton(elements.modePreview, modePreviewActive);
	styleToggleButton(elements.modeInstant, modeInstantActive);

	elements.scopeDisplay.textContent = currentSettings.scope === "current" ? "current window" : "all windows";
}

function updateAutoOrganizeUI() {
	const isEnabled = currentSettings.autoOrganize;
	elements.autoOrganizeToggle.checked = isEnabled;
	elements.autoStatus.textContent = isEnabled ? `Every ${currentSettings.autoOrganizeInterval}m` : "Off";
}

async function updateStats() {
	try {
		const response = await chrome.runtime.sendMessage({ action: "getStats" });
		const count = currentSettings.scope === "current" ? response.currentWindow : response.allWindows;
		elements.tabCount.innerHTML = `<span class="font-semibold text-base-content">${count}</span> tabs`;
	} catch (error) {
		console.error("Failed to get stats:", error);
	}
}

function checkApiKey() {
	const hasKey = !!currentSettings.apiKey;
	elements.apiKeyWarning.classList.toggle("hidden", hasKey);
	elements.organizeBtn.disabled = !hasKey;
}

function showLoading(show = true, text = "Analyzing tabs...") {
	const textEl = elements.loadingOverlay.querySelector("span");
	if (textEl) textEl.textContent = text;
	elements.loadingOverlay.classList.toggle("hidden", !show);
}

function showError(message) {
	elements.errorText.textContent = message;
	elements.errorMessage.classList.remove("hidden");
	elements.successMessage.classList.add("hidden");

	setTimeout(() => {
		elements.errorMessage.classList.add("hidden");
	}, 5000);
}

function showSuccess(message) {
	elements.successText.textContent = message;
	elements.successMessage.classList.remove("hidden");
	elements.errorMessage.classList.add("hidden");

	setTimeout(() => {
		elements.successMessage.classList.add("hidden");
	}, 3000);
}

function renderPreview(groups) {
	previewGroups = groups;
	elements.previewContent.innerHTML = "";

	groups.forEach((group) => {
		const color = getColorForGroup(group.label);
		const item = document.createElement("div");
		item.className = "flex items-center gap-3 rounded-lg border border-base-300 px-3 py-2 bg-base-100 hover:bg-base-200 cursor-default";
		item.innerHTML = `
		  <div class="h-3 w-3 rounded-full" style="background-color: ${color}"></div>
		  <div>
		    <p class="text-sm font-semibold">${escapeHtml(group.label)}</p>
		    <p class="text-xs text-base-content/70">${group.tabIds.length} tabs</p>
		  </div>
		`;

		if (group.tabs) {
			const titles = group.tabs.map((t) => t.title).join("\n");
			item.title = titles;
		}

		elements.previewContent.appendChild(item);
	});

	elements.previewSection.classList.remove("hidden");
}

function escapeHtml(text) {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}

async function handleOrganize() {
	showLoading(true);
	hidePreview();

	try {
		const response = await chrome.runtime.sendMessage({
			action: "organizeTabs",
			scope: currentSettings.scope,
			mode: currentSettings.mode,
		});

		showLoading(false);

		if (!response.success) {
			if (response.needsApiKey) {
				chrome.runtime.openOptionsPage();
			}
			showError(response.error);
			return;
		}

		if (response.preview) {
			renderPreview(response.groups);
		} else if (response.applied) {
			showSuccess(`Created ${response.groupsCreated} groups with ${response.tabsGrouped} tabs`);
			await updateStats();
		}
	} catch (error) {
		showLoading(false);
		showError(error.message || "Failed to organize tabs");
	}
}

async function handleApply() {
	if (!previewGroups) return;

	showLoading(true, "Applying groups...");

	try {
		const response = await chrome.runtime.sendMessage({
			action: "applyGroups",
			groups: previewGroups,
		});

		showLoading(false);
		hidePreview();

		if (!response.success) {
			showError(response.error);
			return;
		}

		showSuccess(`Created ${response.groupsCreated} groups with ${response.tabsGrouped} tabs`);
		await updateStats();
	} catch (error) {
		showLoading(false);
		showError(error.message || "Failed to apply groups");
	}
}

async function handleClear() {
	try {
		const response = await chrome.runtime.sendMessage({
			action: "clearGroups",
			scope: currentSettings.scope,
		});

		if (response.success) {
			showSuccess(`Cleared ${response.groupsRemoved} groups`);
			await updateStats();
		} else {
			showError(response.error);
		}
	} catch (error) {
		showError(error.message || "Failed to clear groups");
	}
}

function hidePreview() {
	elements.previewSection.classList.add("hidden");
	previewGroups = null;
}

async function handleScopeChange(scope) {
	currentSettings.scope = scope;
	await saveSettings({ scope });

	updateControls();
	await updateStats();
}

async function handleModeChange(mode) {
	currentSettings.mode = mode;
	await saveSettings({ mode });
	updateControls();
}

async function handleAutoOrganizeToggle() {
	const enabled = elements.autoOrganizeToggle.checked;

	if (enabled && !currentSettings.apiKey) {
		elements.autoOrganizeToggle.checked = false;
		showError("Add API key first in Settings");
		return;
	}

	try {
		const response = await chrome.runtime.sendMessage({
			action: "setAutoOrganize",
			enabled: enabled,
			interval: currentSettings.autoOrganizeInterval || 5,
		});

		if (response.success) {
			currentSettings.autoOrganize = enabled;
			currentSettings.autoOrganizeInterval = response.autoOrganizeInterval;
			updateAutoOrganizeUI();

			if (enabled) {
				showSuccess(`Auto-organize enabled (every ${response.autoOrganizeInterval}m)`);
			} else {
				showSuccess("Auto-organize disabled");
			}
		}
	} catch (error) {
		elements.autoOrganizeToggle.checked = !enabled;
		showError("Failed to update auto-organize");
	}
}

function handleKeydown(event) {
	if (event.key === "Enter" && !elements.organizeBtn.disabled) {
		if (previewGroups && !elements.previewSection.classList.contains("hidden")) {
			handleApply();
		} else {
			handleOrganize();
		}
		return;
	}

	if (event.key === "Escape") {
		if (!elements.previewSection.classList.contains("hidden")) {
			hidePreview();
		} else {
			window.close();
		}
		return;
	}

	if (event.key === "s" || event.key === "S") {
		chrome.runtime.openOptionsPage();
		return;
	}

	if (event.key === "c" || event.key === "C") {
		handleClear();
		return;
	}

	if (event.key === "a" || event.key === "A") {
		elements.autoOrganizeToggle.checked = !elements.autoOrganizeToggle.checked;
		handleAutoOrganizeToggle();
		return;
	}
}

function attachEventListeners() {
	// Scope toggles
	elements.scopeCurrent.addEventListener("click", () => handleScopeChange("current"));
	elements.scopeAll.addEventListener("click", () => handleScopeChange("all"));

	// Mode toggles
	elements.modePreview.addEventListener("click", () => handleModeChange("preview"));
	elements.modeInstant.addEventListener("click", () => handleModeChange("instant"));

	// Auto-organize toggle
	elements.autoOrganizeToggle.addEventListener("change", handleAutoOrganizeToggle);

	// Action buttons
	elements.organizeBtn.addEventListener("click", handleOrganize);
	elements.clearBtn.addEventListener("click", handleClear);
	elements.settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

	// Preview actions
	elements.closePreviewBtn.addEventListener("click", hidePreview);
	elements.applyBtn.addEventListener("click", handleApply);
	elements.editBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

	// API key warning
	elements.addApiKeyBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

	// Error dismiss
	elements.dismissErrorBtn.addEventListener("click", () => {
		elements.errorMessage.classList.add("hidden");
	});
}

document.addEventListener("DOMContentLoaded", init);
