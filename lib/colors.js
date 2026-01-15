const CHROME_COLORS = ["blue", "cyan", "green", "yellow", "orange", "pink", "purple", "red", "grey"];

function hashCode(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);

		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return Math.abs(hash);
}

export function getColorForGroup(groupLabel) {
	const hash = hashCode(groupLabel.toLowerCase().trim());
	return CHROME_COLORS[hash % CHROME_COLORS.length];
}

export function assignGroupColors(labels) {
	const colorMap = {};
	const usedColors = new Set();

	labels.forEach((label) => {
		const color = getColorForGroup(label);
		colorMap[label] = color;
	});

	if (labels.length <= CHROME_COLORS.length) {
		const conflicts = {};

		labels.forEach((label) => {
			const color = colorMap[label];
			if (!conflicts[color]) {
				conflicts[color] = [];
			}

			conflicts[color].push(label);
		});

		Object.entries(conflicts).forEach(([color, conflictLabels]) => {
			if (conflictLabels.length > 1) {
				for (let i = 1; i < conflictLabels.length; i++) {
					const label = conflictLabels[i];
					const unusedColor = CHROME_COLORS.find((c) => !Object.values(colorMap).includes(c) || c === colorMap[label]);

					if (unusedColor) {
						colorMap[label] = unusedColor;
					}
				}
			}
		});
	}

	return colorMap;
}

export function getAvailableColors() {
	return [...CHROME_COLORS];
}
