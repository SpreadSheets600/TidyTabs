const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b:free";

const SYSTEM_PROMPT = `You are a tab organization assistant. Your job is to analyze browser tabs and group them intelligently.

Rules:
- Create 2-10 groups based on topic, purpose, domain, or user intent.
- Use short, descriptive group labels (2-4 words max).
- Every tab must be assigned to exactly one group.
- If a tab doesn't fit well anywhere, put it in "Other".
- Never create empty groups.
- Respond with valid JSON only, no markdown, no explanation.

Output format:
{"groups":[{"label":"Group Name","tabIds":[1,2,3]}]}`;

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
}

export async function callOpenRouter(apiKey, prompt, model = DEFAULT_MODEL, retryCount = 0) {
	if (!apiKey) {
		throw new Error("API key is required");
	}

	const response = await fetch(OPENROUTER_API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: prompt },
			],
			temperature: 0.3,
			max_tokens: 4096,
			response_format: { type: "json_object" },
		}),
	});

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));

		if (response.status === 401) {
			throw new Error("Invalid API key");
		} else if (response.status === 429) {
			throw new Error("Rate limit exceeded. Please wait a moment.");
		} else if (response.status === 402) {
			throw new Error("Insufficient credits on OpenRouter");
		} else if (response.status >= 500 && retryCount < 2) {
			return callOpenRouter(apiKey, prompt, model, retryCount + 1);
		} else {
			throw new Error(errorData.error?.message || `API error: ${response.status}`);
		}
	}

	const data = await response.json();
	const text = data.choices?.[0]?.message?.content;

	if (!text) {
		throw new Error("Empty response from OpenRouter");
	}

	return parseResponse(text);
}

export async function testApiKey(apiKey, model = DEFAULT_MODEL) {
	try {
		const response = await fetch(OPENROUTER_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content: 'Say "ok"' }],
				max_tokens: 5,
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
