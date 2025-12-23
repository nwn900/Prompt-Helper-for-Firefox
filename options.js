(async function () {
  if (typeof browser === "undefined") globalThis.browser = chrome;

  const ids = ["provider","mode","openaiKey","openaiModel","anthropicKey","anthropicModel","geminiKey","geminiModel","geminiMaxOutputTokens"];
  const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const status = document.getElementById("status");

  function setStatus(msg, ok=true) {
    status.textContent = msg;
    status.className = ok ? "muted ok" : "muted warn";
    setTimeout(() => { status.textContent = ""; status.className = "muted"; }, 1800);
  }

  async function load() {
    try {
      const s = await browser.runtime.sendMessage({ type: "GET_SETTINGS" });
      for (const id of ids) {
        if (!el[id]) continue;
        const v = s && (s[id] !== undefined && s[id] !== null) ? String(s[id]) : "";
        el[id].value = v;
      }
    } catch (e) {
      console.error("Options load failed:", e);
      setStatus("Could not load settings (see console).", false);
    }
  }

  async function save() {
    try {
      const patch = {};
      for (const id of ids) {
        if (!el[id]) continue;
        const val = (el[id].value ?? "").toString();

        // Don't overwrite default model names / token limits with an empty string.
        if ((id.endsWith("Model") || id === "geminiMaxOutputTokens") && val.trim() === "") continue;

        // Keys/provider/mode can be cleared intentionally.
        patch[id] = val;
      }
      await browser.runtime.sendMessage({ type: "SET_SETTINGS", patch });
      setStatus("Saved.");
    } catch (e) {
      console.error("Options save failed:", e);
      setStatus("Could not save (see console).", false);
    }
  }

  document.getElementById("save").addEventListener("click", save);
  await load();
})();
