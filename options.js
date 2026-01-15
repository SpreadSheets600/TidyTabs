import { getSettings, saveSettings, saveApiKey, getPresets, savePreset, deletePreset, getHistory, clearHistory } from "./lib/storage.js";
import { testApiKey, fetchModels, getDefaultModel } from "./lib/gemini.js";

const DEFAULT_PROMPT = `Group These Tabs By Topic/Domain. Create 2-7 Groups Max.

{{TAB_DATA}}

Output Valid JSON Only:
{"groups":[{"label":"Short Name (1 - 2 Words Max.)","tabIds":[1,2,3]}]}`;

const elements = {
	apiKeyInput: document.getElementById("apiKeyInput"),
	toggleApiKeyBtn: document.getElementById("toggleApiKeyBtn"),

	saveApiKeyBtn: document.getElementById("saveApiKeyBtn"),
	testApiKeyBtn: document.getElementById("testApiKeyBtn"),

	apiKeyStatus: document.getElementById("apiKeyStatus"),

	modelSelect: document.getElementById("modelSelect"),
	refreshModelsBtn: document.getElementById("refreshModelsBtn"),

	defaultScope: document.getElementById("defaultScope"),

	defaultMode: document.getElementById("defaultMode"),

	respectPinned: document.getElementById("respectPinned"),
	respectExistingGroups: document.getElementById("respectExistingGroups"),
	contextMenuScope: document.getElementById("contextMenuScope"),

	autoOrganize: document.getElementById("autoOrganize"),
	autoOrganizeInterval: document.getElementById("autoOrganizeInterval"),
	autoOrganizeIntervalRow: document.getElementById("autoOrganizeIntervalRow"),

	promptTemplate: document.getElementById("promptTemplate"),

	savePromptBtn: document.getElementById("savePromptBtn"),
	resetPromptBtn: document.getElementById("resetPromptBtn"),

	presetNameInput: document.getElementById("presetNameInput"),

	savePresetBtn: document.getElementById("savePresetBtn"),
	presetsList: document.getElementById("presetsList"),

	historyList: document.getElementById("historyList"),
	clearHistoryBtn: document.getElementById("clearHistoryBtn"),
};

async function init() {
	const settings = await getSettings();

	if (settings.apiKey) {
		elements.apiKeyInput.value = settings.apiKey;
		await updateModelList(settings.apiKey, settings.selectedModel);
	} else {
		updateModelSelectState(false);
	}

	elements.defaultScope.value = settings.scope || "current";
	elements.defaultMode.value = settings.mode || "preview";

	elements.respectPinned.checked = settings.respectPinned !== false;
	elements.respectExistingGroups.checked = settings.respectExistingGroups === true;

	elements.contextMenuScope.value = settings.contextMenuScope || "all";
	elements.autoOrganize.checked = settings.autoOrganize === true;
	elements.autoOrganizeInterval.value = settings.autoOrganizeInterval || 5;

	updateAutoOrganizeIntervalVisibility();
	elements.promptTemplate.value = settings.promptTemplate || DEFAULT_PROMPT;

	await renderPresets();
	await renderHistory();
	attachEventListeners();
}

async function updateModelList(apiKey, selectedModel) {
	if (!apiKey) {
		updateModelSelectState(false);
		return;
	}

	elements.modelSelect.innerHTML = "<option disabled selected>Loading models...</option>";
	elements.modelSelect.disabled = true;
	elements.refreshModelsBtn.disabled = true;

	const models = await fetchModels(apiKey);
	const defaultModel = getDefaultModel();

	elements.modelSelect.innerHTML = "";
	models.forEach((model) => {
		const option = document.createElement("option");
		option.value = model;
		option.textContent = model;
		elements.modelSelect.appendChild(option);
	});

	if (selectedModel && models.includes(selectedModel)) {
		elements.modelSelect.value = selectedModel;
	} else if (models.includes(defaultModel)) {
		elements.modelSelect.value = defaultModel;
	} else if (models.length > 0) {
		elements.modelSelect.value = models[0];
	}

	if (elements.modelSelect.value && elements.modelSelect.value !== selectedModel) {
		await saveSettings({ selectedModel: elements.modelSelect.value });
	}

	updateModelSelectState(true);
}

function updateModelSelectState(enabled) {
	elements.modelSelect.disabled = !enabled;
	elements.refreshModelsBtn.disabled = !enabled;
	if (!enabled) {
		elements.modelSelect.innerHTML = "<option disabled selected>Enter API key first</option>";
	}
}

async function handleRefreshModels() {
	const key = elements.apiKeyInput.value.trim();
	if (!key) {
		showApiKeyStatus("Please enter an API key", "error");
		return;
	}
	await updateModelList(key, elements.modelSelect.value);
}

async function handleModelChange() {
	const model = elements.modelSelect.value;
	if (model) {
		await saveSettings({ selectedModel: model });
	}
}

function updateAutoOrganizeIntervalVisibility() {
	const isEnabled = elements.autoOrganize.checked;
	elements.autoOrganizeIntervalRow.style.opacity = isEnabled ? "1" : "0.5";
	elements.autoOrganizeInterval.disabled = !isEnabled;
}

function showApiKeyStatus(message, type = "info") {
	elements.apiKeyStatus.textContent = message;
	let alertClass = "uk-alert";

	if (type === "error") {
		alertClass = "uk-alert uk-alert-destructive";
	}

	elements.apiKeyStatus.className = `${alertClass} uk-margin-small-top`;
	elements.apiKeyStatus.classList.remove("hidden");

	if (type === "success") {
		setTimeout(() => {
			elements.apiKeyStatus.classList.add("hidden");
		}, 3000);
	}
}

async function handleSaveApiKey() {
	const key = elements.apiKeyInput.value.trim();

	if (!key) {
		showApiKeyStatus("Please enter an API key", "error");
		return;
	}

	await saveApiKey(key);
	showApiKeyStatus("API key saved successfully", "success");

	// Preserve currently selected model if possible
	const currentModel = elements.modelSelect.value;
	await updateModelList(key, currentModel);
}

async function handleTestApiKey() {
	const key = elements.apiKeyInput.value.trim();
	const model = elements.modelSelect.value;

	if (!key) {
		showApiKeyStatus("Please enter an API key first", "error");
		return;
	}

	showApiKeyStatus(`Testing API key with ${model}...`, "info");

	const isValid = await testApiKey(key, model);

	if (isValid) {
		showApiKeyStatus("✓ API key is valid!", "success");
	} else {
		showApiKeyStatus("✗ API key is invalid or has no permission", "error");
	}
}

function toggleApiKeyVisibility() {
	const isPassword = elements.apiKeyInput.type === "password";

	elements.apiKeyInput.type = isPassword ? "text" : "password";
	elements.toggleApiKeyBtn.innerHTML = isPassword
		? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`
		: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

async function handleSettingsChange() {
	await saveSettings({
		scope: elements.defaultScope.value,
		mode: elements.defaultMode.value,
		respectPinned: elements.respectPinned.checked,
		respectExistingGroups: elements.respectExistingGroups.checked,
	});
}

async function handleContextMenuSettingsChange() {
	await saveSettings({
		contextMenuScope: elements.contextMenuScope.value,
	});
}

async function handleAutoOrganizeChange() {
	const enabled = elements.autoOrganize.checked;
	const interval = parseInt(elements.autoOrganizeInterval.value, 10);

	updateAutoOrganizeIntervalVisibility();

	const settings = await getSettings();
	if (enabled && !settings.apiKey) {
		elements.autoOrganize.checked = false;
		updateAutoOrganizeIntervalVisibility();
		showApiKeyStatus("Add API key first before enabling auto-organize", "error");
		return;
	}

	await chrome.runtime.sendMessage({
		action: "setAutoOrganize",
		enabled: enabled,
		interval: interval,
	});
}

async function handleAutoOrganizeIntervalChange() {
	const enabled = elements.autoOrganize.checked;
	const interval = parseInt(elements.autoOrganizeInterval.value, 10);

	if (enabled) {
		await chrome.runtime.sendMessage({
			action: "setAutoOrganize",
			enabled: true,
			interval: interval,
		});
	} else {
		await saveSettings({ autoOrganizeInterval: interval });
	}
}

async function handleSavePrompt() {
	const prompt = elements.promptTemplate.value.trim();

	if (!prompt) {
		alert("Prompt cannot be empty");
		return;
	}

	await saveSettings({ promptTemplate: prompt });

	elements.savePromptBtn.textContent = "✓ Saved!";
	setTimeout(() => {
		elements.savePromptBtn.textContent = "Save Prompt";
	}, 2000);
}

async function handleResetPrompt() {
	if (!confirm("Reset prompt to default? Your current prompt will be lost.")) {
		return;
	}

	elements.promptTemplate.value = DEFAULT_PROMPT;
	await saveSettings({ promptTemplate: DEFAULT_PROMPT });
}

async function handleSavePreset() {
	const name = elements.presetNameInput.value.trim();
	const prompt = elements.promptTemplate.value.trim();

	if (!name) {
		alert("Please enter a preset name");
		return;
	}

	if (!prompt) {
		alert("Prompt cannot be empty");
		return;
	}

	await savePreset({ name, prompt });
	elements.presetNameInput.value = "";
	await renderPresets();
}

async function handleLoadPreset(name) {
	const presets = await getPresets();
	const preset = presets.find((p) => p.name === name);

	if (preset) {
		elements.promptTemplate.value = preset.prompt;
	}
}

async function handleDeletePreset(name) {
	if (!confirm(`Delete preset "${name}"?`)) {
		return;
	}

	await deletePreset(name);
	await renderPresets();
}

async function renderPresets() {
	const presets = await getPresets();

	if (presets.length === 0) {
		elements.presetsList.innerHTML = '<div class="uk-text-muted uk-text-small">No presets saved yet</div>';
		return;
	}

	elements.presetsList.innerHTML = presets
		.map(
			(preset) => `
    <div class="uk-flex uk-flex-between uk-flex-middle uk-padding-small uk-margin-small-bottom" style="border: 1px solid var(--uk-border-color, #e5e7eb); border-radius: 4px;" data-name="${escapeHtml(preset.name)}">
      <span class="uk-text-bold uk-text-small">${escapeHtml(preset.name)}</span>
      <div class="uk-flex" style="gap: 0.25rem;">
        <button class="uk-btn uk-btn-ghost uk-btn-xs load-preset">Load</button>
        <button class="uk-btn uk-btn-ghost uk-btn-xs uk-text-destructive delete-preset">Delete</button>
      </div>
    </div>
  `
		)
		.join("");

	elements.presetsList.querySelectorAll(".load-preset").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			const name = e.target.closest("[data-name]").dataset.name;
			handleLoadPreset(name);
		});
	});

	elements.presetsList.querySelectorAll(".delete-preset").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			const name = e.target.closest("[data-name]").dataset.name;
			handleDeletePreset(name);
		});
	});
}

async function renderHistory() {
	const history = await getHistory(20);

	if (history.length === 0) {
		elements.historyList.innerHTML = '<div class="uk-text-muted uk-text-small">No history yet</div>';
		return;
	}

	elements.historyList.innerHTML = history
		.map((entry) => {
			const date = new Date(entry.timestamp);
			const dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
			const groupCount = entry.groups?.length || 0;
			const tabCount = entry.tabCount || 0;
			const autoLabel = entry.auto ? " (auto)" : "";

			return `
      <div class="uk-flex uk-flex-between uk-flex-middle uk-padding-small uk-margin-small-bottom" style="border: 1px solid var(--uk-border-color, #e5e7eb); border-radius: 4px;">
        <div>
          <span class="uk-text-bold uk-text-small">${dateStr}${autoLabel}</span>
          <span class="uk-text-muted uk-text-small uk-display-block">${groupCount} groups, ${tabCount} tabs</span>
        </div>
      </div>
    `;
		})
		.join("");
}

async function handleClearHistory() {
	if (!confirm("Clear all history? This cannot be undone.")) {
		return;
	}

	await clearHistory();
	await renderHistory();
}

function escapeHtml(text) {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}

function attachEventListeners() {
	elements.saveApiKeyBtn.addEventListener("click", handleSaveApiKey);
	elements.testApiKeyBtn.addEventListener("click", handleTestApiKey);
	elements.toggleApiKeyBtn.addEventListener("click", toggleApiKeyVisibility);

	elements.refreshModelsBtn.addEventListener("click", handleRefreshModels);
	elements.modelSelect.addEventListener("change", handleModelChange);

	elements.defaultScope.addEventListener("change", handleSettingsChange);
	elements.defaultMode.addEventListener("change", handleSettingsChange);

	elements.respectPinned.addEventListener("change", handleSettingsChange);
	elements.respectExistingGroups.addEventListener("change", handleSettingsChange);

	elements.contextMenuScope.addEventListener("change", handleContextMenuSettingsChange);
	elements.autoOrganize.addEventListener("change", handleAutoOrganizeChange);
	elements.autoOrganizeInterval.addEventListener("change", handleAutoOrganizeIntervalChange);

	elements.savePromptBtn.addEventListener("click", handleSavePrompt);
	elements.resetPromptBtn.addEventListener("click", handleResetPrompt);
	elements.savePresetBtn.addEventListener("click", handleSavePreset);
	elements.clearHistoryBtn.addEventListener("click", handleClearHistory);
}

document.addEventListener("DOMContentLoaded", init);
