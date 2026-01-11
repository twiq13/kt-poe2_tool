// scripts/scrape-poeninja-poe2.mjs
import fs from "fs";
import { chromium } from "playwright";

const LEAGUE = (process.env.LEAGUE || "vaal").toLowerCase();
const BASE = "https://poe.ninja";

// All sections you want (id = your app tab id, slug = poe.ninja URL slug)
const SECTIONS = [
  { id: "currency", label: "Currency", slug: "currency" },
  { id: "fragments", label: "Fragments", slug: "fragments" },
  { id: "abyssalBones", label: "Abyssal Bones", slug: "abyssal-bones" },
  { id: "uncutGems", label: "Uncut Gems", slug: "uncut-gems" },
  { id: "lineageGems", label: "Lineage Gems", slug: "lineage-support-gems" },
  { id: "essences", label: "Essences", slug: "essences" },
  { id: "soulCores", label: "Soul Cores", slug: "soul-cores" },
  { id: "idols", label: "Idols", slug: "idols" },
  { id: "runes", label: "Runes", slug: "runes" },
  { id: "omens", label: "Omens", slug: "omens" },
  { id: "expedition", label: "Expedition", slug: "expedition" },
  { id: "liquidEmotions", label: "Liquid Emotions", slug: "liquid-emotions" },
  { id: "catalyst", label: "Catalyst", slug: "breach-catalyst" },
];

// --- helpers ---
function normalizeUrl(u) {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("/")) return BASE + u;
  return u;
}

function cleanName(name) {
  return String(name || "").replace(/\s*WIKI\s*$/i, "").trim();
}

// "3.2k" "2416.67" "86k" "1.0" -> number
function parseCompactNumber(s) {
  if (!s) return null;
  const t = String(s).trim().toLowerCase().replace(/,/g, ".");
  const m = t.match(/^([0-9]+(\.[0-9]+)?)(k|m)?$/i);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[3] === "k") n *= 1000;
  if (m[3] === "m") n *= 1000000;
  return Number.isFinite(n) ? n : null;
}

// extract the first numeric token from a text chunk
function firstNumberToken(txt) {
  if (!txt) return null;
  const cleaned = String(txt).replace(/\s+/g, " ").trim();
  // match numbers like 2416.67 or 3.2k or 86k
  const m = cleaned.match(/([0-9]+(?:[.,][0-9]+)?(?:k|m)?)/i);
  return m ? m[1] : null;
}

async function scrapeSection(page, section) {
  const url = `${BASE}/poe2/economy/${LEAGUE}/${section.slug}?value=exalted`;
  console.log(`=== Section: ${section.label} -> ${url}`);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

  await page.waitForSelector("table thead th", { timeout: 90000 });
  await page.waitForSelector("table tbody tr", { timeout: 90000 });

  // Small pause for client-rendered table stabilization
  await page.waitForTimeout(1200);

  const data = await page.evaluate(() => {
    const norm = (u) => {
      if (!u) return "";
      if (u.startsWith("http://") || u.startsWith("https://")) return u;
      if (u.startsWith("//")) return "https:" + u;
      if (u.startsWith("/")) return "https://poe.ninja" + u;
      return u;
    };

    const ths = Array.from(document.querySelectorAll("table thead th"));
    const valueIdx = ths.findIndex(th => (th.textContent || "").trim().toLowerCase() === "value");
    const rows = Array.from(document.querySelectorAll("table tbody tr"));

    const out = [];
    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll("td"));
      if (!tds.length || valueIdx < 0 || !tds[valueIdx]) continue;

      const nameRaw = (tds[0].textContent || "").replace(/\s+/g, " ").trim();
      const name = nameRaw.replace(/\s*WIKI\s*$/i, "").trim();
      if (!name) continue;

      const itemImg = tds[0].querySelector("img");
      const icon = itemImg ? norm(itemImg.getAttribute("src") || "") : "";

      const valueCell = tds[valueIdx];

      // In ?value=exalted, value cell should contain ONE value (exalted)
      // We grab first numeric token from textContent.
      const txt = (valueCell.textContent || "").replace(/\s+/g, " ").trim();
      const m = txt.match(/([0-9]+(?:[.,][0-9]+)?(?:k|m)?)/i);
      const token = m ? m[1] : null;

      // unit icon = first icon found in value cell (usually exalted icon)
      const unitImg = valueCell.querySelector("img");
      const unitIcon = unitImg ? norm(unitImg.getAttribute("src") || "") : "";

      out.push({ name, icon, token, unitIcon });
    }

    return { valueIdx, rowsCount: rows.length, out };
  });

  // Convert tokens into numbers
  const lines = data.out.map(x => {
    const numToken = firstNumberToken(x.token);
    const exaltedValue = parseCompactNumber(numToken);
    return {
      section: section.id,
      name: cleanName(x.name),
      icon: normalizeUrl(x.icon),
      exaltedValue: exaltedValue ?? null,
      unit: "Exalted Orb",
      unitIcon: normalizeUrl(x.unitIcon),
    };
  });

  const kept = lines.filter(l => l.exaltedValue !== null).length;
  console.log(`Done: rows=${data.rowsCount} kept=${kept}`);

  return { url, lines };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  });

  let all = [];
  let sources = {};

  for (const section of SECTIONS) {
    const { url, lines } = await scrapeSection(page, section);
    sources[section.id] = url;
    all = all.concat(lines);
  }

  await browser.close();

  // Find Divine Orb rate in Exalted (this is your key reference for UI conversions)
  const divine = all.find(x => x.section === "currency" && x.name.toLowerCase() === "divine orb");
  const divineInEx = divine?.exaltedValue ?? null;

  // Find Exalted Orb icon as baseIcon (prefer currency exalted orb row icon)
  const exRow = all.find(x => x.section === "currency" && x.name.toLowerCase() === "exalted orb");
  const baseIcon = exRow?.icon || all.find(x => x.unitIcon)?.unitIcon || "";

  const out = {
    updatedAt: new Date().toISOString(),
    league: LEAGUE,
    base: "Exalted Orb",
    baseIcon,
    divineInEx,            // ✅ 1 Divine = X Exalted (from value=exalted table)
    sections: SECTIONS.map(s => ({ id: s.id, label: s.label, slug: s.slug, url: sources[s.id] })),
    lines: all,
  };

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/prices.json", JSON.stringify(out, null, 2), "utf8");

  console.log(`TOTAL sections=${SECTIONS.length} lines=${all.length}`);
  console.log(`DivineInEx = ${divineInEx}`);
})();
