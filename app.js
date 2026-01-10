
// =======================
// CHARGEMENT POE NINJA
// =======================
let currencies = [];

async function loadCurrencies() {
  const box = document.getElementById("fetchStatus");
  const league = (document.getElementById("leagueInput")?.value || "standard").trim();

  // Endpoint PoE2 (correct)
  const endpoint =
    `https://poe.ninja/poe2/api/data/currencyoverview?league=${encodeURIComponent(league)}&type=Currency`;

  // 3 proxys publics (fallback)
  const urls = [
    "https://corsproxy.io/?" + encodeURIComponent(endpoint),
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(endpoint),
    "https://thingproxy.freeboard.io/fetch/" + endpoint
  ];

  const write = (msg) => {
    if (box) box.textContent = msg;
    console.log(msg);
  };

  write("Fetch status: requête... league=" + league);

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      write(`Fetch status: proxy ${i + 1}/${urls.length}...`);

      const res = await fetch(url, { cache: "no-store" });

      // Lire en texte d'abord (évite le crash JSON)
      const text = await res.text();

      // Si vide → on tente un autre proxy
      if (!text || text.trim().length < 5) {
        write(`Fetch status: proxy ${i + 1} réponse vide, essai suivant...`);
        continue;
      }

      // Parfois le proxy renvoie du HTML (anti-bot)
      if (text.trim().startsWith("<")) {
        write(`Fetch status: proxy ${i + 1} a renvoyé du HTML (bloqué), essai suivant...`);
        continue;
      }

      const data = JSON.parse(text);

      currencies = data.lines || [];

      write(`Fetch status: OK ✅ league=${league} currencies=${currencies.length} (proxy ${i + 1})`);

      renderCurrencyPanel();
      fillDatalist();
      return;

    } catch (e) {
      write(`Fetch status: proxy ${i + 1} ERREUR (${e.toString()}), essai suivant...`);
    }
  }

  write("Fetch status: ERREUR ❌ Tous les proxys ont échoué (réessaye dans 30s).");
}



// =======================
// AFFICHAGE COLONNE GAUCHE
// =======================
function renderCurrencyPanel() {
  const panel = document.getElementById("currencyList");
  panel.innerHTML = "";
  if (!currencies.length) {
  panel.innerHTML = "<p style='color:#aaa'>Aucune donnée (ligue ou proxy)</p>";
  return;
}


  currencies.forEach(c => {
    const div = document.createElement("div");
    div.className = "currency-item";
    div.innerHTML = `
      <img src="${c.icon}">
      <span>${c.currencyTypeName}</span>
      <small>${c.exaltedValue.toFixed(2)} ex</small>
    `;
    panel.appendChild(div);
  });
}

// =======================
// DATALIST (RECHERCHE)
// =======================
function fillDatalist() {
  const dl = document.getElementById("currencyDatalist");
  dl.innerHTML = "";

  currencies.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.currencyTypeName;
    dl.appendChild(opt);
  });
}

// =======================
// AJOUT LIGNE LOOT
// =======================
function addLootLine() {
  const tr = document.createElement("tr");

  tr.innerHTML = `
    <td>
      <input list="currencyDatalist" placeholder="Item" onchange="updatePrice(this)">
    </td>
    <td class="price">0</td>
    <td><input type="number" value="0"></td>
  `;

  document.getElementById("lootBody").appendChild(tr);
}

// =======================
// LIGNE MANUELLE
// =======================
function addManualLine() {
  const tr = document.createElement("tr");

  tr.innerHTML = `
    <td><input placeholder="Nom libre"></td>
    <td><input type="number" value="0"></td>
    <td><input type="number" value="0"></td>
  `;

  document.getElementById("lootBody").appendChild(tr);
}

// =======================
// MISE À JOUR PRIX
// =======================
function updatePrice(input) {
  const name = input.value.toLowerCase();
  const row = input.closest("tr");
  const priceCell = row.querySelector(".price");

  const found = currencies.find(c =>
    c.currencyTypeName.toLowerCase() === name
  );

  priceCell.textContent = found ? found.exaltedValue.toFixed(2) : "0";

  calculerLoot();
}


// =======================
// INIT
// =======================
loadCurrencies();
addLootLine();

function calculerLoot() {
  let total = 1;

  document.querySelectorAll("#lootBody tr").forEach(row => {
    const price = Number(row.querySelector(".price")?.textContent) || 0;
    const qty = Number(row.querySelector("input[type='number']")?.value) || 0;
    total += price * qty;
  });

  document.getElementById("totalLoot").textContent = total.toFixed(2);
}

async function testFetch() {
  const box = document.getElementById("fetchStatus");
  try {
    box.textContent = "Fetch status: requête en cours...";

    const url = "https://corsproxy.io/?https://poe.ninja/api/data/currencyoverview?league=Vaal&type=Currency";
    const res = await fetch(url);

    box.textContent = "Fetch status: HTTP " + res.status + " (lecture json...)";

    const data = await res.json();
    box.textContent = "Fetch status: OK ✅  currencies=" + (data.lines?.length ?? 0);
    console.log("DATA KEYS:", Object.keys(data));
    console.log("DATA SAMPLE:", data);


  } catch (e) {
    box.textContent = "Fetch status: ERREUR ❌\n" + e.toString();
  }
}

testFetch();

