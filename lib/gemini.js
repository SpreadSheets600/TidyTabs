const DEFAULT_MODEL = "gemini-flash-latest";

export async function fetchModels(apiKey) {
	if (!apiKey) {
		throw new Error("API key is required");
	}

	const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch models: ${response.status}`);
		}
		const data = await response.json();

		return data.models.filter((m) => m.supportedGenerationMethods.includes("generateContent")).map((m) => m.name.replace("models/", ""));
	} catch (error) {
		console.error("Error fetching models:", error);
		return [DEFAULT_MODEL, "gemini-1.5-flash", "gemini-1.5-pro"];
	}
}

export function buildPrompt(template, variables) {
	let prompt = template;

	for (const [key, value] of Object.entries(variables)) {
		const placeholder = `{{${key}}}`;
		const replacement = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);

		prompt = prompt.replace(new RegExp(placeholder, "g"), replacement);
	}

	return prompt;
}

export function parseResponse(text) {
	let jsonStr = text.trim();

	const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (jsonMatch) {
		jsonStr = jsonMatch[1].trim();
	}

	const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
	if (objectMatch) {
		jsonStr = objectMatch[0];
	}

	try {
		const parsed = JSON.parse(jsonStr);

		if (!parsed.groups || !Array.isArray(parsed.groups)) {
			throw new Error('Response missing "groups" array');
		}

		for (const group of parsed.groups) {
			if (typeof group.label !== "string" || !group.label.trim()) {
				throw new Error('Each group must have a non-empty "label" string');
			}
			if (!Array.isArray(group.tabIds)) {
				throw new Error('Each group must have a "tabIds" array');
			}

			group.tabIds = group.tabIds.map((id) => Number(id)).filter((id) => !isNaN(id));
		}

		return parsed;
	} catch (error) {
		if (error instanceof SyntaxError) {
			const groupsMatch = jsonStr.match(/"groups"\s*:\s*\[([\s\S]*?)\]/);
			if (groupsMatch) {
				let groupsStr = "[" + groupsMatch[1];

				groupsStr = groupsStr.replace(/,(\s*)\]$/, "$1]");
				try {
					const groups = JSON.parse(groupsStr);
					const validGroups = [];
					for (const group of groups) {
						if (typeof group.label === "string" && group.label.trim() && Array.isArray(group.tabIds)) {
							group.tabIds = group.tabIds.map((id) => Number(id)).filter((id) => !isNaN(id));
							if (group.tabIds.length > 0) {
								validGroups.push(group);
							}
						}
					}
					if (validGroups.length > 0) {
						console.warn("Parsed partial response due to truncation");
						return { groups: validGroups };
					}
				} catch (partialError) {
					console.error("Failed to parse partial groups:", partialError);
				}
			}
			throw new Error(`Invalid JSON response: ${error.message}`);
		}
		throw error;
	}
}

export async function callGemini(apiKey, prompt, model = DEFAULT_MODEL, maxTokens = 4096, retryCount = 0) {
	if (!apiKey) {
		throw new Error("API key is required");
	}

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

	const requestBody = {
		contents: [
			{
				parts: [
					{
						text: prompt,
					},
				],
			},
		],
		generationConfig: {
			temperature: 0.3,
			topK: 40,
			topP: 0.95,
			maxOutputTokens: maxTokens,
			responseMimeType: "application/json",
		},
		safetySettings: [
			{
				category: "HARM_CATEGORY_HARASSMENT",
				threshold: "BLOCK_NONE",
			},
			{
				category: "HARM_CATEGORY_HATE_SPEECH",
				threshold: "BLOCK_NONE",
			},
			{
				category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
				threshold: "BLOCK_NONE",
			},
			{
				category: "HARM_CATEGORY_DANGEROUS_CONTENT",
				threshold: "BLOCK_NONE",
			},
		],
	};

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));

			if (response.status === 400) {
				throw new Error("Invalid API key or request");
			} else if (response.status === 429) {
				throw new Error("Rate limit exceeded. Please wait a moment.");
			} else if (response.status === 403) {
				throw new Error("API key does not have permission");
			} else if (response.status === 404) {
				throw new Error("Model not found. The API may have changed.");
			} else if (response.status >= 500 && retryCount < 2) {
				console.warn(`Server error ${response.status}, retrying (${retryCount + 1}/2)`);
				return callGemini(apiKey, prompt, model, maxTokens, retryCount + 1);
			} else {
				throw new Error(errorData.error?.message || `API error: ${response.status}`);
			}
		}

		const data = await response.json();

		const candidate = data.candidates?.[0];
		const text = candidate?.content?.parts?.[0]?.text;

		if (!text) {
			console.error("Gemini response debug:", JSON.stringify(data, null, 2));

			if (candidate?.finishReason) {
				throw new Error(`Gemini response empty. Reason: ${candidate.finishReason}`);
			}

			throw new Error("Empty response from Gemini (no candidates)");
		}

		if (candidate?.finishReason === "MAX_TOKENS" && maxTokens < 8192) {
			console.warn("Retrying with higher token limit due to MAX_TOKENS");
			return callGemini(apiKey, prompt, model, Math.min(maxTokens * 2, 8192));
		}

		return parseResponse(text);
	} catch (error) {
		if (error.name === "TypeError" && error.message.includes("fetch")) {
			throw new Error("Network error. Check your internet connection.");
		}
		throw error;
	}
}

export async function testApiKey(apiKey, model = DEFAULT_MODEL) {
	try {
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				contents: [
					{
						parts: [
							{
								text: 'Say "ok"',
							},
						],
					},
				],
				generationConfig: {
					maxOutputTokens: 10,
				},
			}),
		});

		return response.ok;
	} catch {
		return false;
	}
}

export function getDefaultModel() {
	return DEFAULT_MODEL;
}
