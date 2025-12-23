# Prompt Helper (Firefox clean-room port)

One-click prompt refinement for popular AI chat sites using **local templates** (no key needed) or **your own API key** (OpenAI / Anthropic / Gemini).

> Not affiliated with OpenAI, Anthropic, Google, Perplexity, xAI, or anyone else with a logo budget.

---

## What it does

When you focus the prompt box on a supported site, a floating **Improve** button appears. Click it to rewrite your current prompt into a clearer, more structured version (while keeping your intent).

- **Local mode (default):** uses built-in templates (no network calls).
- **API mode:** sends your prompt to the provider you choose and replaces the prompt box with the improved prompt.

It also keeps a small local history so you can copy past prompts back out if needed.

---

## Supported sites

The extension injects on:

- ChatGPT (`chat.openai.com`, `chatgpt.com`)
- Claude (`claude.ai`)
- Gemini (`gemini.google.com`) + AI Studio / MakerSuite variants
- Perplexity (`perplexity.ai`, `perplexity.com`)
- Grok / X / xAI (`grok.com`, `x.com`, `x.ai`)

---

## Install

### Option A: Temporary install (development)

1. Clone/download this repo.
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…**
4. Select `manifest.json`

This loads the extension until Firefox is closed.

### Option B: “Normal” install (persistent)

Firefox requires extensions to be **signed** for permanent install in normal builds.

- **Recommended:** package and submit to AMO (Mozilla Add-ons) for signing.
- **For personal testing:** Firefox Developer Edition / Nightly allow installing unsigned extensions (settings vary by build).

---

## Usage

### In-page button

1. Go to a supported site.
2. Click into the prompt box.
3. A floating **Improve** button appears near the prompt editor.
4. Click **Improve** to rewrite the current prompt (it replaces the prompt text).

**Modes:** the small pill next to the button shows the current mode (`auto`, `text`, `analysis`, `research`, `code`, `image`, `video`).

- **Shift + click** the Improve button to cycle modes.

### Keyboard shortcut

- Windows/Linux: **Ctrl + Shift + E**
- macOS: **Cmd + Shift + E**

This triggers “Improve” on the currently focused prompt editor.

### Toolbar popup

Click the extension icon to open the popup:

- Choose **Provider**: `Local`, `OpenAI`, `Anthropic`, `Gemini`
- Choose **Mode**
- View recent history and **Clear** it
- Open the **Options** page to configure keys/models

---

## Configuration

Open **Options** (from the popup):

- Provider: `Local` / `OpenAI` / `Anthropic` / `Gemini`
- Default mode: `auto` / `text` / `analysis` / `research` / `code` / `image` / `video`
- API keys + model names:
  - OpenAI: API key + model (default `gpt-4o-mini`)
  - Anthropic: API key + model (default `claude-3-5-sonnet-latest`)
  - Gemini: API key + model (default `gemini-2.5-flash`) + max output tokens

---

## Privacy & security

- Settings (including keys) are stored in **browser local storage**.
- Prompts are sent **only** to the provider you select (and only if you enable API mode).
- History is stored locally (up to the most recent ~30 entries).

Host permissions include the supported chat sites and the provider API endpoints required for API mode.

---

## How “Auto” mode works

Auto mode uses simple heuristics based on the prompt text (e.g., code-like characters, “citations”, “image prompt” cues) to pick a best-fit mode before rewriting.

---

## Development notes

- Manifest V3, Firefox minimum version: **109+**
- Background script handles:
  - provider calls (OpenAI / Anthropic / Gemini)
  - local template rewriting
  - command shortcut
  - history storage

---

## License

GNU GPL 3.0
