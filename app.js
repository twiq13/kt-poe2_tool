// =======================
// PoE2 Farm Calculator
// =======================

let allItems = [];
let byName = new Map();
let activeSection = "currency";

let exaltIcon = "";
let divineIcon = "";
let divineExValue = null; // 1 Div = X Ex

let lastEditedCost = "ex";   // "ex" | "div"
let isSyncingCost = false;

let totalsUnit = "ex";       // "ex" | "div"

const SECTIONS = [
  { id:"currency", label:"Currency" },
  { id:"fragments", label:"Fragments" },
  { id:"abyssalBones", label:"Abyssal Bones" },
  { id:"uncutGems", label:"Uncut Gems" },
  { id:"lineageGems", label:"Lineage Gems" },
  { id:"essences", label:"Essences" },
  { id:"soulCores", label:"Soul Cores" },
  { id:"idols", label:"Idols" },
  { id:"runes", label:"Runes" },
  { id:"omens", label:"Omens" },
  { id:"expedition", label:"Expedition" },
  { id:"liquidEmotions", label:"Liquid Emotions" },
  { id:"catalyst", label:"Catalyst" },
];

function setStatus(msg){
  const el = document.getElementById("fetchStatus");
  if (el) el.textContent = msg;
  console.log(msg);
}

function cleanName(s){
  return String(s || "").replace(/\s*WIKI\s*$/i, "").trim();
}

function num(id){
  const el = document.getElementById(id);
  const v = el ? Number(el.value) : 0;
  return Number.isFinite(v) ? v : 0;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[m]));
}

// integer display everywhere
function fmtInt(n){
  const x = Number(n || 0);
  return String(Math.round(x));
}

function fmtDateTime(iso){
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const pad = (x)=> String(x).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// rule: market/loot display in Div if >= (1 Div + 1 Ex)
function shouldShowDiv(exAmount){
  if (!divineExValue || divineExValue <= 0) return false;
  return Number(exAmount || 0) >= (divineExValue + 1);
}

function setDualPriceDisplay(valueEl, iconEl, exAmount){
  const ex = Number(exAmount || 0);

  if (shouldShowDiv(ex) && divineIcon && divineExValue){
    valueEl.textContent = fmtInt(ex / divineExValue);
    if (iconEl) iconEl.src = divineIcon;
  } else {
    valueEl.textContent = fmtInt(ex);
    if (iconEl) iconEl.src = exaltIcon || "";
  }
}

// Totals: single currency with toggle
function formatTotalSingle(exVal){
  const ex = Number(exVal || 0);
  if (totalsUnit === "div" && divineExValue && divineExValue > 0){
    const div = ex / divineExValue;
    return `
      <span>${fmtInt(div)}</span>
      ${divineIcon ? `<img class="pIcon" src="${divineIcon}" alt="">` : ""}
    `;
  }
  return `
    <span>${fmtInt(ex)}</span>
    ${exaltIcon ? `<img class="pIcon" src="${exaltIcon}" alt="">` : ""}
  `;
}

async function loadData(){
  try{
    setStatus("Status: loading data/prices.json...");
    const res = await fetch("./data/prices.json?ts=" + Date.now(), { cache:"no-store" });
    const data = await res.json();

    allItems = (data.lines || []).map(x => ({
      section: x.section || "currency",
      name: cleanName(x.name),
      icon: x.icon || "",
      amount: Number(x.amount ?? 0), // in Ex
      unit: x.unit || "",
      unitIcon: x.unitIcon || "",
    }));

    byName = new Map(allItems.map(it => [it.name.toLowerCase(), it]));

    exaltIcon = data.baseIcon || "";
    const divRow = byName.get("divine orb");
    divineIcon = divRow?.icon || "";
    divineExValue = divRow ? Number(divRow.amount || 0) : null;

    const updatedAt = data.updatedAt || "";
    const updatedStr = updatedAt ? ` | last scrape=${fmtDateTime(updatedAt)}` : "";
    setStatus(`Status: OK ✅ sections=${SECTIONS.length} items=${allItems.length} | 1 Div=${fmtInt(divineExValue ?? 0)} Ex${updatedStr}`);

    buildTabs();
    fillDatalist();
    renderMarket();
    loadState();

    syncCostFields();

    if (!document.querySelector("#lootBody tr")) addLootRow();
    recalcAll();
  }catch(e){
    setStatus("Status: ERROR ❌ " + e.toString());
  }
}

function buildTabs(){
  const wrap = document.getElementById("tabs");
  if (!wrap) return;

  wrap.innerHTML = "";
  SECTIONS.forEach(sec => {
    const b = document.createElement("button");
    b.className = "tab" + (sec.id === activeSection ? " active" : "");
    b.textContent = sec.label;
    b.dataset.tab = sec.id;

    b.addEventListener("click", () => {
      activeSection = sec.id;
      document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.tab === activeSection));
      renderMarket();
      saveState();
    });

    wrap.appendChild(b);
  });
}

function fillDatalist(){
  const dl = document.getElementById("itemDatalist");
  if (!dl) return;
  dl.innerHTML = "";
  allItems.forEach(it => {
    const opt = document.createElement("option");
    opt.value = it.name;
    dl.appendChild(opt);
  });
}

function renderMarket(){
  const list = document.getElementById("marketList");
  if (!list) return;

  const q = (document.getElementById("marketSearch")?.value || "").trim().toLowerCase();

  const filtered = allItems
    .filter(it => it.section === activeSection)
    .filter(it => it.name.toLowerCase().includes(q))
    .slice(0, 300);

  list.innerHTML = "";

  if (!filtered.length){
    list.innerHTML = `<div style="color:#bbb;padding:10px;">No items.</div>`;
    return;
  }

  filtered.forEach(it => {
    const row = document.createElement("div");
    row.className = "market-row";

    row.innerHTML = `
      <div class="mLeft">
        ${it.icon ? `<img class="cIcon" src="${it.icon}" alt="">` : ""}
        <span class="mName">${escapeHtml(it.name)}</span>
      </div>

      <div class="mArrow">⇄</div>

      <div class="mRight">
        <span class="mPriceVal">0</span>
        <img class="unitIcon" alt="">
      </div>
    `;

    const valEl = row.querySelector(".mPriceVal");
    const icoEl = row.querySelector(".unitIcon");
    setDualPriceDisplay(valEl, icoEl, it.amount);

    row.addEventListener("click", () => addLootRow(it.name));
    list.appendChild(row);
  });
}

function addLootRow(prefillName = ""){
  if (prefillName && typeof prefillName === "object") prefillName = "";
  prefillName = String(prefillName || "");

  const body = document.getElementById("lootBody");
  if (!body) return;

  const tr = document.createElement("tr");
  tr.className = "lootRow";

  tr.innerHTML = `
    <td>
      <div class="lootItemWrap">
        <img class="lootIcon" alt="">
        <input class="lootItem" list="itemDatalist" placeholder="Item">
      </div>
    </td>

    <td>
      <div class="priceCell">
        <span class="lootPrice" data-ex="0">0</span>
        <img class="baseIcon" alt="">
      </div>
    </td>

    <td>
      <div class="qtyWrap">
        <button type="button" class="qtyBtn qtyMinus" aria-label="Minus">−</button>
        <input class="lootQty" type="number" value="0" min="0">
        <button type="button" class="qtyBtn qtyPlus" aria-label="Plus">+</button>
      </div>
    </td>

    <td><button type="button" class="deleteBtn" title="Delete">✖</button></td>
  `;

  body.appendChild(tr);

  const itemInput = tr.querySelector(".lootItem");
  const qtyInput  = tr.querySelector(".lootQty");
  const iconImg   = tr.querySelector(".lootIcon");
  const priceSpan = tr.querySelector(".lootPrice");
  const unitImg   = tr.querySelector(".baseIcon");

  itemInput.value = prefillName;

  function applyPrice(){
    const name = (itemInput.value || "").trim().toLowerCase();
    const found = byName.get(name);

    if (found?.icon){
      iconImg.src = found.icon;
      iconImg.style.display = "block";
    } else {
      iconImg.style.display = "none";
    }

    const ex = Number(found ? found.amount : 0);
    priceSpan.dataset.ex = String(ex);

    setDualPriceDisplay(priceSpan, unitImg, ex);
  }

  applyPrice();
  recalcAll();
  saveState();

  itemInput.addEventListener("input", () => {
    applyPrice();
    recalcAll();
    saveState();
  });

  qtyInput.addEventListener("input", () => {
    recalcAll();
    saveState();
  });

  tr.querySelector(".qtyMinus").addEventListener("click", () => {
    qtyInput.value = Math.max(0, (Number(qtyInput.value) || 0) - 1);
    recalcAll();
    saveState();
  });

  tr.querySelector(".qtyPlus").addEventListener("click", () => {
    qtyInput.value = (Number(qtyInput.value) || 0) + 1;
    recalcAll();
    saveState();
  });

  tr.querySelector(".deleteBtn").addEventListener("click", () => {
    tr.remove();
    recalcAll();
    saveState();
  });
}

function addManualRow(){
  const body = document.getElementById("lootBody");
  if (!body) return;

  const tr = document.createElement("tr");
  tr.className = "lootRow manualRow";

  tr.innerHTML = `
    <td>
      <div class="lootItemWrap">
        <img class="lootIcon" style="display:none" alt="">
        <input class="lootItem" placeholder="Custom item">
      </div>
    </td>

    <td>
      <div class="priceCell">
        <input class="manualPrice" type="number" value="0" min="0" step="0.01">
        ${exaltIcon ? `<img class="baseIcon" src="${exaltIcon}" alt="">` : `<img class="baseIcon" alt="">`}
      </div>
    </td>

    <td>
      <div class="qtyWrap">
        <button type="button" class="qtyBtn qtyMinus">−</button>
        <input class="lootQty" type="number" value="0" min="0">
        <button type="button" class="qtyBtn qtyPlus">+</button>
      </div>
    </td>

    <td><button type="button" class="deleteBtn" title="Delete">✖</button></td>
  `;

  body.appendChild(tr);

  const qtyInput = tr.querySelector(".lootQty");
  const priceInput = tr.querySelector(".manualPrice");
  const update = () => { recalcAll(); saveState(); };

  qtyInput.addEventListener("input", update);
  priceInput.addEventListener("input", update);

  tr.querySelector(".qtyMinus").addEventListener("click", () => {
    qtyInput.value = Math.max(0, (Number(qtyInput.value) || 0) - 1);
    update();
  });

  tr.querySelector(".qtyPlus").addEventListener("click", () => {
    qtyInput.value = (Number(qtyInput.value) || 0) + 1;
    update();
  });

  tr.querySelector(".deleteBtn").addEventListener("click", () => {
    tr.remove();
    update();
  });

  update();
}

function syncCostFields(){
  const exEl = document.getElementById("costPerMap");
  const divEl = document.getElementById("costPerMapDiv");
  if (!exEl || !divEl) return;
  if (!divineExValue || divineExValue <= 0) return;

  isSyncingCost = true;
  if (lastEditedCost === "div"){
    const div = Number(divEl.value || 0);
    exEl.value = String(div * divineExValue);
  } else {
    const ex = Number(exEl.value || 0);
    divEl.value = String(ex / divineExValue);
  }
  isSyncingCost = false;
}

function calcInvestEx(){
  const maps = num("maps");
  const exEl = document.getElementById("costPerMap");
  const divEl = document.getElementById("costPerMapDiv");

  const exCost = exEl ? Number(exEl.value || 0) : 0;
  const divCost = divEl ? Number(divEl.value || 0) : 0;

  let costEx = exCost;
  if (lastEditedCost === "div" && divineExValue && divineExValue > 0){
    costEx = divCost * divineExValue;
  }
  return maps * (Number(costEx) || 0);
}

function calcLootEx(){
  let total = 0;
  document.querySelectorAll("#lootBody tr").forEach(tr => {
    const qty = Number(tr.querySelector(".lootQty")?.value || 0);

    if (tr.classList.contains("manualRow")){
      const p = Number(tr.querySelector(".manualPrice")?.value || 0);
      total += p * qty;
    } else {
      const ex = Number(tr.querySelector(".lootPrice")?.dataset?.ex || 0);
      total += ex * qty;
    }
  });
  return total;
}

function recalcAll(){
  const invest = calcInvestEx();
  const loot = calcLootEx();
  const gain = loot - invest;

  document.getElementById("totalInvest").innerHTML = formatTotalSingle(invest);
  document.getElementById("totalLoot").innerHTML = formatTotalSingle(loot);
  document.getElementById("gain").innerHTML = formatTotalSingle(gain);
}

function exportLootCSV(){
  const lines = [];
  lines.push("Item,Price,Devise,Qty,Total price exalt/divine");

  const investEx = calcInvestEx();
  const lootEx = calcLootEx();
  const gainEx = lootEx - investEx;

  const toBoth = (ex) => {
    const exInt = fmtInt(ex);
    const divInt = (divineExValue && divineExValue > 0) ? fmtInt(ex / divineExValue) : "0";
    return `${exInt} Ex / ${divInt} Div`;
  };

  document.querySelectorAll("#lootBody tr").forEach(tr => {
    const item = (tr.querySelector(".lootItem")?.value || "").trim();
    const qty = Number(tr.querySelector(".lootQty")?.value || 0);

    let priceEx = 0;
    let devise = "Ex";

    if (tr.classList.contains("manualRow")){
      priceEx = Number(tr.querySelector(".manualPrice")?.value || 0);
      devise = "Ex";
    } else {
      priceEx = Number(tr.querySelector(".lootPrice")?.dataset?.ex || 0);
      devise = shouldShowDiv(priceEx) ? "Div" : "Ex";
    }

    if (!item && qty === 0 && priceEx === 0) return;

    const displayPrice = (devise === "Div" && divineExValue) ? fmtInt(priceEx / divineExValue) : fmtInt(priceEx);
    const totalEx = priceEx * qty;

    const esc = (s) => {
      const str = String(s ?? "");
      return /[",\n"]/.test(str) ? `"${str.replace(/"/g,'""')}"` : str;
    };

    lines.push([
      esc(item),
      displayPrice,
      devise,
      fmtInt(qty),
      esc(toBoth(totalEx))
    ].join(","));
  });

  lines.push("");
  lines.push("Invest,Loot,Gains");
  lines.push([toBoth(investEx), toBoth(lootEx), toBoth(gainEx)].join(","));

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `poe2_loot_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function saveState(){
  const rows = [...document.querySelectorAll("#lootBody tr")].map(tr => {
    const manual = tr.classList.contains("manualRow");
    return {
      manual,
      item: tr.querySelector(".lootItem")?.value || "",
      qty: tr.querySelector(".lootQty")?.value ?? "0",
      price: manual ? (tr.querySelector(".manualPrice")?.value ?? "0") : null
    };
  });

  const state = {
    activeSection,
    search: document.getElementById("marketSearch")?.value ?? "",
    maps: document.getElementById("maps")?.value ?? "10",
    costPerMap: document.getElementById("costPerMap")?.value ?? "0",
    costPerMapDiv: document.getElementById("costPerMapDiv")?.value ?? "0",
    lastEditedCost,
    totalsUnit,
    rows
  };

  localStorage.setItem("poe2FarmState", JSON.stringify(state));
}

function loadState(){
  const raw = localStorage.getItem("poe2FarmState");
  if (!raw) return;

  try{
    const s = JSON.parse(raw);

    if (s.activeSection) activeSection = s.activeSection;
    if (document.getElementById("marketSearch")) document.getElementById("marketSearch").value = s.search ?? "";

    if (document.getElementById("maps")) document.getElementById("maps").value = s.maps ?? "10";
    if (document.getElementById("costPerMap")) document.getElementById("costPerMap").value = s.costPerMap ?? "0";
    if (document.getElementById("costPerMapDiv")) document.getElementById("costPerMapDiv").value = s.costPerMapDiv ?? "0";
    if (s.lastEditedCost) lastEditedCost = s.lastEditedCost;
    if (s.totalsUnit) totalsUnit = s.totalsUnit;

    const btn = document.getElementById("displayUnitBtn");
    if (btn) btn.textContent = (totalsUnit === "ex") ? "Show Div" : "Show Ex";

    renderMarket();

    const body = document.getElementById("lootBody");
    body.innerHTML = "";

    if (Array.isArray(s.rows) && s.rows.length){
      s.rows.forEach(r => {
        if (r.manual){
          addManualRow();
          const last = body.lastElementChild;
          last.querySelector(".lootItem").value = r.item || "";
          last.querySelector(".lootQty").value = r.qty ?? "0";
          last.querySelector(".manualPrice").value = r.price ?? "0";
        } else {
          addLootRow(r.item || "");
          const last = body.lastElementChild;
          last.querySelector(".lootQty").value = r.qty ?? "0";
        }
      });
    }
  }catch{}
}

function resetAll(){
  localStorage.removeItem("poe2FarmState");
  document.getElementById("maps").value = "10";
  document.getElementById("costPerMap").value = "0";
  document.getElementById("costPerMapDiv").value = "0";
  lastEditedCost = "ex";

  totalsUnit = "ex";
  const btn = document.getElementById("displayUnitBtn");
  if (btn) btn.textContent = "Show Div";

  document.getElementById("lootBody").innerHTML = "";
  addLootRow();

  activeSection = "currency";
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.tab === activeSection));
  document.getElementById("marketSearch").value = "";
  renderMarket();

  recalcAll();
  setStatus("Status: reset ✅");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("marketSearch")?.addEventListener("input", () => { renderMarket(); saveState(); });

  document.getElementById("maps")?.addEventListener("input", () => { recalcAll(); saveState(); });

  document.getElementById("costPerMap")?.addEventListener("input", () => {
    if (isSyncingCost) return;
    lastEditedCost = "ex";
    syncCostFields();
    recalcAll();
    saveState();
  });

  document.getElementById("costPerMapDiv")?.addEventListener("input", () => {
    if (isSyncingCost) return;
    lastEditedCost = "div";
    syncCostFields();
    recalcAll();
    saveState();
  });

  document.getElementById("displayUnitBtn")?.addEventListener("click", () => {
    totalsUnit = (totalsUnit === "ex") ? "div" : "ex";
    const btn = document.getElementById("displayUnitBtn");
    if (btn) btn.textContent = (totalsUnit === "ex") ? "Show Div" : "Show Ex";
    recalcAll();
    saveState();
  });

  document.getElementById("resetBtn")?.addEventListener("click", resetAll);

  document.getElementById("exportCsvBtn")?.addEventListener("click", exportLootCSV);

  loadData();
});

// expose
window.addLootRow = addLootRow;
window.addManualRow = addManualRow;
window.resetAll = resetAll;
