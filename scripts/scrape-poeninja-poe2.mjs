import fs from "fs";
import { chromium } from "playwright";

const LEAGUE = process.env.LEAGUE || "standard"; // "vaal" si tu veux
const URL = `https://poe.ninja/poe2/economy/${LEAGUE}/currency`;

function toNumber(s) {
  if (!s) return null;
  const m = String(s).replace(",", ".").match(/[0-9]+(\.[0-9]+)?/);
  return m ? Number(m[0]) : null;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  });

  console.log("Opening:", URL);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Attendre que le tableau soit réellement rendu
  // (les sélecteurs peuvent varier, donc on attend "table" + "tr")
  await page.waitForSelector("table", { timeout: 60000 });
  await page.waitForTimeout(3000);

  // Extraction DOM
  const lines = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("table tbody tr"));
    const out = [];

    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll("td"));
      if (tds.length < 2) continue;

      // Nom currency
      const name = (tds[0].innerText || "").trim();
      if (!name) continue;

      // On récupère le texte complet de la ligne et on cherche "Divine Orb" / "Exalted Orb"
      const rowText = (tr.innerText || "").replace(/\s+/g, " ").trim();

      out.push({ name, rowText });
    }
    return out;
  });

  await browser.close();

  if (!lines.length) {
    console.error("Aucune ligne trouvée dans le tableau (0 rows).");
    process.exit(1);
  }

  // Parse des prix depuis rowText
  const parsed = lines.map(x => {
    const lower = x.rowText.toLowerCase();

    const divine = lower.includes("divine")
      ? toNumber(x.rowText.match(/([0-9]+([.,][0-9]+)?)\s*Divine/i)?.[1])
      : null;

    const exalt = lower.includes("exalted")
      ? toNumber(x.rowText.match(/([0-9]+([.,][0-9]+)?)\s*Exalted/i)?.[1])
      : null;

    return {
      name: x.name,
      divinePrice: divine,
      exaltPrice: exalt,
    };
  }).filter(x => x.name && (x.divinePrice !== null || x.exaltPrice !== null));

  if (!parsed.length) {
    console.error("Lignes trouvées mais aucun prix parsé (format peut-être différent).");
    process.exit(1);
  }

  const out = {
    updatedAt: new Date().toISOString(),
    source: URL,
    league: LEAGUE,
    lines: parsed
  };

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/prices.json", JSON.stringify(out, null, 2), "utf8");

  console.log(`OK -> ${parsed.length} currencies écrites dans data/prices.json`);
})();
