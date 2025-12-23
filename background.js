(function () {
  if (typeof browser === "undefined") globalThis.browser = chrome;

  const DEFAULTS = {
    provider: "local", // local | openai | anthropic | gemini
    mode: "auto",      // auto | text | analysis | research | code | image | video
    openaiKey: "",
    openaiModel: "gpt-4o-mini",
    anthropicKey: "",
    anthropicModel: "claude-3-5-sonnet-latest",
    geminiKey: "",
    geminiModel: "gemini-2.5-flash",
    geminiMaxOutputTokens: 2048,
    history: []
  };

  async function getSettings() {
    const stored = await browser.storage.local.get(null);
    const merged = { ...DEFAULTS, ...stored };

    // Protect defaults from empty strings (common after upgrades).
    for (const k of ["openaiModel", "anthropicModel", "geminiModel", "provider", "mode"]) {
      if (typeof merged[k] !== "string" || merged[k].trim() === "") merged[k] = DEFAULTS[k];
    }
    const mot = Number(merged.geminiMaxOutputTokens);
    merged.geminiMaxOutputTokens = Number.isFinite(mot) && mot > 0 ? mot : DEFAULTS.geminiMaxOutputTokens;

    if (!Array.isArray(merged.history)) merged.history = [];
    return merged;
  }

  async function setSettings(patch) {
    patch = patch || {};

    // Normalize geminiMaxOutputTokens to a number when provided.
    if (patch.geminiMaxOutputTokens !== undefined) {
      const n = Number(patch.geminiMaxOutputTokens);
      if (Number.isFinite(n) && n > 0) patch.geminiMaxOutputTokens = n;
      else delete patch.geminiMaxOutputTokens;
    }

    // Don't let blank model fields wipe defaults.
    for (const k of ["openaiModel", "anthropicModel", "geminiModel"]) {
      if (k in patch && (typeof patch[k] !== "string" || patch[k].trim() === "")) delete patch[k];
    }

    await browser.storage.local.set(patch);
    return true;
  }

  function clampHistory(history, max = 30) {
    if (!Array.isArray(history)) return [];
    return history.slice(0, max);
  }

  function detectMode(prompt) {
    const p = (prompt || "").trim();
    if (!p) return "text";

    const researchCues = /\b(cite|citation|sources?|references?|bibliography|paper|study|studies|peer[-\s]?reviewed|arxiv|doi|link|url|latest|as of|timeline|compare|meta[-\s]?analysis|systematic review|evidence)\b/i;
    if (researchCues.test(p)) return "research";

    const codeSignals = ["```", "function ", "class ", "import ", "from ", "#include", "SELECT ", "console.log", "def ", "{", "=>", "npm ", "pip ", "cargo "];
    const codeHits = codeSignals.reduce((n, s) => n + (p.includes(s) ? 1 : 0), 0);
    const nonTextRatio = (p.match(/[{}[\];=<>]/g) || []).length / Math.max(1, p.length);
    if (codeHits >= 2 || nonTextRatio > 0.02) return "code";

    const analysisCues = /\b(analy(s|z)e|root cause|diagnos(e|is)|trade[-\s]?offs?|pros and cons|evaluate|critique|why|reasoning|strategy|plan|framework|hypotheses?)\b/i;
    if (analysisCues.test(p)) return "analysis";

    const imgCues = /\b(image|photo|illustration|render|lighting|lens|negative prompt|stable diffusion|midjourney|dall[-\s]?e)\b/i;
    const vidCues = /\b(video|shot|scene|storyboard|camera move|tracking shot|b-roll|cinematic|fps|duration|aspect ratio)\b/i;
    if (vidCues.test(p)) return "video";
    if (imgCues.test(p)) return "image";

    return "text";
  }

  function localEnhance(prompt, mode) {
    const m = mode === "auto" ? detectMode(prompt) : mode;
    const p = (prompt || "").trim();

    // Produce a strong, editable foundation without questions.
    // Use reasonable defaults and label them as assumptions the user can tweak.
    const base = [
      "You are an expert assistant.",
      "Preserve my intent. Do not invent facts.",
      "Do NOT ask clarifying questions. If something is missing, choose sensible defaults and label them as assumptions.",
      "Follow the requested output format strictly."
    ].join("\n");

    const templates = {
      text: `${base}

TASK:
${p}

ASSUMPTIONS / DEFAULTS (edit freely):
- Audience: general
- Tone: neutral, direct
- Length: concise but complete
- Output medium: markdown

CONSTRAINTS:
- Must include: [key points]
- Must avoid: [irrelevant tangents, unsafe or non-actionable advice]
- Success criteria: [what a good answer includes]

OUTPUT FORMAT (strict):
1) Summary
2) Main answer / steps
3) Edge cases / caveats
4) Next actions (optional)

QUALITY CHECK:
- Verify constraints + success criteria are met.
`,
      analysis: `${base}

TASK:
${p}

ASSUMPTIONS / DEFAULTS (edit as needed):
- Objective: decide / explain / diagnose / compare
- Constraints: time/budget/risk tolerance unspecified (use balanced defaults)

OUTPUT FORMAT (strict):
1) Problem restatement
2) Assumptions
3) Options (2–4) with tradeoffs
4) Recommendation (with rationale)
5) Risks + mitigations
6) What to validate next (data/experiments)
`,
      research: `${base}

RESEARCH QUESTION:
${p}

SCOPE (defaults, edit as needed):
- Timeframe: last 12–24 months + key older background
- Geography: global unless specified
- Evidence bar: prioritize primary/official; use peer-reviewed when possible

METHOD:
- Start with primary/official sources (docs, standards, statements, filings, datasets).
- Use reputable secondary analysis for context.
- Cross-check key claims across ≥2 independent sources.
- Clearly label uncertainty and disagreements between sources.

OUTPUT FORMAT (strict):
1) Executive summary
2) Key findings (each with citations/links)
3) Details by theme (with citations/links)
4) Limitations / uncertainty
5) Sources (links)
`,
      code: `${base}

TASK:
${p}

ASSUMPTIONS / DEFAULTS (edit as needed):
- Language/runtime: choose the most likely or industry-standard option if unspecified
- Environment: cross-platform unless specified
- Style: clean, readable, safe-by-default

DELIVERABLES (strict):
1) Brief plan
2) Final code
3) Tests (>=3) + how to run
4) Edge cases + error handling
5) Security notes (if applicable)
`,
      image: `${base}

GOAL (image generation):
${p}

ASSUMPTIONS / DEFAULTS (edit as needed):
- Style: photoreal unless specified
- Aspect ratio: 1:1
- Quality: high detail

PROMPT (be specific):
- Subject + action:
- Setting/background:
- Composition (framing, angle, distance):
- Lighting (type, direction, mood):
- Camera (lens/angle) if photoreal:
- Color palette:
- Materials/textures (optional):
- Text (if any, exact wording):

NEGATIVE PROMPT:
- artifacts, watermark, unreadable text, extra limbs, blur, low-res, distortions

PARAMS (optional):
- aspect ratio, resolution, seed, style strength
`,
      video: `${base}

GOAL (video generation):
${p}

ASSUMPTIONS / DEFAULTS (edit as needed):
- Duration: 8–15s
- Aspect ratio: 16:9
- FPS: 24
- Style: cinematic

OUTPUT FORMAT (strict):
1) Technical specs
2) Shot list (scene-by-scene) with camera moves
3) Lighting + mood + palette
4) Transitions + pacing
5) Notes/constraints
`
    };

    return templates[m] || templates.text;
  }

  function buildEnhancerSystem(mode) {
    const common = [
      "You are a prompt-rewriting assistant.",
      "Rewrite the user's prompt to be clearer, more specific, and more likely to produce correct results.",
      "Preserve intent; do not add made-up facts.",
      "Do NOT ask clarifying questions. Choose sensible defaults and label them as assumptions inside the rewritten prompt.",
      "Use clear headings and delimiters to separate instructions from any provided data.",
      "Add useful constraints: success criteria, formatting, edge cases, and 'what to avoid' when applicable.",
      "Return ONLY the improved prompt (no commentary)."
    ];

    const hints = {
      text: "Include an Assumptions/Defaults section plus a strict output format.",
      analysis: "Include assumptions, options + tradeoffs, risks/mitigations, and a crisp recommendation structure.",
      research: "Include scope defaults, evidence standards, citations/links requirements, and how to handle uncertainty/conflicting sources.",
      code: "Include runtime/environment, I/O specs, constraints, tests, edge cases, and security considerations.",
      image: "Include subject/action, composition, style, lighting, camera, palette/mood; include negative prompts and optional parameters.",
      video: "Include duration/aspect/fps, shot list with camera moves, pacing/transitions, deliverables."
    };

    return common.concat([hints[mode] || hints.text, "Add a short Quality check verifying constraints and listing assumptions."]).join(" ");
  }

  async function enhanceWithOpenAI(settings, prompt, mode) {
    const key = settings.openaiKey;
    if (!key) throw new Error("Missing OpenAI API key.");
    const m = mode === "auto" ? detectMode(prompt) : mode;

    const body = {
      model: settings.openaiModel || DEFAULTS.openaiModel,
      messages: [
        { role: "system", content: buildEnhancerSystem(m) },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`OpenAI API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content;
    if (!out) throw new Error("OpenAI returned no content.");
    return out.trim();
  }

  async function enhanceWithAnthropic(settings, prompt, mode) {
    const key = settings.anthropicKey;
    if (!key) throw new Error("Missing Anthropic API key.");
    const m = mode === "auto" ? detectMode(prompt) : mode;

    const body = {
      model: settings.anthropicModel || DEFAULTS.anthropicModel,
      max_tokens: 800,
      temperature: 0.2,
      system: buildEnhancerSystem(m),
      messages: [{ role: "user", content: prompt }]
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Anthropic API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const out = data?.content?.[0]?.text;
    if (!out) throw new Error("Anthropic returned no content.");
    return out.trim();
  }

  async function enhanceWithGemini(settings, prompt, mode) {
    const key = settings.geminiKey;
    if (!key) throw new Error("Missing Gemini API key.");
    const m = mode === "auto" ? detectMode(prompt) : mode;

    const model = settings.geminiModel || DEFAULTS.geminiModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

    const body = {
      contents: [{ role: "user", parts: [{ text: `${buildEnhancerSystem(m)}\n\nUSER PROMPT:\n${prompt}` }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: Number(settings.geminiMaxOutputTokens || DEFAULTS.geminiMaxOutputTokens)
      }
    };

    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const cand = data?.candidates?.[0];
    const out = cand?.content?.parts?.[0]?.text;
    const finishReason = cand?.finishReason;
    if (!out) throw new Error("Gemini returned no content.");
    if (finishReason && finishReason !== "STOP") console.warn("Gemini finishReason:", finishReason);
    return out.trim();
  }

  async function enhancePrompt({ prompt, mode = "auto", site = "" }) {
    const settings = await getSettings();
    const m = mode || settings.mode || "auto";
    const provider = settings.provider || "local";

    let improved = "";
    if (provider === "openai") improved = await enhanceWithOpenAI(settings, prompt, m);
    else if (provider === "anthropic") improved = await enhanceWithAnthropic(settings, prompt, m);
    else if (provider === "gemini") improved = await enhanceWithGemini(settings, prompt, m);
    else improved = localEnhance(prompt, m);

    const entry = {
      ts: Date.now(),
      site,
      mode: m === "auto" ? detectMode(prompt) : m,
      original: (prompt || "").slice(0, 4000),
      improved: (improved || "").slice(0, 6000),
      provider
    };

    const history = clampHistory([entry].concat(settings.history || []), 30);
    await browser.storage.local.set({ history });
    return improved;
  }

  async function sendToActiveTab(message) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try { await browser.tabs.sendMessage(tab.id, message); } catch (_) {}
  }

  browser.commands.onCommand.addListener(async (command) => {
    if (command === "improve_prompt") await sendToActiveTab({ type: "IMPROVE_ACTIVE" });
  });

  browser.runtime.onMessage.addListener((msg, sender) => {
    const type = msg?.type;
    if (type === "GET_SETTINGS") return getSettings();
    if (type === "SET_SETTINGS") return setSettings(msg.patch || {});
    if (type === "ENHANCE_PROMPT") {
      const site = sender?.tab?.url ? (new URL(sender.tab.url)).hostname : "";
      return enhancePrompt({ prompt: msg.prompt || "", mode: msg.mode || "auto", site });
    }
    if (type === "GET_HISTORY") return getSettings().then(s => ({ history: s.history || [] }));
    if (type === "CLEAR_HISTORY") return browser.storage.local.set({ history: [] }).then(() => true);
    return false;
  });
})();
