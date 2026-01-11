/* ===========================
   PoE2 Farm Calculator - SIMPLE STABLE CORE
   - No "innerHTML of null"
   - Tabs working
   - Market list + loot + totals
   =========================== */

let data = null;
let items = [];
let itemMap = new Map();
let activeTab = "currency";

// ---------- DOM helpers ----------
function $(id) { return document.getElementById(id); }

function setStatus(msg) {
  const el = $("fetchStatus");
  if (el) el.textContent = msg;
  console.log(msg);
}

// Safe setters: never crash, never overwrite OK status repeatedly
function safeSetText(id, txt) {
  const el = $(id);
  if (!el) {
    console.warn(`Missing element id="${id}"`);
    return false;
  }
  el.textContent = txt;
  return true;
}

function safeSetHTML(id, html) {
  const el = $(id);
  if (!el) {
    console.warn(`Missing element id="${id}"`);
    return false;
  }
  el.innerHTML = html;
  return true;
}

function num(id) {
  const el = $(id);
  const v = el ? Number(el.value) : 0;
  return Number.isFinite(v) ? v : 0;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[m]));
}

// ---------- required DOM check ----------
function assertDom() {
  const required = [
    "fetchStatus",
    "maps", "costPerMap",
    "totalInvest", "totalLoot", "gain",
    "currencySearch", "currencyList",
    "lootBody",
    "currencyDatalist",
    "resetBtn"
  ];
  const missing = required.filter(id => !$(id));
  if (missing.length) {
    setStatus(`Status: ERROR ❌ Missing IDs: ${missing.join(", ")}`);
    return false;
  }
  return true;
}

// ---------- load prices.json ----------
async function loadPrices() {
  try {
    setStatus("Status: loading data/prices.json...");

    const res = await fetch("./data/prices.json?ts=" + Date.now(), { cache: "no-store" });
    data = await res.json();

    items = Array.isArray(data?.lines) ? data.lines : [];
    itemMap = new Map(items.map(x => [String(x.name || "").toLowerCase(), x]));

    const secCount = Array.isArray(data?.sections) ? data.sections.length : "?";
    setStatus(`Status: OK ✅ sections=${secCount} items=${items.length}`);
  } catch (e) {
    setStatus("Status: ERROR ❌ " + e.toString());
    items = [];
    itemMap = new Map();
  }
}

// ---------- tabs ----------
function bindTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTab = btn.dataset.tab || "currency";
      renderMarketList();
    });
  });
}

// ---------- datalist ----------
function fillDatalist() {
  const dl = $("currencyDatalist");
  if (!dl) return;
  dl.innerHTML = "";
  items.forEach(x => {
    const opt = document.createElement("option");
    opt.value = x.name || "";
    dl.appendChild(opt);
  });
}

// ---------- market list ----------
function renderMarketList() {
  const panel = $("currencyList");
  if (!panel) return;

  const q = ($("currencySearch")?.value || "").trim().toLowerCase();
  panel.innerHTML = "";

  if (!items.length) {
    panel.innerHTML = `<div style="color:#bbb;padding:10px;">No items.</div>`;
    return;
  }

  const filtered = items
    .filter(x => String(x.section || "currency") === activeTab)
    .filter(x => String(x.name || "").toLowerCase().includes(q))
    .slice(0, 400);

  if (!filtered.length) {
    panel.innerHTML = `<div style="color:#bbb;padding:10px;">No items.</div>`;
    return;
  }

  filtered.forEach(x => {
    const row = document.createElement("div");
    row.className = "currency-item";

    const val = Number(x.exaltedValue ?? x.amount ?? 0);
    const valTxt = Number.isFinite(val) ? val.toFixed(2) : "0.00";

    row.innerHTML = `
      <div class="cLeft">
        ${x.icon ? `<img class="cIcon" src="${x.icon}" alt="">` : ""}
        <span>${escapeHtml(x.name || "")}</span>
      </div>
      <small>${valTxt}</small>
    `;

    row.addEventListener("click", () => addLootLineWithName(x.name));
    panel.appendChild(row);
  });
}

// ---------- loot ----------
function addLootLine() {
  const body = $("lootBody");
  if (!body) return null;

  const tr = document.createElement("tr");
  tr.className = "lootRow";

  tr.innerHTML = `
    <td>
      <div class="lootItemWrap">
        <img class="lootIcon" alt="">
        <input class="lootItem" list="currencyDatalist" placeholder="Item">
      </div>
    </td>
    <td>
      <div class="priceCell">
        <span class="lootPrice">0.00</span>
      </div>
    </td>
    <td><input class="lootQty" type="number" value="0" min="0"></td>
    <td><button type="button" class="deleteBtn" title="Delete">✖</button></td>
  `;

  body.appendChild(tr);

  const itemInput = tr.querySelector(".lootItem");
  const qtyInput  = tr.querySelector(".lootQty");

  itemInput.addEventListener("input", () => {
    updateLootRow(tr);
    recalcTotals();
  });

  qtyInput.addEventListener("input", recalcTotals);

  tr.querySelector(".deleteBtn").addEventListener("click", () => {
    tr.remove();
    recalcTotals();
  });

  return tr;
}

function addLootLineWithName(name) {
  const tr = addLootLine();
  if (!tr) return;
  tr.querySelector(".lootItem").value = name || "";
  updateLootRow(tr);
  recalcTotals();
}

function addManualLine() {
  const body = $("lootBody");
  if (!body) return;

  const tr = document.createElement("tr");
  tr.className = "lootRow manualRow";

  tr.innerHTML = `
    <td><input class="lootItem" placeholder="Custom name"></td>
    <td><input class="manualPrice" type="number" value="0" min="0" step="0.01"></td>
    <td><input class="lootQty" type="number" value="0" min="0"></td>
    <td><button type="button" class="deleteBtn" title="Delete">✖</button></td>
  `;

  body.appendChild(tr);

  tr.querySelector(".manualPrice").addEventListener("input", recalcTotals);
  tr.querySelector(".lootQty").addEventListener("input", recalcTotals);

  tr.querySelector(".deleteBtn").addEventListener("click", () => {
    tr.remove();
    recalcTotals();
  });
}

function updateLootRow(tr) {
  if (!tr || tr.classList.contains("manualRow")) return;

  const name = (tr.querySelector(".lootItem")?.value || "").trim().toLowerCase();
  const found = itemMap.get(name);

  const iconEl = tr.querySelector(".lootIcon");
  const priceEl = tr.querySelector(".lootPrice");

  if (found?.icon) {
    iconEl.src = found.icon;
    iconEl.style.display = "block";
  } else {
    iconEl.style.display = "none";
  }

  const ex = Number(found?.exaltedValue ?? 0);
  priceEl.textContent = Number.isFinite(ex) ? ex.toFixed(2) : "0.00";
}

// ---------- totals ----------
function calcInvest() {
  return num("maps") * num("costPerMap");
}

function calcLoot() {
  let total = 0;
  document.querySelectorAll("#lootBody tr").forEach(tr => {
    const qty = Number(tr.querySelector(".lootQty")?.value || 0);

    if (tr.classList.contains("manualRow")) {
      const p = Number(tr.querySelector(".manualPrice")?.value || 0);
      total += p * qty;
    } else {
      const p = Number(tr.querySelector(".lootPrice")?.textContent || 0);
      total += p * qty;
    }
  });
  return total;
}

function recalcTotals() {
  const invest = calcInvest();
  const loot = calcLoot();
  const gain = loot - invest;

  safeSetText("totalInvest", invest.toFixed(2));
  safeSetText("totalLoot", loot.toFixed(2));
  safeSetText("gain", gain.toFixed(2));
}

// ---------- reset ----------
function resetAll() {
  if ($("maps")) $("maps").value = "10";
  if ($("costPerMap")) $("costPerMap").value = "0";
  if ($("lootBody")) $("lootBody").innerHTML = "";

  addLootLine();
  recalcTotals();

  setStatus("Status: reset ✅");
}

// ✅ expose globals NOW (for HTML onclick)
window.addLootLine = addLootLine;
window.addManualLine = addManualLine;
window.resetAll = resetAll;

// ---------- init ----------
document.addEventListener("DOMContentLoaded", async () => {
  if (!assertDom()) return;

  $("currencySearch").addEventListener("input", renderMarketList);
  $("maps").addEventListener("input", recalcTotals);
  $("costPerMap").addEventListener("input", recalcTotals);
  $("resetBtn").addEventListener("click", resetAll);

  bindTabs();

  await loadPrices();
  fillDatalist();
  renderMarketList();

  addLootLine();
  recalcTotals();
});
