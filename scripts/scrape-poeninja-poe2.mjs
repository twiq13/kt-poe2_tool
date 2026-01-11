// scripts/scrape-poeninja-poe2.mjs
import fs from "fs";
import { chromium } from "playwright";

const LEAGUE = (process.env.LEAGUE || "vaal").toLowerCase();
const BASE = "https://poe.ninja";

// Sections -> slug poe.ninja
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
  { id: "catalyst", label: "Catalyst", slug: "breach-catalyst" }
];

function normalizeUrl(u){
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("/")) return "https://poe.ninja" + u;
  return u;
}

function cleanName(s){
  return String(s || "").replace(/\s*WIKI\s*$/i, "").trim();
}

function parseCompactNumber(s){
  if (!s) return null;
  const t = String(s).trim().toLowerCase().replace(/,/g, ".");
  const m = t.match(/^([0-9]+(\.[0-9]+)?)(k|m)?$/i);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[3] === "k") n *= 1000;
  if (m[3] === "m") n *= 1000000;
  return Number.isFinite(n) ? n : null;
}

async function scrapeSection(page, section){
  const url = `${BASE}/poe2/economy/${LEAGUE}/${section.slug}?value=exalted`;
  console.log(`=== Section: ${section.label} -> ${url}`);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("table thead th", { timeout: 60000 });
  await page.waitForSelector("table tbody tr", { timeout: 60000 });
  await page.waitForTimeout(1200);

  // find "Value" column
  const valueColIndex = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll("table thead th"));
    return ths.findIndex(th => (th.innerText || "").trim().toLowerCase() === "value");
  });

  if (valueColIndex < 0) {
    console.log("!! Value column not found, skipping");
    return [];
  }

  // extract rows in one evaluate (fast)
  const rows = await page.evaluate((valueColIndex) => {
    const out = [];
    const trs = Array.from(document.querySelectorAll("table tbody tr"));
    for (const tr of trs) {
      const tds = Array.from(tr.querySelectorAll("td"));
      if (!tds.length || tds.length <= valueColIndex) continue;

      const nameTd = tds[0];
      const nameText = (nameTd.innerText || "").replace(/\s+/g, " ").trim();
      const img = nameTd.querySelector("img");
      const icon = img ? img.getAttribute("src") : "";

      const valueTd = tds[valueColIndex];
      const valueText = (valueTd.innerText || "").replace(/\s+/g, " ").trim();

      // valueText looks like: "2416.67" or "260k" etc (with icons nearby)
      const token = valueText.split(" ").find(x => /^[0-9]/.test(x)) || null;

      // unit icon = first img inside the value cell (exalted icon when value=exalted)
      const unitImg = valueTd.querySelector("img");
      const unitIcon = unitImg ? unitImg.getAttribute("src") : "";

      out.push({
        nameText,
        icon,
        token,
        unitIcon
      });
    }
    return out;
  }, valueColIndex);

  const out = [];
  for (const r of rows) {
    const name = cleanName(r.nameText);
    if (!name) continue;

    out.push({
      section: section.id,
      name,
      icon: normalizeUrl(r.icon),
      amount: parseCompactNumber(r.token) ?? 0,    // ✅ EXALTED value
      unit: "Exalted Orb",
      unitIcon: normalizeUrl(r.unitIcon),
    });
  }

  console.log(`Done: rows=${rows.length} kept=${out.length}`);
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  });

  let all = [];
  for (const sec of SECTIONS) {
    const lines = await scrapeSection(page, sec);
    all = all.concat(lines);
  }

  // base icon: from Exalted Orb line (best)
  const exLine = all.find(x => x.name.toLowerCase() === "exalted orb");
  const baseIcon = exLine?.icon || "";

  const out = {
    updatedAt: new Date().toISOString(),
    league: LEAGUE,
    source: `${BASE}/poe2/economy/${LEAGUE}`,
    base: "Exalted Orb",
    baseIcon,
    sections: SECTIONS.map(s => ({ id: s.id, label: s.label, slug: s.slug })),
    lines: all
  };

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/prices.json", JSON.stringify(out, null, 2), "utf8");

  console.log(`TOTAL lines=${all.length}`);
  const div = all.find(x => x.name.toLowerCase() === "divine orb");
  console.log(`Divine Orb exaltedValue(amount) = ${div?.amount ?? "?"}`);
  await browser.close();
})();
