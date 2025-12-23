(async function () {
  if (typeof browser === "undefined") globalThis.browser = chrome;

  const providerEl = document.getElementById("provider");
  const modeEl = document.getElementById("mode");
  const historyEl = document.getElementById("history");

  async function load() {
    const s = await browser.runtime.sendMessage({ type: "GET_SETTINGS" });
    providerEl.value = s.provider || "local";
    modeEl.value = s.mode || "auto";
    await renderHistory();
  }

  async function renderHistory() {
    const { history } = await browser.runtime.sendMessage({ type: "GET_HISTORY" });
    const items = Array.isArray(history) ? history.slice(0, 10) : [];
    historyEl.innerHTML = "";
    if (!items.length) {
      historyEl.innerHTML = `<div class="muted">No history yet.</div>`;
      return;
    }
    for (const h of items) {
      const d = new Date(h.ts || Date.now());
      const card = document.createElement("div");
      card.className = "card";
      const top = document.createElement("div");
      top.className = "top";
      top.innerHTML = `<div class="muted">${(h.site || "").slice(0, 40)} · ${h.mode} · ${h.provider}</div><div class="muted">${d.toLocaleString()}</div>`;
      const mono = document.createElement("div");
      mono.className = "mono";
      mono.textContent = h.improved || "";
      const row = document.createElement("div");
      row.className = "row";
      row.style.marginTop = "8px";
      row.style.justifyContent = "flex-end";
      const copyBtn = document.createElement("button");
      copyBtn.className = "smallbtn";
      copyBtn.textContent = "Copy";
      copyBtn.onclick = async () => {
        await navigator.clipboard.writeText(h.improved || "");
        copyBtn.textContent = "Copied";
        setTimeout(() => (copyBtn.textContent = "Copy"), 800);
      };
      row.appendChild(copyBtn);
      card.appendChild(top);
      card.appendChild(mono);
      card.appendChild(row);
      historyEl.appendChild(card);
    }
  }

  providerEl.addEventListener("change", async () => {
    await browser.runtime.sendMessage({ type: "SET_SETTINGS", patch: { provider: providerEl.value } });
  });

  modeEl.addEventListener("change", async () => {
    await browser.runtime.sendMessage({ type: "SET_SETTINGS", patch: { mode: modeEl.value } });
  });

  document.getElementById("openOptions").addEventListener("click", async () => {
    await browser.runtime.openOptionsPage();
    window.close();
  });

  document.getElementById("clearHistory").addEventListener("click", async () => {
    await browser.runtime.sendMessage({ type: "CLEAR_HISTORY" });
    await renderHistory();
  });

  await load();
})();
