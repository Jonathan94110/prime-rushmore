#!/usr/bin/env node
// Playwright smoke test of P/dist (run `python3 build.py` first).
//
// Serves dist/ with `python3 -m http.server`, opens it in Chromium and:
//   Quick start -> plays two weeks through the game center (skip to final) -> checks each final
//   score equals the stored result -> reloads and checks the save is restored -> checks for
//   console errors, failed requests and outside hosts -> checks no horizontal scroll at 400px
//   -> saves light and dark screenshots to tests/screens/.
//
// The artifact host wraps the page in its own <!doctype html><head>…<body> skeleton, so this test
// does the same for index.html (otherwise the page would render in quirks mode).
// Uses the global Playwright install (`npm root -g`) and browsers in /opt/pw-browsers.

import { spawn, execSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const P = path.resolve(HERE, "..");
const DIST = path.join(P, "dist");
const SCREENS = path.join(HERE, "screens");
const SAVE_KEY = "ffp-proto-save-v1";
const ALLOWED_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

// Expected pool limits come from the engine and the shipped data, not from hard-coded numbers.
function expectedPools() {
  const req = createRequire(import.meta.url);
  const FFP = req(path.join(P, "src", "engine.js"));
  const read = (f) => JSON.parse(fs.readFileSync(path.join(DIST, "data", f), "utf8"));
  const games = {};
  for (const pos of ["QB", "RB", "WR", "TE", "K", "DEF"]) games[pos] = read(`games_${pos.toLowerCase()}.json`);
  const db = FFP.loadData({ players: read("players.json"), games });
  const H = { historical: { includeInterceptions: false } };
  // Seasons a Strict quarterback can draw from, to check the mode card's coverage line against.
  const qbSeasons = new Set();
  for (const p of db.players) if (p.pos === "QB") for (const g of FFP.eligibleGames(db, p.id, "strict", H)) qbSeasons.add(g.season);
  const ss = [...qbSeasons].sort((a, b) => a - b);
  const qbSpan = ss.length === 1 ? `${ss[0]} games only` : `${ss[0]}–${ss[ss.length - 1]}`;
  return { strict: FFP.poolSummary(db, "strict", H), historical: FFP.poolSummary(db, "historical", H), qbSpan };
}

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync("/opt/pw-browsers")) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/pw-browsers";
}

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try { return req("playwright"); } catch { /* fall through to the global install */ }
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return req(path.join(root, "playwright"));
}

const SKELETON_HEAD =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
  "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}" +
  "body{margin:0;font:14px system-ui,sans-serif;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style>" +
  "</head><body>";
const SKELETON_TAIL = "</body></html>";

// ---------------------------------------------------------------- reporting

const results = [];
const problems = [];
const outside = new Set();
function pass(name, detail) { results.push({ ok: true, name }); console.log("PASS  " + name + (detail ? "  (" + detail + ")" : "")); }
function failCheck(name, detail) { results.push({ ok: false, name }); console.log("FAIL  " + name + (detail ? "  -- " + detail : "")); }
function check(cond, name, detail) { (cond ? pass : failCheck)(name, detail); return cond; }

// ---------------------------------------------------------------- server

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

async function startServer() {
  const port = await freePort();
  const proc = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", DIST], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  proc.stderr.on("data", (d) => { stderr += d; });
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + "index.html");
      if (r.ok) return { proc, base };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error("http.server didn't start: " + stderr.slice(-500));
}

// ---------------------------------------------------------------- page helpers

async function noHorizontalScroll(page, label) {
  const info = await page.evaluate(() => {
    const de = document.documentElement;
    const cw = de.clientWidth;
    const offenders = [];
    if (de.scrollWidth > cw) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= cw + 0.5) continue;
        let p = el.parentElement, clipped = false;
        while (p && p !== document.body) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === "auto" || ox === "scroll" || ox === "hidden") { clipped = true; break; }
          p = p.parentElement;
        }
        if (!clipped) offenders.push((el.id ? "#" + el.id : el.tagName.toLowerCase() + "." + [...el.classList].join(".")) + " right=" + Math.round(r.right));
        if (offenders.length >= 5) break;
      }
    }
    return { sw: de.scrollWidth, cw, offenders };
  });
  return check(info.sw <= info.cw, `no horizontal scroll: ${label}`, info.sw > info.cw ? `scrollWidth ${info.sw} > ${info.cw}; ${info.offenders.join(", ")}` : `${info.cw}px`);
}

// True when the element's right edge is on screen without scrolling any container sideways.
async function onScreenX(page, selector, label) {
  const r = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { right: Math.round(b.right), cw: document.documentElement.clientWidth };
  }, selector);
  return check(!!r && r.right <= r.cw, `${label} fits on screen without side-scrolling`, r ? `right ${r.right} / ${r.cw}` : "not found");
}

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SCREENS, name + ".png"), fullPage });
}

async function readSave(page) {
  const text = await page.evaluate((k) => { try { return localStorage.getItem(k); } catch { return null; } }, SAVE_KEY);
  return text ? { text, save: JSON.parse(text) } : { text: null, save: null };
}

async function hubWeek(page) { return page.getAttribute("#hub-title", "data-week"); }

// Plays the current week from the hub, skips to the final and compares it with the stored result.
async function playWeekAndCheck(page, opts = {}) {
  const week = Number(await hubWeek(page));
  await page.click("#play-week");
  await page.waitForSelector("#screen-game:not([hidden])");
  check(await page.isVisible("#gc-vs"), `week ${week}: game center opens on the VS card`);
  const vsYears = await page.$$eval("#gc-vs .yr", (els) => els.map((e) => e.textContent.trim()));
  check(vsYears.length === 14 && vsYears.every((y) => /^(19[6-9]\d|Bye)$/.test(y)), `week ${week}: VS shows season years only`, vsYears.join(" "));
  if (opts.shotPrefix) await shot(page, opts.shotPrefix + "-game-vs");
  await page.selectOption("#gc-speed", "4");
  await page.click("#gc-next");
  await page.click("#gc-next");
  await page.click("#gc-next");
  const count = await page.textContent("#gc-board-count");
  check(/^Highlight 03\//.test(count), `week ${week}: Next highlight steps the reveal (counted as highlights, not plays)`, count);
  const lamps = await page.$$eval("#gc-lamps li.on", (els) => els.map((e) => e.dataset.q));
  check(lamps.length === 1 && /^[1-4]$/.test(lamps[0]), `week ${week}: one quarter lamp lit during the reveal`, lamps.join(","));
  if (opts.shotPrefix) await shot(page, opts.shotPrefix + "-game-reveal", false);
  await page.click("#gc-play"); // pause/resume toggles without error
  await page.click("#gc-skip");
  await page.waitForSelector("#gc-final-grid");
  const shown = await page.evaluate(() => {
    const grid = document.getElementById("gc-final-grid");
    const teams = [...grid.querySelectorAll(".final-team")].map((t) => ({
      id: t.dataset.team,
      total: t.querySelector(".tot").dataset.total,
      totalText: t.querySelector(".tot").textContent.trim(),
      lines: [...t.querySelectorAll(".line")].map((l) => Math.round(Number(l.dataset.points || 0) * 100)),
    }));
    return {
      home: grid.dataset.homeScore,
      away: grid.dataset.awayScore,
      boardHome: document.getElementById("gc-home-score").dataset.score,
      boardAway: document.getElementById("gc-away-score").dataset.score,
      teams,
      lampFinal: document.querySelector('#gc-lamps li[data-q="F"]').classList.contains("on"),
      fiction: document.querySelector(".fiction-note").textContent,
    };
  });
  const { save } = await readSave(page);
  const res = save && save.league.results[week];
  const m = res && res.matchups.find((x) => x.home === shown.teams[0].id && x.away === shown.teams[1].id);
  check(!!m, `week ${week}: stored result exists for the matchup on screen`);
  if (m) {
    check(m.homeScore.toFixed(2) === shown.home && m.awayScore.toFixed(2) === shown.away,
      `week ${week}: FINAL equals the stored result`, `screen ${shown.home}-${shown.away}, stored ${m.homeScore.toFixed(2)}-${m.awayScore.toFixed(2)}`);
    check(shown.boardHome === shown.home && shown.boardAway === shown.away, `week ${week}: scoreboard shows the final score`, `${shown.boardHome}-${shown.boardAway}`);
    const sums = shown.teams.map((t) => t.lines.reduce((a, b) => a + b, 0));
    check(sums[0] === Math.round(m.homeScore * 100) && sums[1] === Math.round(m.awayScore * 100),
      `week ${week}: starter lines add up to each team's score`, `${sums[0] / 100} / ${sums[1] / 100}`);
    check(shown.teams.every((t) => t.lines.length === 7), `week ${week}: FINAL lists 7 starters per team`);
  }
  check(shown.lampFinal, `week ${week}: FINAL lamp lit`);
  check(/not real play-by-play/i.test(shown.fiction), `week ${week}: page says highlights are fictional`);
  const gameLine = await page.textContent("#gc-final-grid .line .game");
  check(/^(19[6-9]\d) · team game \d+ · [A-Z][a-z]{2} \d{1,2}, \d{4} · [A-Z]{2,3} (at|vs) [A-Z]{2,3} · [WLT] \d+–\d+$/.test(gameLine.trim()) || /^Bye week/.test(gameLine.trim()),
    `week ${week}: real game line format`, gameLine.trim());
  const benchCount = await page.$$eval(".bench-section .line", (els) => els.length);
  check(benchCount === 8, `week ${week}: bench results shown after the final`, String(benchCount));
  if (opts.shotPrefix) await shot(page, opts.shotPrefix + "-game-final");
  await page.click("#gc-done");
  await page.waitForSelector("#screen-hub:not([hidden])");
  return week;
}

const TABS = ["week", "team", "schedule", "standings", "fa", "results", "rules"];

// ---------------------------------------------------------------- main

async function main() {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error("dist/index.html not found. Run `python3 build.py` first.");
    process.exit(1);
  }
  const rawIndex = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  check(rawIndex.startsWith("<title>Fantasy Football of the Past</title>") && !/<(!doctype|html|head|body)[\s>]/i.test(rawIndex),
    "dist/index.html follows the artifact page contract (no skeleton tags, starts with <title>)");

  fs.mkdirSync(SCREENS, { recursive: true });
  for (const f of fs.readdirSync(SCREENS)) if (f.endsWith(".png")) fs.unlinkSync(path.join(SCREENS, f));

  const { chromium } = loadPlaywright();
  const { proc, base } = await startServer();
  const baseUrl = new URL(base);
  // Google Fonts go through the session's HTTPS proxy when one is set; the local server must not.
  // Playwright normally forces loopback through the proxy, which would break the local data fetches.
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy) process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK = "1";
  const browser = await chromium.launch({
    headless: true,
    proxy: proxy ? { server: proxy, bypass: "127.0.0.1,localhost" } : undefined,
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
    await context.route((url) => url.host === baseUrl.host && (url.pathname === "/" || url.pathname === "/index.html"), async (route) => {
      const resp = await route.fetch();
      const body = await resp.text();
      const headers = { ...resp.headers(), "content-type": "text/html; charset=utf-8" };
      delete headers["content-length"];
      await route.fulfill({ status: resp.status(), headers, body: SKELETON_HEAD + body + SKELETON_TAIL });
    });
    const page = await context.newPage();
    page.on("console", (msg) => { if (msg.type() === "error") problems.push("console error: " + msg.text()); });
    page.on("pageerror", (err) => problems.push("page error: " + err.message));
    page.on("requestfailed", (req) => problems.push(`request failed: ${req.url()} (${req.failure() && req.failure().errorText})`));
    page.on("response", (resp) => { if (resp.status() >= 400) problems.push(`HTTP ${resp.status()}: ${resp.url()}`); });
    page.on("request", (req) => {
      const u = new URL(req.url());
      if (u.protocol.startsWith("http") && u.host !== baseUrl.host) outside.add(u.host);
    });

    // ---- Setup
    const t0 = Date.now();
    await page.goto(base + "index.html");
    await page.waitForSelector("#screen-setup:not([hidden])", { timeout: 120000 });
    pass("data loads and the setup screen appears", `${((Date.now() - t0) / 1000).toFixed(1)} s`);
    check((await page.title()) === "Fantasy Football of the Past", "page title");
    const pools = expectedPools();
    await page.check("#setup-mode-strict");
    const strictMax = await page.$$eval("#setup-teams option", (o) => Math.max(...o.map((x) => Number(x.value))));
    const strictWhy = await page.textContent("#setup-teams-why");
    const whyOk = pools.strict.maxTeams >= 16 ? /up to 16 teams/.test(strictWhy) : new RegExp("at most " + pools.strict.maxTeams + " teams").test(strictWhy);
    check(strictMax === pools.strict.maxTeams && whyOk, "Strict shows its max teams and why", `${strictMax} (data says ${pools.strict.maxTeams}): ${strictWhy}`);
    const strictQb = await page.$$eval("#pool-counts td", (tds) => Number(tds[0].textContent.replace(/,/g, "")));
    check(strictQb === pools.strict.counts.QB, "Strict pool counts come from the data", `${strictQb} QBs`);
    const coverageText = await page.textContent("#setup-strict-coverage");
    check(/^In this data: /.test(coverageText) && coverageText.split(".")[0].includes("QB") && coverageText.split(".")[0].includes(pools.qbSpan),
      "Strict mode card describes the data's coverage", `${coverageText} (QB span from the data: ${pools.qbSpan})`);
    check(await page.isDisabled("#setup-int"), "interceptions proposal applies to Historical only");
    await page.check("#setup-mode-historical");
    const histMax = await page.$$eval("#setup-teams option", (o) => Math.max(...o.map((x) => Number(x.value))));
    check(histMax === pools.historical.maxTeams, "Historical shows its max teams", `${histMax} (data says ${pools.historical.maxTeams})`);
    await page.evaluate(() => document.fonts.ready);
    await noHorizontalScroll(page, "desktop setup");
    await shot(page, "desktop-light-setup");

    // ---- Quick start
    await page.click("#quick-start");
    await page.waitForSelector("#screen-hub:not([hidden])", { timeout: 30000 });
    check((await hubWeek(page)) === "1", "Quick start lands on week 1 of a working league");
    const qs = (await readSave(page)).save;
    check(qs && qs.league.numTeams === 8 && qs.league.mode === "historical" && qs.league.stage === "season" &&
      qs.league.rosters.t0.length === 11, "Quick start: 8-team Historical league, user's team drafted, autosaved");
    await shot(page, "desktop-light-hub-week");

    // ---- Two weeks through the game center
    const w1 = await playWeekAndCheck(page, { shotPrefix: "desktop-light" });
    const w2 = await playWeekAndCheck(page);
    check(w1 === 1 && w2 === 2 && (await hubWeek(page)) === "3", "two weeks played; hub moves to week 3");

    // ---- Reload restores the save
    await page.waitForLoadState("networkidle");
    const before = (await readSave(page)).text;
    await page.reload();
    await page.waitForSelector("#screen-hub:not([hidden])", { timeout: 120000 });
    const after = (await readSave(page)).text;
    check((await hubWeek(page)) === "3" && before && before === after, "reload restores the saved league at week 3");
    const restored = JSON.parse(after).league;
    check(!!restored.results[1] && !!restored.results[2] && !restored.results[3], "saved results for weeks 1 and 2 survive the reload");

    // ---- Tabs on desktop
    for (const t of TABS) {
      await page.click("#tab-" + t);
      await page.waitForSelector(`#panel-${t}:not([hidden])`);
      await noHorizontalScroll(page, `desktop tab ${t}`);
    }
    await page.click("#tab-standings");
    await shot(page, "desktop-light-standings");
    await page.click("#tab-fa");
    await page.click("#fa-body button[data-add]");
    await page.waitForSelector(".drop-chooser");
    await shot(page, "desktop-light-free-agents", false);
    await page.click("#fa-cancel");

    // ---- Replay from results uses the stored result
    await page.click("#tab-results");
    await page.click("#watch-1-0");
    await page.waitForSelector("#screen-game:not([hidden])");
    await page.click("#gc-skip");
    await page.waitForSelector("#gc-final-grid");
    const replay = await page.evaluate(() => [document.getElementById("gc-final-grid").dataset.homeScore, document.getElementById("gc-final-grid").dataset.awayScore]);
    const stored = restored.results[1].matchups[0];
    check(replay[0] === stored.homeScore.toFixed(2) && replay[1] === stored.awayScore.toFixed(2), "replay of week 1 shows the stored result", replay.join("-"));
    check(JSON.stringify(JSON.parse((await readSave(page)).text).league.results) === JSON.stringify(restored.results), "replaying doesn't change stored results");

    // ---- Dark, desktop
    await page.emulateMedia({ colorScheme: "dark" });
    await shot(page, "desktop-dark-game-final");
    await page.click("#gc-play"); // Watch again -> VS
    await page.click("#gc-next");
    await page.click("#gc-next");
    await shot(page, "desktop-dark-game-reveal", false);
    await page.click("#gc-back");
    await page.click("#tab-week");
    await shot(page, "desktop-dark-hub-week");
    await page.click("#tab-schedule");
    await shot(page, "desktop-dark-schedule", false);

    // ---- 400px wide
    await page.setViewportSize({ width: 400, height: 860 });
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const t of TABS) {
        await page.click("#tab-" + t);
        await page.waitForSelector(`#panel-${t}:not([hidden])`);
        await noHorizontalScroll(page, `400px ${scheme} tab ${t}`);
      }
      if (scheme === "light") {
        await page.click("#tab-fa");
        await onScreenX(page, "#fa-body button[data-add]", "400px free agents: Add button");
      }
      await page.click("#tab-week");
      await shot(page, `mobile-${scheme}-hub-week`);
      await page.click("#tab-standings");
      await shot(page, `mobile-${scheme}-standings`);
      await page.click("#tab-results");
      await page.click("#watch-2-0");
      await page.waitForSelector("#screen-game:not([hidden])");
      await noHorizontalScroll(page, `400px ${scheme} game VS`);
      await page.click("#gc-next");
      await page.click("#gc-next");
      await page.click("#gc-next");
      await page.click("#gc-next");
      await noHorizontalScroll(page, `400px ${scheme} game reveal`);
      await shot(page, `mobile-${scheme}-game-reveal`, false);
      await page.click("#gc-skip");
      await page.waitForSelector("#gc-final-grid");
      await noHorizontalScroll(page, `400px ${scheme} game final`);
      await shot(page, `mobile-${scheme}-game-final`);
      await page.click("#gc-back");
    }

    // ---- Saves panel, New league confirmation, setup and draft at 400px
    await page.emulateMedia({ colorScheme: "light" });
    await page.click("#btn-saves");
    const exported = await page.inputValue("#save-export");
    check(exported.length > 1000 && JSON.parse(exported).saveVersion === 1, "Saves panel shows the export text");
    await noHorizontalScroll(page, "400px saves panel");
    // A save with the right version but a missing section is refused with a clear error, and nothing changes.
    const savedBefore = (await readSave(page)).text;
    const brokenSave = JSON.parse(exported);
    delete brokenSave.league.schedule;
    await page.fill("#save-import", JSON.stringify(brokenSave));
    await page.click("#save-load");
    const importErr = await page.textContent("#import-error");
    check(/damaged or incomplete/.test(importErr) && (await page.isVisible("#screen-hub")) && (await readSave(page)).text === savedBefore,
      "a structurally broken save is refused with a clear error and the league is kept", importErr);
    await page.fill("#save-import", "");
    await page.click("#btn-saves");
    await page.click("#btn-new-league");
    await page.waitForSelector("#confirm-bar:not([hidden])");
    check(true, "New league asks for confirmation in the page");
    await page.click("#confirm-no");
    check(await page.isVisible("#screen-hub"), "Cancel keeps the current league");
    await page.click("#btn-new-league");
    await page.click("#confirm-yes");
    await page.waitForSelector("#screen-setup:not([hidden])");
    await noHorizontalScroll(page, "400px light setup");
    await shot(page, "mobile-light-setup");
    await page.emulateMedia({ colorScheme: "dark" });
    await noHorizontalScroll(page, "400px dark setup");
    await shot(page, "mobile-dark-setup");
    await page.emulateMedia({ colorScheme: "light" });

    await page.check("#setup-mode-strict");
    await page.selectOption("#setup-teams", "4");
    await page.check("#setup-order-custom");
    await page.selectOption("#setup-pick", "2");
    await page.click("#setup-submit");
    await page.waitForSelector("#screen-draft:not([hidden])");
    await page.waitForSelector("#draft-clock.mine", { timeout: 15000 });
    const logBefore = await page.$$eval("#draft-log li", (els) => els.length);
    check(logBefore === 1, "AI picks run until the user is on the clock (pick 2)", String(logBefore));
    await noHorizontalScroll(page, "400px light draft");
    await onScreenX(page, "#draft-tbody button[data-pick]", "400px draft: Draft button");
    await shot(page, "mobile-light-draft");
    await page.emulateMedia({ colorScheme: "dark" });
    await shot(page, "mobile-dark-draft", false);
    await page.emulateMedia({ colorScheme: "light" });
    await page.click("#draft-tbody button[data-pick]:not([disabled])");
    await page.waitForSelector("#draft-clock.mine", { timeout: 15000 });
    const logAfter = await page.$$eval("#draft-log li", (els) => els.length);
    // 4 teams, user picks 2nd: after the user's pick the AI makes picks 3-6 (snake), then the user picks 7th.
    check(logAfter === 6, "Draft button picks; AI teams answer until the user's next pick", String(logAfter));
    await page.setViewportSize({ width: 1280, height: 900 });
    await noHorizontalScroll(page, "desktop draft");
    await shot(page, "desktop-light-draft", false);
    await page.click("#draft-autodraft");
    await page.waitForSelector("#screen-hub:not([hidden])", { timeout: 30000 });
    check((await readSave(page)).save.league.mode === "strict", "Auto-draft the rest finishes a Strict draft into the season");

    await page.waitForLoadState("networkidle");
    await context.close();

    // ---- Storage blocked: the page still works, and says so even after importing a save
    const blockedCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
    await blockedCtx.route((url) => url.host === baseUrl.host && (url.pathname === "/" || url.pathname === "/index.html"), async (route) => {
      const resp = await route.fetch();
      const body = await resp.text();
      const headers = { ...resp.headers(), "content-type": "text/html; charset=utf-8" };
      delete headers["content-length"];
      await route.fulfill({ status: resp.status(), headers, body: SKELETON_HEAD + body + SKELETON_TAIL });
    });
    await blockedCtx.addInitScript(() => {
      const no = () => { throw new DOMException("blocked", "SecurityError"); };
      Storage.prototype.getItem = no; Storage.prototype.setItem = no; Storage.prototype.removeItem = no;
    });
    const bp = await blockedCtx.newPage();
    bp.on("pageerror", (err) => problems.push("page error (storage blocked): " + err.message));
    await bp.goto(base + "index.html");
    await bp.waitForSelector("#screen-setup:not([hidden])", { timeout: 120000 });
    await bp.click("#quick-start");
    await bp.waitForSelector("#screen-hub:not([hidden])", { timeout: 30000 });
    check(await bp.$eval("#save-status", (e) => e.classList.contains("warn") && /isn't keeping saves/.test(e.textContent)),
      "storage blocked: the page warns that saves aren't kept");
    await bp.click("#btn-saves");
    check(/isn't keeping saves/.test(await bp.textContent("#save-hint")), "storage blocked: the Saves panel says the league won't survive a reload");
    const blockedExport = await bp.inputValue("#save-export");
    await bp.click("#btn-saves");
    await bp.click("#btn-new-league");
    await bp.click("#confirm-yes");
    await bp.waitForSelector("#screen-setup:not([hidden])");
    await bp.click("#btn-saves");
    await bp.fill("#save-import", blockedExport);
    await bp.click("#save-load");
    await bp.waitForSelector("#screen-hub:not([hidden])");
    const blockedStatus = await bp.$eval("#save-status", (e) => ({ warn: e.classList.contains("warn"), text: e.textContent }));
    check(blockedStatus.warn && /Loaded the imported save/.test(blockedStatus.text) && /isn't keeping saves/.test(blockedStatus.text),
      "storage blocked: importing keeps the warning", blockedStatus.text);
    await blockedCtx.close();
  } finally {
    await browser.close();
    proc.kill();
  }

  check(problems.length === 0, "no console errors or failed requests", problems.slice(0, 10).join(" | "));
  const extra = [...outside].filter((h) => !ALLOWED_HOSTS.has(h));
  check(extra.length === 0, "only Google Fonts requested from outside", [...outside].join(", ") || "none");

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ${path.relative(process.cwd(), SCREENS) || SCREENS}/`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("smoke test crashed:", err && err.stack ? err.stack : err);
  if (problems.length) console.error("Page problems so far:\n  " + problems.slice(0, 20).join("\n  "));
  process.exit(1);
});
