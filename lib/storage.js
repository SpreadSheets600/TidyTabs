const DEFAULT_SETTINGS = {
	apiKey: "",
	selectedModel: "gemini-2.0-flash-exp",
	scope: "current",
	mode: "preview",
	respectPinned: true,
	autoOrganize: false,
	respectExistingGroups: false,
	autoOrganizeInterval: 5,
	lastAutoOrganize: 0,
	contextMenuScope: "all",
	promptTemplate: `Group these tabs by topic/domain. Create 2-7 groups max.

{{TAB_DATA}}

Output valid JSON only:
{"groups":[{"label":"Short Name","tabIds":[1,2,3]}]}`,
	presets: [],
	history: [],
};

const MAX_HISTORY_ENTRIES = 50;

export async function getSettings() {
	const result = await chrome.storage.local.get("settings");
	return { ...DEFAULT_SETTINGS, ...result.settings };
}

export async function saveSettings(settings) {
	const current = await getSettings();
	const merged = { ...current, ...settings };
	await chrome.storage.local.set({ settings: merged });
	return merged;
}

export async function getApiKey() {
	const settings = await getSettings();
	return settings.apiKey || "";
}

export async function saveApiKey(apiKey) {
	return saveSettings({ apiKey });
}

export async function getPromptTemplate() {
	const settings = await getSettings();
	return settings.promptTemplate;
}

export async function savePromptTemplate(template) {
	return saveSettings({ promptTemplate: template });
}

export async function getPresets() {
	const settings = await getSettings();
	return settings.presets || [];
}

export async function savePreset(preset) {
	const presets = await getPresets();
	const existingIndex = presets.findIndex((p) => p.name === preset.name);

	if (existingIndex >= 0) {
		presets[existingIndex] = preset;
	} else {
		presets.push(preset);
	}

	return saveSettings({ presets });
}

export async function deletePreset(name) {
	const presets = await getPresets();
	const filtered = presets.filter((p) => p.name !== name);
	return saveSettings({ presets: filtered });
}

export async function addToHistory(entry) {
	const settings = await getSettings();
	const history = settings.history || [];

	history.unshift({
		...entry,
		timestamp: Date.now(),
	});

	if (history.length > MAX_HISTORY_ENTRIES) {
		history.length = MAX_HISTORY_ENTRIES;
	}

	return saveSettings({ history });
}

export async function getHistory(limit = 10) {
	const settings = await getSettings();
	return (settings.history || []).slice(0, limit);
}

export async function clearHistory() {
	return saveSettings({ history: [] });
}

export async function resetSettings() {
	await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
	return DEFAULT_SETTINGS;
}
