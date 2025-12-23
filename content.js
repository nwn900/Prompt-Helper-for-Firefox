(function () {
  if (typeof browser === "undefined") globalThis.browser = chrome;

  const STATE = {
    mode: "auto",
    lastTarget: null,
    button: null,
    badge: null,
    busy: false,
    raf: 0,
    hasShownOnce: false
  };

  const SELECTOR = [
    "textarea",
    "input[type='text']",
    "input[type='search']",
    "[contenteditable]",
    "div[role='textbox']"
  ].join(",");

  const HOST = location.hostname || "";
  const PATH = location.pathname || "";
  const IS_GROK = HOST === "grok.com" || HOST.endsWith(".grok.com") || (HOST === "x.ai" && PATH.startsWith("/grok")) || HOST.endsWith(".x.ai");

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const onX = r.right > 0 && r.left < window.innerWidth;
    const onY = r.bottom > 0 && r.top < window.innerHeight;
    return onX && onY;
  }

  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return !el.disabled && !el.readOnly;
    if (tag === "INPUT") {
      const t = (el.type || "").toLowerCase();
      return (t === "text" || t === "search") && !el.disabled && !el.readOnly;
    }
    if (el.isContentEditable) return true;
    if ((el.getAttribute("role") || "") === "textbox") return true;
    return false;
  }

  function scoreCandidate(el) {
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    const bottomBias = Math.max(0, 1 - Math.abs(window.innerHeight - r.bottom) / window.innerHeight);
    const widthBias = Math.min(1, r.width / window.innerWidth);
    return area * (1 + 1.5 * bottomBias + 0.5 * widthBias);
  }

  function bestCandidateInRoot(root) {
    if (!root || !root.querySelectorAll) return null;
    const els = Array.from(root.querySelectorAll(SELECTOR))
      .filter(isEditable)
      .filter(isVisible);

    if (!els.length) return null;
    els.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    return els[0];
  }

  function bestCandidate() {
    return bestCandidateInRoot(document);
  }

  function bestCandidateDeep() {
    // Deep-search open shadow roots (common on Grok/X UI stacks).
    // Closed shadow DOM can't be accessed, but this catches a lot of cases.
    const seen = new Set();
    const queue = [document];
    let best = null;
    let bestScore = -1;

    // Limit traversal to keep it sane.
    let expansions = 0;
    const MAX_EXPANSIONS = 250;

    while (queue.length && expansions < MAX_EXPANSIONS) {
      const root = queue.shift();
      expansions++;

      const cand = bestCandidateInRoot(root);
      if (cand) {
        const s = scoreCandidate(cand);
        if (s > bestScore) { best = cand; bestScore = s; }
      }

      // Expand open shadow roots
      const scope = (root === document) ? document.querySelectorAll("*") : root.querySelectorAll("*");
      for (const el of scope) {
        if (seen.has(el)) continue;
        seen.add(el);
        try {
          if (el.shadowRoot) queue.push(el.shadowRoot);
        } catch (_) {}
      }
    }
    return best;
  }

  function getActiveEditable() {
    const ae = document.activeElement;

    // If focus is on a shadow host, try inside its open shadow root.
    try {
      if (ae && ae.shadowRoot) {
        const inner = bestCandidateInRoot(ae.shadowRoot);
        if (inner) return inner;
      }
    } catch (_) {}

    if (isEditable(ae) && isVisible(ae)) return ae;

    // Grok sometimes keeps the "real" textbox hidden behind wrappers.
    const cand = IS_GROK ? bestCandidateDeep() : bestCandidate();
    return cand;
  }

  function readValue(el) {
    if (!el) return "";
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return el.value || "";
    return el.innerText || el.textContent || "";
  }

  function setNativeValue(el, value) {
    const tag = el.tagName;
    const proto = tag === "TEXTAREA" ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
    const desc = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
    const setter = desc && desc.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }

  function selectAllContents(el) {
    try {
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        el.setSelectionRange(0, (el.value || "").length);
        return true;
      }
    } catch (_) {}

    try {
      const sel = window.getSelection && window.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.addRange(range);
      return true;
    } catch (_) {
      return false;
    }
  }

  function tryExecCommandReplaceText(el, text) {
    const before = (readValue(el) || "");
    try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (_) {} }

    selectAllContents(el);
    try { document.execCommand("selectAll", false, null); } catch (_) {}

    let ok = false;
    try { ok = document.execCommand("insertText", false, text); } catch (_) { ok = false; }

    const after = (readValue(el) || "");
    if (ok) return true;
    if (after.trim() !== before.trim()) return true;
    return false;
  }

  function writeValue(el, text) {
    if (!el) return false;

    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") {
      setNativeValue(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (tryExecCommandReplaceText(el, text)) return true;

    try {
      el.innerText = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    } catch (_) {
      try {
        el.textContent = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  function nextMode(m) {
    const order = ["auto", "text", "analysis", "research", "code", "image", "video"];
    const i = order.indexOf(m);
    return order[(i + 1) % order.length];
  }

  function ensureUI() {
    if (STATE.button) return;

    const btn = document.createElement("button");
    btn.textContent = "Improve";
    btn.setAttribute("type", "button");
    btn.tabIndex = -1;
    btn.style.position = "fixed";
    btn.style.zIndex = 2147483647;
    btn.style.left = "16px";
    btn.style.top = "16px";
    btn.style.padding = "10px 12px";
    btn.style.borderRadius = "10px";
    btn.style.border = "1px solid rgba(0,0,0,0.15)";
    btn.style.background = "white";
    btn.style.color = "black";
    btn.style.font = "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 6px 18px rgba(0,0,0,0.12)";
    btn.style.display = "none";
    btn.className = "phfx-improve-button";

    // Don't steal focus from editors
    btn.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    }, true);

    const badge = document.createElement("span");
    badge.textContent = "auto";
    badge.style.marginLeft = "8px";
    badge.style.padding = "2px 6px";
    badge.style.borderRadius = "999px";
    badge.style.border = "1px solid rgba(0,0,0,0.15)";
    badge.style.fontSize = "11px";
    badge.style.opacity = "0.75";
    btn.appendChild(badge);

    btn.addEventListener("click", async (ev) => {
      if (ev.shiftKey) {
        STATE.mode = nextMode(STATE.mode);
        badge.textContent = STATE.mode;
        try { await browser.runtime.sendMessage({ type: "SET_SETTINGS", patch: { mode: STATE.mode } }); } catch (_) {}
        return;
      }
      await improveActive();
    });

    document.documentElement.appendChild(btn);
    STATE.button = btn;
    STATE.badge = badge;
  }

  async function syncModeFromSettings() {
    try {
      const s = await browser.runtime.sendMessage({ type: "GET_SETTINGS" });
      STATE.mode = s?.mode || "auto";
      if (STATE.badge) STATE.badge.textContent = STATE.mode;
    } catch (_) {}
  }

  function detectComplexity() {
    return !!document.querySelector("[id*='cplx'],[class*='cplx'],[data-cplx],[data-complexity],[class*='complexity']");
  }

  function positionNear(el) {
    if (!STATE.button) return;
    const btn = STATE.button;

    // If we don't have a target (common on Grok if it's in closed shadow), park it bottom-right.
    if (!el) {
      btn.style.left = `${Math.max(12, window.innerWidth - btn.offsetWidth - 12)}px`;
      btn.style.top = `${Math.max(12, window.innerHeight - btn.offsetHeight - 12)}px`;
      return;
    }

    const r = el.getBoundingClientRect();
    let x = Math.max(12, Math.min(window.innerWidth - btn.offsetWidth - 12, r.right - btn.offsetWidth));
    let y = Math.max(12, Math.min(window.innerHeight - btn.offsetHeight - 12, r.top - btn.offsetHeight - 8));
    if (y <= 12) y = Math.max(12, Math.min(window.innerHeight - btn.offsetHeight - 12, r.bottom + 8));

    if ((location.hostname.includes("perplexity")) && detectComplexity()) y = Math.max(12, y - 56);

    btn.style.left = `${x}px`;
    btn.style.top = `${y}px`;
  }

  function cancelPositionLoop() {
    if (STATE.raf) cancelAnimationFrame(STATE.raf);
    STATE.raf = 0;
  }

  function positionLoop() {
    cancelPositionLoop();
    const tick = () => {
      const el = STATE.lastTarget || getActiveEditable();
      if (STATE.button?.style.display === "block") positionNear(el);
      STATE.raf = requestAnimationFrame(tick);
    };
    STATE.raf = requestAnimationFrame(tick);
  }

  function showButton(show) {
    ensureUI();
    STATE.button.style.display = show ? "block" : "none";
    if (show) positionLoop();
    else cancelPositionLoop();
  }

  function updateTargetFromEvent(ev) {
    // Use composedPath to catch nodes inside shadow DOM (when available).
    const path = (ev && typeof ev.composedPath === "function") ? ev.composedPath() : [];
    for (const node of path) {
      if (node && node.nodeType === 1 && isEditable(node) && isVisible(node)) {
        STATE.lastTarget = node;
        showButton(true);
        return;
      }
      if (node && node.nodeType === 1 && node.closest) {
        const candidate = node.closest(SELECTOR);
        if (isEditable(candidate) && isVisible(candidate)) {
          STATE.lastTarget = candidate;
          showButton(true);
          return;
        }
      }
    }

    const el = getActiveEditable();
    if (el) {
      STATE.lastTarget = el;
      showButton(true);
      return;
    }

    // Grok: still show the button even if we can't see the editor.
    if (IS_GROK) showButton(true);
  }

  async function improveActive() {
    if (STATE.busy) return;

    const el = STATE.lastTarget || getActiveEditable();
    if (!el) {
      // Still allow a visible button on Grok; just no-op if editor is inaccessible.
      console.warn("Prompt Helper: No editable target found. Focus the prompt box first.");
      return;
    }

    const prompt = (readValue(el) || "").trim();
    if (!prompt) return;

    STATE.busy = true;
    const prevText = STATE.button.firstChild.textContent;
    STATE.button.firstChild.textContent = "Improving…";
    STATE.button.style.opacity = "0.7";
    STATE.button.style.pointerEvents = "none";

    try {
      const improved = await browser.runtime.sendMessage({ type: "ENHANCE_PROMPT", prompt, mode: STATE.mode });
      if (typeof improved === "string" && improved.trim()) {
        try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (_) {} }
        writeValue(el, improved.trim());
      }
    } catch (e) {
      console.error("Prompt Helper improve error:", e);
      STATE.button.firstChild.textContent = "Failed (see console)";
      setTimeout(() => { STATE.button.firstChild.textContent = prevText || "Improve"; }, 1200);
    } finally {
      STATE.busy = false;
      STATE.button.style.opacity = "1";
      STATE.button.style.pointerEvents = "auto";
      STATE.button.firstChild.textContent = "Improve";
    }
  }

  document.addEventListener("focusin", updateTargetFromEvent, true);
  document.addEventListener("pointerdown", updateTargetFromEvent, true);
  document.addEventListener("click", updateTargetFromEvent, true);

  document.addEventListener("focusout", () => {
    setTimeout(() => {
      if (IS_GROK) { showButton(true); return; }
      if (!getActiveEditable()) showButton(false);
    }, 220);
  }, true);

  browser.runtime.onMessage.addListener((msg) => { if (msg?.type === "IMPROVE_ACTIVE") improveActive(); });

  // Poll: for Grok, show button even if the editor is hard to detect.
  setInterval(() => {
    const el = getActiveEditable();
    if (el) {
      STATE.lastTarget = el;
      showButton(true);
      STATE.hasShownOnce = true;
    } else if (IS_GROK && !STATE.hasShownOnce) {
      showButton(true);
      STATE.hasShownOnce = true;
    }
  }, 900);

  ensureUI();
  syncModeFromSettings();

  // Grok: show early (some pages don't generate focus events until late).
  if (IS_GROK) setTimeout(() => showButton(true), 800);
})();
