# TidyTabs

AI-powered browser tab organization using Google's Gemini API to intelligently group your tabs by topic, domain, and context.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Chrome Extension](https://img.shields.io/badge/platform-chrome-brightgreen)
![Manifest V3](https://img.shields.io/badge/manifest-v3-orange)

## Table of Contents

- [Description](#description)
- [Technologies Used](#technologies-used)
- [Installation](#installation)
- [Usage](#usage)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [FAQ](#faq)
- [Acknowledgements](#acknowledgements)

## Description

TidyTabs is a Chrome extension that leverages Google's Gemini AI to automatically organize browser tabs into semantic groups. Instead of manually sorting tabs by topic or project, TidyTabs analyzes tab titles, URLs, and domains to create intelligent groupings based on content similarity.

**Problem Solved**: Power users and researchers often accumulate dozens or hundreds of tabs across multiple projects, making navigation and context-switching difficult. Manual tab organization is time-consuming and error-prone.

**Key Features**:

- AI-powered semantic grouping using Gemini API
- Preview mode to review AI suggestions before applying
- Fully customizable prompts with variable templates
- Auto-organize on scheduled intervals
- Right-click context menu for quick access
- Privacy-focused: all data stays local, API key stored client-side
- Dark mode UI with shadcn-inspired aesthetics

## Technologies Used

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![Chrome](https://img.shields.io/badge/Chrome_Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![Google AI](https://img.shields.io/badge/Gemini_API-8E75B2?style=for-the-badge&logo=google&logoColor=white)

## Installation

### Prerequisites

- Any Chromium Browser
- Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

### Environment Setup

1. Clone or download this repository:

   ```bash
   git clone <repository-url>
   cd TidyTabs
   ```

2. Load the extension in Chrome:

   ```bash
   1. Open Chrome and navigate to chrome://extensions/
   2. Enable "Developer mode" (toggle in top-right corner)
   3. Click "Load unpacked"
   4. Select the TidyTabs directory
   ```

3. Configure API key:

   ```bash
   1. Click the TidyTabs extension icon in Chrome toolbar
   2. Click the settings icon (gear)
   3. Enter your Gemini API key
   4. Click "Save Key" and "Test Key" to verify
   ```

## Usage

### Basic Usage

**Quick Start**:

1. Open multiple tabs from different websites
2. Press `Ctrl+Shift+G` (or `Cmd+Shift+G` on Mac) or click the extension icon
3. Click "🔄 Organize Tabs"
4. Review the AI-suggested groups in preview mode
5. Click "✓ Apply Groups" to create tab groups

**Right-Click Context Menu**:

- Right-click anywhere on a webpage
- Select "⚡ Organize Tabs"
- Extension will instantly organize tabs based on configured scope

### Configuration

**Default Settings** (Options page):

- **Default Scope**: Choose between "Current Window" or "All Windows"
- **Default Mode**: "Preview First" (review before applying) or "Instant Apply"
- **Respect Pinned Tabs**: Exclude pinned tabs from grouping (enabled by default)
- **Respect Existing Groups**: Skip tabs already in groups
- **Auto-Organize**: Enable scheduled automatic organization (2-60 minute intervals)

**Context Menu Settings**:

- **Context Menu Scope**: Set scope for right-click organize action (defaults to "All Windows")

**Prompt Template Customization**:
Default prompt:

```
Group these tabs by topic/domain. Create 2-7 groups max.

{{TAB_DATA}}

Output valid JSON only:
{"groups":[{"label":"Short Name","tabIds":[1,2,3]}]}
```

Available variables:

- `{{TAB_DATA}}`: JSON array of tab objects (id, title, url, domain)
- `{{TAB_COUNT}}`: Total number of tabs
- `{{DOMAINS}}`: Array of unique domain names
- `{{WINDOW_ID}}`: Current window ID

**Prompt Presets**:

- Save custom prompts as named presets
- Load presets for different organization strategies
- Export/import functionality: Unknown (future work)

### Example Commands

**Keyboard Shortcuts**:

- `Ctrl+Shift+G` / `Cmd+Shift+G`: Open TidyTabs popup

**Workflow Examples**:

1. **Research Project Organization**:
   - Open tabs: academic papers, documentation, StackOverflow, GitHub repos
   - TidyTabs groups: "Research Papers", "Documentation", "Code Examples", "Q&A"

2. **Multi-Project Development**:
   - Open tabs: Project A frontend, Project A backend, Project B API docs, PRs
   - TidyTabs groups: "Project A - Frontend", "Project A - Backend", "Project B", "Reviews"

3. **Content Research**:
   - Open tabs: news articles, social media, competitor sites, analytics
   - TidyTabs groups: "News", "Social", "Competitors", "Analytics"

## Roadmap

**Planned Features**:

- [ ] Support for additional AI models (Claude, GPT-4)
- [ ] Export/import preset configurations
- [ ] Tab search and filter within groups
- [ ] Undo/redo group operations
- [ ] Analytics dashboard for tab organization patterns
- [ ] Firefox extension port

## Contributing

Contributions are welcome! This project follows standard open-source contribution practices.

**How to Contribute**:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

**Guidelines**:

- Follow existing code style (no unnecessary comments, minimal defensive checks)
- Test changes manually with 10+ tabs
- Update README if adding new features
- Keep commits atomic and descriptive

**Issue Reporting**:

- Check existing issues before creating new ones
- Include Chrome version and extension version
- Attach screenshots for UI issues
- Provide steps to reproduce bugs

## FAQ

**Q: Is my API key secure?**
A: Yes. Your Gemini API key is stored locally using Chrome's Storage API and never sent to any third-party servers. It's only used for direct API calls to Google's Gemini service.

**Q: Does this extension collect any data?**
A: No. TidyTabs operates entirely client-side. Tab metadata is processed locally and sent only to the Gemini API for grouping. No telemetry or analytics are collected.

**Q: Why do I need a Gemini API key?**
A: TidyTabs uses Google's Gemini AI to analyze and group tabs. You need your own API key to authenticate with Google's service. Free tier includes generous quotas for personal use.

**Q: Can I use this with other browsers?**
A: Currently only Chrome is supported (Manifest V3). Firefox support is planned for future releases.

**Q: Does organizing tabs close or delete any tabs?**
A: No. TidyTabs only creates tab groups and moves tabs between groups. It never closes or deletes tabs.

**Q: Can I customize how tabs are grouped?**
A: Yes. You can edit the AI prompt template in settings to influence grouping behavior. Variables like `{{TAB_DATA}}` and `{{DOMAINS}}` are available for advanced customization.

**Q: What happens if the AI fails to group tabs?**
A: Error notifications will appear explaining the issue (e.g., invalid API key, malformed response). No changes are applied if grouping fails.

## Acknowledgements

- Google Gemini API for AI-powered semantic analysis
- Chrome Extensions team for Manifest V3 documentation
- shadcn/ui for design inspiration

