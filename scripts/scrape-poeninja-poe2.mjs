// scripts/scrape-poeninja-poe2.mjs
import fs from "fs";
import { chromium } from "playwright";

const LEAGUE = process.env.LEAGUE || "standard";
const URL = `https://poe.ninja/poe2/economy/${LEAGUE}/currency`;
const BASE = "https://poe.ninja";

function cleanName(name) {
  return String(name || "").replace(/\s*WIKI\s*$/i, "").trim();
}

function parseCompactNumber(s) {
  if (!s) return null;
  const t = String(s).trim().toLowerCase().replace(/,/g, ".");
  const m = t.match(/^([0-9]+(\.[0-9]+)?)(k)?$/i);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[3]) n *= 1000;
  return Number.isFinite(n) ? n : null;
}

function normalizeUrl(u) {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("/")) return BASE + u;
  return u;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  });

  console.log("Opening:", URL);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  await page.waitForSelector("table thead th", { timeout: 60000 });
  await page.waitForSelector("table tbody tr", { timeout: 60000 });

  // Laisse le temps au lazy-load de remplir les images
  await page.waitForTimeout(4000);

  // index colonne Value
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

  const rows = await page.evaluate((valueIdx) => {
    function bestImgUrl(img) {
      if (!img) return "";

      // Le plus fiable
      let u = img.currentSrc || img.src || img.getAttribute("src") || "";

      // Next/Image ou lazy
      if (!u || u === "about:blank") {
        u = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || "";
      }

      // srcset: prend le 1er url
      if ((!u || u === "about:blank") && img.getAttribute("srcset")) {
        const ss = img.getAttribute("srcset").split(",")[0]?.trim();
        u = ss ? ss.split(" ")[0] : "";
      }

      return u || "";
    }

    const trs = Array.from(document.querySelectorAll("table tbody tr"));
    return trs.slice(0, 500).map(tr => {
      const tds = Array.from(tr.querySelectorAll("td"));
      if (tds.length <= valueIdx) return null;

      const name = (tds[0]?.innerText || "").replace(/\s+/g, " ").trim();

      // colonne 0: souvent plusieurs images (logo + WIKI)
      const imgs0 = Array.from(tds[0].querySelectorAll("img"));
      // on prend le premier "vrai" logo (souvent le 1er)
      const icon = bestImgUrl(imgs0[0]) || bestImgUrl(imgs0[1]) || "";

      const valueTd = tds[valueIdx];
      const valueText = (valueTd?.innerText || "").replace(/\s+/g, " ").trim();

      // Value column: on prend la dernière image (souvent l'unité)
      const imgsV = Array.from(valueTd.querySelectorAll("img"));
      const unitImg = imgsV.length ? imgsV[imgsV.length - 1] : null;
      const unitIcon = bestImgUrl(unitImg);

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
      icon: normalizeUrl(r.icon || ""),
      unitIcon: normalizeUrl(r.unitIcon || "")
    };
  }).filter(x => x.name && x.amount !== null);

  // Debug rapide : voir si on récupère des icônes
  const withIcons = lines.filter(x => x.icon || x.unitIcon).length;
  console.log(`Icons found: ${withIcons}/${lines.length}`);

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
