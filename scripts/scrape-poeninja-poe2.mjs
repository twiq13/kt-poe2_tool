import fs from "fs";
import { chromium } from "playwright";

const LEAGUE = (process.env.LEAGUE || "vaal").toLowerCase();
const BASE = "https://poe.ninja";

const SECTIONS = [
  { id: "currency", slug: "currency" },
  { id: "fragments", slug: "fragments" },
  { id: "abyssalBones", slug: "abyssal-bones" },
  { id: "uncutGems", slug: "uncut-gems" },
  { id: "lineageGems", slug: "lineage-support-gems" },
  { id: "essences", slug: "essences" },
  { id: "soulCores", slug: "soul-cores" },
  { id: "idols", slug: "idols" },
  { id: "runes", slug: "runes" },
  { id: "omens", slug: "omens" },
  { id: "expedition", slug: "expedition" },
  { id: "liquidEmotions", slug: "liquid-emotions" },
  { id: "catalyst", slug: "breach-catalyst" },
];

function cleanName(name) {
  return String(name || "").replace(/\s*WIKI\s*$/i, "").trim();
}

function normalizeUrl(u) {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("/")) return BASE + u;
  return u;
}

function parseCompactNumber(s) {
  if (!s) return null;
  const t = s.toLowerCase().replace(/,/g, ".");
  const m = t.match(/^([\d.]+)(k|m)?$/);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[2] === "k") n *= 1_000;
  if (m[2] === "m") n *= 1_000_000;
  return Number.isFinite(n) ? n : null;
}

async function getValueColumnIndex(page) {
  return await page.evaluate(() => {
    const ths = [...document.querySelectorAll("table thead th")];
    return ths.findIndex(th => th.innerText.trim().toLowerCase() === "value");
  });
}

async function scrapeSection(page, section) {
  const url = `https://poe.ninja/poe2/economy/${LEAGUE}/${section.slug}`;
  console.log(`Scraping ${section.id}`);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("table tbody tr");

  const valueCol = await getValueColumnIndex(page);
  const rows = await page.$$("table tbody tr");

  const lines = [];

  for (const tr of rows) {
    const tds = await tr.$$("td");
    if (tds.length <= valueCol) continue;

    const name = cleanName(await tds[0].innerText());
    if (!name) continue;

    let icon = "";
    const img = await tds[0].$("img");
    if (img) icon = normalizeUrl(await img.getAttribute("src"));

    const valueText = await tds[valueCol].innerText();
    const token = valueText.split(" ").find(x => /^\d/.test(x));
    const chaosValue = parseCompactNumber(token);

    if (!chaosValue) continue;

    lines.push({
      section: section.id,
      name,
      icon,
      chaosValue
    });
  }

  return lines;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let allLines = [];

  for (const section of SECTIONS) {
    const lines = await scrapeSection(page, section);
    allLines.push(...lines);
  }

  await browser.close();

  // === FIND RATES ===
  const ex = allLines.find(x => x.name.toLowerCase() === "exalted orb");
  const div = allLines.find(x => x.name.toLowerCase() === "divine orb");

  if (!ex || !div) {
    console.error("Missing Exalted or Divine Orb");
    process.exit(1);
  }

  const chaosPerExalted = ex.chaosValue;
  const chaosPerDivine = div.chaosValue;

  // === CONVERT ===
  for (const l of allLines) {
    l.exaltedValue = l.chaosValue / chaosPerExalted;
  }

  const out = {
    updatedAt: new Date().toISOString(),
    league: LEAGUE,
    base: "Chaos Orb",
    chaosPerExalted,
    chaosPerDivine,
    lines: allLines
  };

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/prices.json", JSON.stringify(out, null, 2), "utf8");

  console.log(`DONE: ${allLines.length} items`);
  console.log(`1 Ex = ${chaosPerExalted} Chaos`);
  console.log(`1 Div = ${chaosPerDivine} Chaos`);
})();
