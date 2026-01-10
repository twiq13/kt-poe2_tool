// scripts/scrape-poeninja-poe2.mjs
import fs from "fs";
import { chromium } from "playwright";

const LEAGUE = process.env.LEAGUE || "standard";
const URL = `https://poe.ninja/poe2/economy/${LEAGUE}/currency`;

function cleanName(name) {
  return String(name || "").replace(/\s*WIKI\s*$/i, "").trim();
}

// "2.5k" => 2500, "800" => 800, "1.2" => 1.2
function parseCompactNumber(s) {
  if (!s) return null;
  const t = String(s).trim().toLowerCase().replace(/,/g, ".");
  const m = t.match(/^([0-9]+(\.[0-9]+)?)(k)?$/i);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[3]) n *= 1000;
  return Number.isFinite(n) ? n : null;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  });

  console.log("Opening:", URL);

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Attendre que le tableau SPA se charge
  await page.waitForSelector("table thead th", { timeout: 60000 });
  await page.waitForSelector("table tbody tr", { timeout: 60000 });
  await page.waitForTimeout(2500);

  // Trouver l'index de la colonne "Value"
  const valueColIndex = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll("table thead th"));
    return ths.findIndex(th => (th.innerText || "").trim().toLowerCase() === "value");
  });

  console.log("Value column index =", valueColIndex);

  if (valueColIndex < 0) {
    console.error('Impossible de trouver la colonne "Value".');
    await browser.close();
    process.exit(1);
  }

  // Extraire name + icon (col 0) + valueText + unitIcon + unitAlt
  const rows = await page.evaluate((valueIdx) => {
    const trs = Array.from(document.querySelectorAll("table tbody tr"));

    return trs.slice(0, 500).map(tr => {
      const tds = Array.from(tr.querySelectorAll("td"));
      if (tds.length <= valueIdx) return null;

      const name = (tds[0]?.innerText || "").replace(/\s+/g, " ").trim();

      const itemImg = tds[0]?.querySelector("img");
      const icon = itemImg?.getAttribute("src") || itemImg?.src || "";

      const valueTd = tds[valueIdx];
      const valueText = (valueTd?.innerText || "").replace(/\s+/g, " ").trim();

      const unitImg = valueTd?.querySelector("img");
      const unitIcon = unitImg?.getAttribute("src") || unitImg?.src || "";

      const unitAlt =
        unitImg?.getAttribute("alt") ||
        unitImg?.getAttribute("title") ||
        "";

      return { name, icon, valueText, unitIcon, unitAlt };
    }).filter(Boolean);
  }, valueColIndex);

  await browser.close();

  if (!rows.length) {
    console.error("Aucune ligne trouvée dans le tableau.");
    process.exit(1);
  }

  const lines = rows.map(r => {
    const token = r.valueText.split(" ").find(x => /^[0-9]/.test(x)) || null;
    const amount = parseCompactNumber(token);

    return {
      name: cleanName(r.name),
      amount,
      unit: cleanName(r.unitAlt || ""),
      icon: r.icon || "",
      unitIcon: r.unitIcon || ""
    };
  }).filter(x => x.name && x.amount !== null);

  if (!lines.length) {
    console.error("Lignes trouvées mais aucun amount parsé.");
    console.error("Exemple row:", rows[0]);
    process.exit(1);
  }

  const out = {
    updatedAt: new Date().toISOString(),
    league: LEAGUE,
    source: URL,
    lines
  };

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/prices.json", JSON.stringify(out, null, 2), "utf8");

  console.log(`OK -> ${lines.length} currencies écrites dans data/prices.json`);
})();
