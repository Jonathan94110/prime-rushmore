// Engine unit tests. Run: node --test /home/user/prime-rushmore/fantasy-legends/prototype/tests/
// Uses small synthetic fixtures built in this file (never the real data files).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const FFP = require("../src/engine.js");
const { draftAll, playChecked } = require("./invariants.js");

const H = (x) => Math.round(x * 100);
const POS = ["QB", "RB", "WR", "TE", "K", "DEF"];
const HIST = { historical: { includeInterceptions: false } };
const HIST_INT = { historical: { includeInterceptions: true } };

// ---------------------------------------------------------------------------
// Synthetic fixtures
// ---------------------------------------------------------------------------

const COMMON = ["pid", "game_id", "season", "date", "team", "opp", "home_away", "result", "team_score", "opp_score",
  "team_game", "source"];
const OFF = ["pass_cmp", "pass_att", "pass_yds", "pass_td", "pass_int", "rush_att", "rush_yds", "rush_td", "rec",
  "rec_yds", "rec_td", "ret_td", "two_pt", "fum_rec_td"];
const KC = ["fgm", "fga", "fg_missed", "fgm_0_39", "fgm_40_49", "fgm_50p", "xpm", "xpa", "xp_missed", "pass_yds",
  "pass_td", "pass_int", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td", "ret_td", "two_pt", "fum_rec_td"];
const DC = ["team_name", "pts_allowed", "sacks", "def_int", "int_verified", "fum_rec", "safeties", "blk_punt", "blk_fg",
  "blk_xp", "def_int_td", "def_fum_td", "ret_td", "st_other_td"];
// A kicker's own offense stats, all zero.
const ZERO_K_OFF = { pass_yds: 0, pass_td: 0, pass_int: 0, rush_yds: 0, rush_td: 0, rec: 0, rec_yds: 0, rec_td: 0,
  ret_td: 0, two_pt: 0, fum_rec_td: 0 };
const COLS = { QB: COMMON.concat(OFF), RB: COMMON.concat(OFF), WR: COMMON.concat(OFF), TE: COMMON.concat(OFF),
  K: COMMON.concat(KC), DEF: COMMON.concat(DC) };

function gameBase(pid, i) {
  const season = 1980 + Math.floor(i / 10);
  const j = i % 10;
  const date = `${season}-${String(9 + Math.floor(j / 4)).padStart(2, "0")}-${String(1 + (j % 4) * 7).padStart(2, "0")}`;
  return { pid, game_id: `${date.replace(/-/g, "")}-${pid}`, season, date, team: "AAA", opp: "BBB",
    home_away: i % 2 ? "H" : "A", result: "W", team_score: 24, opp_score: 17, team_game: j + 1, source: "TEST" };
}

const ZERO_OFF = { pass_cmp: 0, pass_att: 0, pass_yds: 0, pass_td: 0, pass_int: 0, rush_att: 0, rush_yds: 0, rush_td: 0,
  rec: 0, rec_yds: 0, rec_td: 0, ret_td: 0, two_pt: 0, fum_rec_td: 0 };

// Deterministic stats; s = player strength, i = game number.
function statsFor(pos, s, i, zero) {
  if (pos === "K") {
    if (zero) return Object.assign({ fgm: 0, fga: 0, fg_missed: 0, fgm_0_39: 0, fgm_40_49: 0, fgm_50p: 0, xpm: 0, xpa: 0,
      xp_missed: 0 }, ZERO_K_OFF);
    const a = i % 2, b = (i + s) % 2, c = i % 5 === 0 ? 1 : 0, miss = i % 3 === 0 ? 1 : 0, xpm = 1 + ((i + s) % 4);
    return Object.assign({ fgm: a + b + c, fga: a + b + c + miss, fg_missed: miss, fgm_0_39: a, fgm_40_49: b, fgm_50p: c,
      xpm, xpa: xpm, xp_missed: 0 }, ZERO_K_OFF);
  }
  if (pos === "DEF") {
    if (zero) {
      return { team_name: "Zeros", pts_allowed: 27, sacks: 0, def_int: 0, int_verified: true, fum_rec: 0, safeties: 0,
        blk_punt: 0, blk_fg: 0, blk_xp: 0, def_int_td: 0, def_fum_td: 0, ret_td: 0, st_other_td: 0 };
    }
    return { team_name: "Team " + s, pts_allowed: (i * 7 + s * 3) % 35, sacks: (i + s) % 4, def_int: i % 3,
      int_verified: true, fum_rec: i % 2, safeties: 0, blk_punt: 0, blk_fg: 0, blk_xp: 0, def_int_td: 0, def_fum_td: 0,
      ret_td: i % 7 === 0 ? 1 : 0, st_other_td: 0 };
  }
  const o = Object.assign({}, ZERO_OFF);
  if (zero) return o;
  if (pos === "QB") {
    Object.assign(o, { pass_cmp: 15, pass_att: 25, pass_yds: 150 + 10 * s + ((i * 37) % 60), pass_td: (i + s) % 3,
      pass_int: i % 2, rush_att: 3, rush_yds: (i * 7) % 20 });
  } else if (pos === "RB") {
    Object.assign(o, { rush_att: 15, rush_yds: 40 + 5 * s + ((i * 13) % 50), rush_td: (i + s) % 2, rec: i % 4,
      rec_yds: 8 * (i % 4) });
  } else if (pos === "WR") {
    Object.assign(o, { rec: 2 + ((i + s) % 5), rec_yds: 30 + 4 * s + ((i * 11) % 40), rec_td: i % 3 === 0 ? 1 : 0 });
  } else {
    Object.assign(o, { rec: 1 + (i % 3), rec_yds: 15 + 2 * s + ((i * 5) % 25), rec_td: i % 4 === 0 ? 1 : 0 });
  }
  return o;
}

// Strict-only fields set to null make a player historical-only.
function nullStrictOnly(pos, g) {
  if (pos === "K") { g.fgm_0_39 = null; g.fgm_40_49 = null; g.fgm_50p = null; }
  else if (pos === "DEF") { g.sacks = null; }
  else { g.fum_rec_td = null; }
}

function toTable(pos, games) {
  const cols = COLS[pos];
  return { columns: cols, rows: games.map((g) => cols.map((c) => (g[c] === undefined ? null : g[c]))) };
}

/** A fake db: counts per position, `games` games each, built with FFP.loadData from columns/rows tables. */
function makeDb(opts) {
  opts = opts || {};
  const counts = opts.counts;
  const nGames = opts.games || 20;
  const histOnly = opts.histOnly || (() => false);
  const players = [];
  const byPos = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] };
  for (const pos of POS) {
    for (let idx = 0; idx < (counts[pos] || 0); idx++) {
      const id = `${pos}-${idx}`;
      players.push({ id, name: `${pos} Player ${idx}`, pos, hof: idx === 0, legend: false, first: 1980, last: 1981,
        teams: ["AAA"] });
      for (let i = 0; i < nGames; i++) {
        const g = Object.assign(gameBase(id, i), statsFor(pos, idx, i, opts.zero));
        if (histOnly(pos, idx)) nullStrictOnly(pos, g);
        byPos[pos].push(g);
      }
    }
  }
  if (opts.extraPlayers) {
    for (const p of opts.extraPlayers) {
      players.push(p.player);
      byPos[p.player.pos].push(...p.games);
    }
  }
  const games = {};
  for (const pos of POS) games[pos] = toTable(pos, byPos[pos]);
  return FFP.loadData({ players: { version: 1, seasons: [1960, 1999], players }, games });
}

const STD_COUNTS = { QB: 8, RB: 20, WR: 20, TE: 8, K: 8, DEF: 8 };
// Every 4th player is historical-only, so the strict pool is smaller.
const STD_HIST_ONLY = (pos, idx) => idx % 4 === 3;
let STD_DB = null;
function stdDb() {
  if (!STD_DB) STD_DB = makeDb({ counts: STD_COUNTS, histOnly: STD_HIST_ONLY });
  return STD_DB;
}

function newLeague(db, opts) {
  return FFP.createLeague(Object.assign({ name: "Test", teamName: "Mine", numTeams: 4, playoffTeams: 4,
    mode: "historical", historical: { includeInterceptions: false }, draftOrder: "random", seed: "s1" }, opts), db);
}

function draftedLeague(db, opts) {
  return draftAll(FFP, newLeague(db, opts), db);
}

function posOf(db, pid) { return db.playersById[pid].pos; }

function bestAvailable(league, db, pos) {
  return FFP.freeAgents(league, db).find((p) => p.pos === pos).id;
}

// Hand-written games for scoring examples.
function offGame(stats) {
  return Object.assign(gameBase("X-1", 0), ZERO_OFF, { two_pt: null, fum_rec_td: null }, stats);
}

// ---------------------------------------------------------------------------
// Constants and purity
// ---------------------------------------------------------------------------

test("constants match the spec", () => {
  assert.equal(FFP.ENGINE_VERSION, "proto-1");
  assert.equal(FFP.SAVE_VERSION, 1);
  assert.equal(FFP.TOTAL_WEEKS, 17);
  assert.equal(FFP.MIN_GAMES, 16);
  assert.deepEqual([...FFP.SLOTS], ["QB", "RB", "WR", "TE", "FLEX", "DEF", "K"]);
  assert.equal(FFP.BENCH, 4);
  assert.equal(FFP.ROSTER_SIZE, 11);
  assert.deepEqual(JSON.parse(JSON.stringify(FFP.DEFAULT_RULES)), {
    offense: { pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, rush_td: 6, rec: 1, rec_yd: 0.1, rec_td: 6,
      ret_td: 6, two_pt: 2, fum_rec_td: 6, fumble_lost: 0 },
    kicker: { xp: 1, xp_miss: -1, fg_0_39: 3, fg_40_49: 4, fg_50p: 5, fg_flat: 3, fg_miss: -1 },
    defense: { sack: 1, int: 2, fum_rec: 2, safety: 2, block: 2, def_td: 6, ret_td: 6,
      pa_tiers: [[0, 10], [6, 7], [13, 4], [20, 1], [27, 0], [34, -1], [999, -4]] }
  });
});

test("engine is pure: runs a whole league with Math.random, Date, window and document unavailable", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "engine.js"), "utf8");
  const ctx = { module: { exports: {} } };
  vm.createContext(ctx);
  vm.runInContext("Math.random = function () { throw new Error('Math.random used'); };" +
    "Date = function () { throw new Error('Date used'); }; Date.now = Date;", ctx);
  vm.runInContext(src, ctx);
  const F = ctx.module.exports;
  assert.equal(typeof F.playWeek, "function");
  const db = F.loadData({ players: { players: [] }, games: {} });
  assert.equal(db.players.length, 0);
  // Re-run a short league through the sandboxed engine with the shared fixture data.
  const real = stdDb();
  const dbs = F.loadData({ players: real.players, games: Object.fromEntries(POS.map((p) => [p,
    real.players.filter((x) => x.pos === p).flatMap((x) => real.gamesByPid[x.id].map((g) => Object.assign({}, g)))])) });
  const L = F.createLeague({ numTeams: 4, mode: "historical", seed: "pure" }, dbs);
  while (L.stage === "draft") {
    F.runAIPicks(L, dbs);
    const cp = F.currentPick(L);
    if (cp) F.makePick(L, dbs, F.aiPick(L, dbs, cp.teamId));
  }
  while (L.stage === "season") F.playWeek(L, dbs);
  assert.equal(L.stage, "complete");
  F.revealTimeline(L, dbs, 3, 0);
  F.deserialize(F.serialize(L));
});

test("UMD: sets a global FFP when there is no module system", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "engine.js"), "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  assert.equal(ctx.FFP.ENGINE_VERSION, "proto-1");
});

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

test("requiredFields for both modes and every position", () => {
  const offStrict = ["pass_yds", "pass_td", "pass_int", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td", "ret_td",
    "two_pt", "fum_rec_td"];
  const offHist = ["pass_yds", "pass_td", "pass_int", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td", "ret_td"];
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    assert.deepEqual(FFP.requiredFields(pos, "strict", HIST), offStrict);
    assert.deepEqual(FFP.requiredFields(pos, "historical", HIST), offHist);
  }
  assert.deepEqual(FFP.requiredFields("K", "strict", HIST), ["xpm", "xp_missed", "fgm_0_39", "fgm_40_49", "fgm_50p",
    "fg_missed"].concat(offStrict));
  assert.deepEqual(FFP.requiredFields("K", "historical", HIST), ["fgm", "xpm", "fg_missed"]);
  assert.deepEqual(FFP.requiredFields("DEF", "strict", HIST), ["pts_allowed", "sacks", "def_int", "fum_rec", "safeties",
    "blk_punt", "blk_fg", "blk_xp", "def_int_td", "def_fum_td", "ret_td", "st_other_td"]);
  assert.deepEqual(FFP.requiredFields("DEF", "historical", HIST), ["pts_allowed", "ret_td"]);
  assert.deepEqual(FFP.requiredFields("DEF", "historical", HIST_INT), ["pts_allowed", "ret_td", "def_int"]);
  assert.throws(() => FFP.requiredFields("QB", "fantasy", HIST), /mode/);
  assert.throws(() => FFP.requiredFields("LB", "strict", HIST), /position/);
});

test("offense eligibility: strict needs two_pt and fum_rec_td, historical does not", () => {
  const g = offGame({ pass_yds: 200 });
  assert.equal(FFP.isEligible(g, "QB", "historical", HIST), true);
  assert.equal(FFP.isEligible(g, "QB", "strict", HIST), false);
  const full = offGame({ pass_yds: 200, two_pt: 0, fum_rec_td: 0 });
  assert.equal(FFP.isEligible(full, "QB", "strict", HIST), true);
  // A null in a field both modes need blocks both modes.
  for (const f of ["pass_yds", "pass_td", "pass_int", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td", "ret_td"]) {
    const bad = Object.assign({}, full, { [f]: null });
    assert.equal(FFP.isEligible(bad, "RB", "historical", HIST), false, f);
    assert.equal(FFP.isEligible(bad, "RB", "strict", HIST), false, f);
  }
  // Fields no mode needs (pass_cmp, rush_att) may be unknown.
  assert.equal(FFP.isEligible(Object.assign({}, full, { pass_cmp: null, rush_att: null }), "WR", "strict", HIST), true);
  // Season must be 1960–1999.
  assert.equal(FFP.isEligible(Object.assign({}, full, { season: 1959 }), "QB", "historical", HIST), false);
  assert.equal(FFP.isEligible(Object.assign({}, full, { season: 2000 }), "QB", "historical", HIST), false);
  assert.equal(FFP.isEligible(Object.assign({}, full, { season: 1960 }), "QB", "historical", HIST), true);
  assert.equal(FFP.isEligible(Object.assign({}, full, { season: 1999 }), "QB", "historical", HIST), true);
  assert.equal(FFP.isEligible(null, "QB", "historical", HIST), false);
});

test("kicker eligibility: strict needs distance splits, missed XPs and offense stats, historical needs fgm", () => {
  const k = Object.assign(gameBase("K-x", 0), { fgm: 2, fga: 3, fg_missed: 1, fgm_0_39: null, fgm_40_49: null,
    fgm_50p: null, xpm: 3, xpa: 3, xp_missed: 0 }, ZERO_K_OFF);
  assert.equal(FFP.isEligible(k, "K", "historical", HIST), true);
  assert.equal(FFP.isEligible(k, "K", "strict", HIST), false);
  const split = Object.assign({}, k, { fgm: null, fgm_0_39: 1, fgm_40_49: 1, fgm_50p: 0 });
  assert.equal(FFP.isEligible(split, "K", "strict", HIST), true);
  assert.equal(FFP.isEligible(split, "K", "historical", HIST), false, "historical needs fgm");
  assert.equal(FFP.isEligible(Object.assign({}, split, { xp_missed: null }), "K", "strict", HIST), false, "strict needs xp_missed");
  assert.equal(FFP.isEligible(Object.assign({}, split, { fum_rec_td: null }), "K", "strict", HIST), false, "strict needs offense");
  assert.equal(FFP.isEligible(Object.assign({}, k, { xp_missed: null, fum_rec_td: null }), "K", "historical", HIST), true,
    "historical rules unchanged");
  assert.equal(FFP.isEligible(Object.assign({}, k, { xpm: null }), "K", "historical", HIST), false);
});

test("defense eligibility: strict needs every field and a verified interception count", () => {
  const d = Object.assign(gameBase("DEF-x", 0), { team_name: "X", pts_allowed: 10, sacks: 3, def_int: 1,
    int_verified: true, fum_rec: 1, safeties: 0, blk_punt: 0, blk_fg: 0, blk_xp: 0, def_int_td: 0, def_fum_td: 0,
    ret_td: 0, st_other_td: 0 });
  assert.equal(FFP.isEligible(d, "DEF", "strict", HIST), true);
  assert.equal(FFP.isEligible(Object.assign({}, d, { st_other_td: null }), "DEF", "strict", HIST), false);
  assert.equal(FFP.isEligible(Object.assign({}, d, { int_verified: false }), "DEF", "strict", HIST), false);
  assert.equal(FFP.isEligible(Object.assign({}, d, { sacks: null }), "DEF", "strict", HIST), false);
  // Historical: only points allowed and return TDs (plus verified interceptions when the toggle is on).
  const sparse = Object.assign({}, d, { sacks: null, def_int: null, int_verified: false, fum_rec: null, safeties: null,
    blk_punt: null, blk_fg: null, blk_xp: null, def_int_td: null, def_fum_td: null, st_other_td: null });
  assert.equal(FFP.isEligible(sparse, "DEF", "historical", HIST), true);
  assert.equal(FFP.isEligible(sparse, "DEF", "historical", HIST_INT), false);
  assert.equal(FFP.isEligible(Object.assign({}, sparse, { def_int: 2 }), "DEF", "historical", HIST_INT), false,
    "unverified interceptions don't count");
  assert.equal(FFP.isEligible(Object.assign({}, sparse, { def_int: 2, int_verified: true }), "DEF", "historical", HIST_INT),
    true);
  assert.equal(FFP.isEligible(Object.assign({}, sparse, { pts_allowed: null }), "DEF", "historical", HIST), false);
  assert.equal(FFP.isEligible(Object.assign({}, sparse, { ret_td: null }), "DEF", "historical", HIST), false);
});

// ---------------------------------------------------------------------------
// Scoring: hand-computed examples
// ---------------------------------------------------------------------------

function partsSum(r) { return r.parts.reduce((a, p) => a + H(p.points), 0); }

test("QB scoring (hand-computed)", () => {
  // 250 pass yd × 0.04 = 10, 2 pass TD × 4 = 8, 1 INT × −2 = −2, 15 rush yd × 0.1 = 1.5 → 17.5
  const g = offGame({ pass_yds: 250, pass_td: 2, pass_int: 1, rush_yds: 15 });
  const r = FFP.scoreGame(g, "QB", "historical", HIST, FFP.DEFAULT_RULES);
  assert.equal(r.total, 17.5);
  assert.equal(partsSum(r), H(r.total));
  assert.deepEqual(r.parts.map((p) => [p.stat, p.value, p.points]),
    [["pass_yds", 250, 10], ["pass_td", 2, 8], ["pass_int", 1, -2], ["rush_yds", 15, 1.5]]);
  assert.throws(() => FFP.scoreGame(g, "QB", "strict", HIST, FFP.DEFAULT_RULES), /not eligible/);
  // Strict adds two-point conversions (+2) and fumble recovery TDs (+6): 17.5 + 2 + 6 = 25.5
  const s = Object.assign({}, g, { two_pt: 1, fum_rec_td: 1 });
  assert.equal(FFP.scoreGame(s, "QB", "strict", HIST, FFP.DEFAULT_RULES).total, 25.5);
  // Historical ignores those fields even when they are known.
  assert.equal(FFP.scoreGame(s, "QB", "historical", HIST, FFP.DEFAULT_RULES).total, 17.5);
});

test("RB scoring (hand-computed)", () => {
  // 112 rush yd = 11.2, 1 rush TD = 6, 4 rec = 4, 37 rec yd = 3.7, 1 return TD = 6 → 30.9
  const g = offGame({ rush_yds: 112, rush_td: 1, rec: 4, rec_yds: 37, ret_td: 1 });
  assert.equal(FFP.scoreGame(g, "RB", "historical", HIST).total, 30.9);
  const s = Object.assign({}, g, { two_pt: 1, fum_rec_td: 0 });
  assert.equal(FFP.scoreGame(s, "RB", "strict", HIST).total, 32.9);
});

test("WR scoring (hand-computed, negative yards)", () => {
  // 7 rec = 7, 128 rec yd = 12.8, 2 rec TD = 12, −4 rush yd = −0.4 → 31.4
  const g = offGame({ rec: 7, rec_yds: 128, rec_td: 2, rush_yds: -4 });
  const r = FFP.scoreGame(g, "WR", "historical", HIST);
  assert.equal(r.total, 31.4);
  assert.equal(partsSum(r), H(31.4));
});

test("TE scoring (hand-computed)", () => {
  // 3 rec = 3, 41 rec yd = 4.1, 1 rec TD = 6 → 13.1; strict + 1 two-point = 15.1
  const g = offGame({ rec: 3, rec_yds: 41, rec_td: 1, two_pt: 1, fum_rec_td: 0 });
  assert.equal(FFP.scoreGame(g, "TE", "historical", HIST).total, 13.1);
  assert.equal(FFP.scoreGame(g, "TE", "strict", HIST).total, 15.1);
});

test("K scoring (hand-computed, both modes)", () => {
  const g = Object.assign(gameBase("K-x", 0), { fgm: 4, fga: 5, fg_missed: 1, fgm_0_39: 2, fgm_40_49: 1, fgm_50p: 1,
    xpm: 3, xpa: 4, xp_missed: 1 }, ZERO_K_OFF, { rush_yds: 12, rush_td: 1 });
  // strict: 3 XP × 1 − 1 missed XP + 2 × 3 + 1 × 4 + 1 × 5 − 1 missed FG + 12 × 0.1 + 6 rushing TD = 23.2
  const s = FFP.scoreGame(g, "K", "strict", HIST);
  assert.equal(s.total, 23.2);
  assert.equal(partsSum(s), H(23.2));
  // Rules saved before the missed-XP rule have no xp_miss; the default (−1) fills it in.
  const oldRules = JSON.parse(JSON.stringify(FFP.DEFAULT_RULES));
  delete oldRules.kicker.xp_miss;
  assert.equal(FFP.scoreGame(g, "K", "strict", HIST, oldRules).total, 23.2);
  // historical: 4 FG × 3 (flat) + 3 XP − 1 miss = 14
  const h = FFP.scoreGame(g, "K", "historical", HIST);
  assert.equal(h.total, 14);
  assert.deepEqual(h.parts.map((p) => p.stat), ["fgm", "xpm", "fg_missed"]);
});

test("DEF scoring (hand-computed, both modes and the interceptions toggle)", () => {
  const g = Object.assign(gameBase("DEF-x", 0), { team_name: "X", pts_allowed: 10, sacks: 4, def_int: 2,
    int_verified: true, fum_rec: 1, safeties: 1, blk_punt: 1, blk_fg: 0, blk_xp: 0, def_int_td: 1, def_fum_td: 0,
    ret_td: 1, st_other_td: 1 });
  // strict: tier(10) = 4; sacks 4; 2 × (2 + 1 + 1 + 1 + 0 + 0) = 10; 6 × (1 + 0 + 1 + 1 other special-teams TD) = 18 → 36
  const s = FFP.scoreGame(g, "DEF", "strict", HIST);
  assert.equal(s.total, 36);
  assert.equal(partsSum(s), H(36));
  assert.equal(s.parts[0].stat, "pts_allowed");
  assert.equal(s.parts[0].points, 4);
  // historical: tier(10) = 4 + 6 × 1 return TD = 10; sacks etc. are ignored
  assert.equal(FFP.scoreGame(g, "DEF", "historical", HIST).total, 10);
  // historical with interceptions: + 2 × 2 = 14
  assert.equal(FFP.scoreGame(g, "DEF", "historical", HIST_INT).total, 14);
});

test("points-allowed tiers", () => {
  const cases = [[0, 10], [1, 7], [6, 7], [7, 4], [13, 4], [14, 1], [20, 1], [21, 0], [27, 0], [28, -1], [34, -1],
    [35, -4], [62, -4]];
  for (const [pa, pts] of cases) {
    assert.equal(FFP.paTierPoints(pa, FFP.DEFAULT_RULES.defense.pa_tiers), pts, "pa " + pa);
    const g = Object.assign(gameBase("DEF-x", 0), { pts_allowed: pa, ret_td: 0 });
    assert.equal(FFP.scoreGame(g, "DEF", "historical", HIST).total, pts, "scoreGame pa " + pa);
  }
});

test("custom rules replace coefficients; points are summed in hundredths", () => {
  const rules = JSON.parse(JSON.stringify(FFP.DEFAULT_RULES));
  rules.offense.rec = 0.5;
  const g = offGame({ rec: 3, rec_yds: 41, rec_td: 1 });
  assert.equal(FFP.scoreGame(g, "TE", "historical", HIST, rules).total, 11.6);
  // 0.1 + 0.2 style float sums stay exact: 1 + 2 rush yards over many parts
  const f = offGame({ rush_yds: 3, rec_yds: 3, pass_yds: 3 });
  assert.equal(FFP.scoreGame(f, "RB", "historical", HIST).total, 0.72);
});

test("null is never scored as zero", () => {
  // A null required stat makes the game ineligible (and scoreGame refuses), unlike a known 0.
  const zero = offGame({ rush_yds: 0 });
  const unknown = offGame({ rush_yds: null });
  assert.equal(FFP.scoreGame(zero, "RB", "historical", HIST).total, 0);
  assert.equal(FFP.isEligible(unknown, "RB", "historical", HIST), false);
  assert.throws(() => FFP.scoreGame(unknown, "RB", "historical", HIST), /rush_yds/);
  // Fields outside the mode are not scored at all, never as 0 points: historical QB with unknown two_pt.
  const r = FFP.scoreGame(offGame({ pass_yds: 100 }), "QB", "historical", HIST);
  assert.ok(!r.parts.some((p) => p.stat === "two_pt" || p.stat === "fum_rec_td"));
  // Unknown sacks keep a defense out of strict mode rather than counting as no sacks.
  const d = Object.assign(gameBase("DEF-x", 0), { pts_allowed: 3, sacks: null, def_int: 0, int_verified: true,
    fum_rec: 0, safeties: 0, blk_punt: 0, blk_fg: 0, blk_xp: 0, def_int_td: 0, def_fum_td: 0, ret_td: 0 });
  assert.throws(() => FFP.scoreGame(d, "DEF", "strict", HIST), /sacks/);
  // loadData keeps nulls as nulls.
  const db = stdDb();
  const histOnly = db.gamesByPid["QB-3"][0];
  assert.equal(histOnly.fum_rec_td, null);
  assert.equal(FFP.eligibleGames(db, "QB-3", "strict", HIST).length, 0);
  assert.equal(FFP.eligibleGames(db, "QB-3", "historical", HIST).length, 20);
});

// ---------------------------------------------------------------------------
// Data and pools
// ---------------------------------------------------------------------------

test("loadData builds players, playersById and keyed games in date order", () => {
  const db = stdDb();
  assert.equal(db.players.length, 72);
  assert.equal(db.playersById["WR-2"].name, "WR Player 2");
  const games = db.gamesByPid["WR-2"];
  assert.equal(games.length, 20);
  assert.equal(games[0].key, "WR-2|" + games[0].game_id);
  assert.equal(typeof games[0].rec_yds, "number");
  for (let i = 1; i < games.length; i++) assert.ok(games[i - 1].date <= games[i].date);
  // Array-of-objects input works too, and the players array may be passed directly.
  const db2 = FFP.loadData({ players: [db.playersById["WR-2"]], games: { WR: games.map((g) => Object.assign({}, g)) } });
  assert.equal(db2.gamesByPid["WR-2"].length, 20);
});

test("draftPool applies the MIN_GAMES threshold to eligible games only", () => {
  const mk = (pid, n, tweak) => Array.from({ length: n }, (_, i) =>
    Object.assign(gameBase(pid, i), ZERO_OFF, { rush_yds: 100 + i }, tweak ? tweak(i) : {}));
  const extra = [
    { player: { id: "RB-a", name: "Sixteen", pos: "RB", hof: true, legend: true, first: 1980, last: 1981 }, games: mk("RB-a", 16) },
    { player: { id: "RB-b", name: "Fifteen plus nulls", pos: "RB", hof: false, legend: false, first: 1980, last: 1981 },
      games: mk("RB-b", 18, (i) => (i >= 15 ? { rec: null } : {})) },
    { player: { id: "RB-c", name: "Pre-1960 game", pos: "RB", hof: false, legend: false, first: 1959, last: 1981 },
      games: mk("RB-c", 16, (i) => (i === 0 ? { season: 1959, date: "1959-12-01" } : {})) }
  ];
  const db = makeDb({ counts: {}, extraPlayers: extra });
  const pool = FFP.draftPool(db, "historical", HIST);
  assert.deepEqual(pool.map((p) => p.id), ["RB-a"]);
  // 16 games of 100..115 rush yards → 10.0..11.5 points → average 10.75
  assert.deepEqual(pool[0], { id: "RB-a", name: "Sixteen", pos: "RB", hof: true, legend: true, first: 1980, last: 1981,
    eligibleCount: 16, avgPoints: 10.75 });
  assert.equal(FFP.eligibleGames(db, "RB-b", "historical", HIST).length, 15);
  assert.equal(FFP.eligibleGames(db, "RB-c", "historical", HIST).length, 15);
  // Strict needs two_pt/fum_rec_td: these games have them (0), so the strict pool matches here.
  assert.deepEqual(FFP.draftPool(db, "strict", HIST).map((p) => p.id), ["RB-a"]);
});

test("draftPool is sorted by avgPoints and differs by mode", () => {
  const db = stdDb();
  const hist = FFP.draftPool(db, "historical", HIST);
  const strict = FFP.draftPool(db, "strict", HIST);
  assert.equal(hist.length, 72);
  assert.equal(strict.length, 54);
  for (let i = 1; i < hist.length; i++) assert.ok(hist[i - 1].avgPoints >= hist[i].avgPoints);
  assert.ok(!strict.some((p) => STD_HIST_ONLY(p.pos, Number(p.id.split("-")[1]))));
  // avgPoints is the mean of the eligible games' scores.
  const p = hist.find((x) => x.id === "QB-5");
  const games = FFP.eligibleGames(db, "QB-5", "historical", HIST);
  const mean = games.reduce((a, g) => a + H(FFP.scoreGame(g, "QB", "historical", HIST).total), 0) / games.length / 100;
  assert.equal(p.avgPoints, Math.round(mean * 100) / 100);
  assert.equal(p.eligibleCount, 20);
});

test("poolSummary counts and maxTeams", () => {
  const sum = FFP.poolSummary(stdDb(), "historical", HIST);
  assert.deepEqual(sum.counts, { QB: 8, RB: 20, WR: 20, TE: 8, K: 8, DEF: 8 });
  assert.equal(sum.maxTeams, 6, "72 players / 11 per roster");
  const strict = FFP.poolSummary(stdDb(), "strict", HIST);
  assert.deepEqual(strict.counts, { QB: 6, RB: 15, WR: 15, TE: 6, K: 6, DEF: 6 });
  assert.equal(strict.maxTeams, 4, "54 players / 11 per roster");

  const cases = [
    [{ QB: 3, RB: 10, WR: 10, TE: 5, K: 5, DEF: 5 }, 3], // QB-limited
    [{ QB: 9, RB: 9, WR: 9, TE: 4, K: 9, DEF: 9 }, 4], // TE-limited
    [{ QB: 9, RB: 9, WR: 9, TE: 9, K: 2, DEF: 9 }, 2], // K-limited
    [{ QB: 9, RB: 9, WR: 9, TE: 9, K: 9, DEF: 1 }, 1], // DEF-limited: no league possible
    [{ QB: 6, RB: 6, WR: 6, TE: 6, K: 6, DEF: 6 }, 3], // total 36 → 3 × 11
    [{ QB: 20, RB: 70, WR: 70, TE: 20, K: 20, DEF: 20 }, 16] // capped at 16
  ];
  for (const [counts, expected] of cases) {
    const db = makeDb({ counts, games: 16 });
    assert.equal(FFP.poolSummary(db, "historical", HIST).maxTeams, expected, JSON.stringify(counts));
  }
  // A league can't be created when maxTeams < 2.
  const tiny = makeDb({ counts: { QB: 9, RB: 9, WR: 9, TE: 9, K: 9, DEF: 1 }, games: 16 });
  assert.throws(() => FFP.createLeague({ numTeams: 4, mode: "historical" }, tiny), /too small/);
  // Fifteen games is one short of the threshold.
  const short = makeDb({ counts: STD_COUNTS, games: 15 });
  assert.equal(FFP.poolSummary(short, "historical", HIST).maxTeams, 0);
});

// ---------------------------------------------------------------------------
// League setup
// ---------------------------------------------------------------------------

test("createLeague clamps teams, picks playoff size and regular-season length", () => {
  const db = stdDb();
  const big = newLeague(db, { numTeams: 12 });
  assert.equal(big.numTeams, 6, "clamped to historical maxTeams");
  const strict = newLeague(db, { numTeams: 12, mode: "strict" });
  assert.equal(strict.numTeams, 4, "clamped to strict maxTeams");
  assert.equal(newLeague(db, { numTeams: 1 }).numTeams, 2);

  const pick = (n, p) => { const L = newLeague(db, { numTeams: n, playoffTeams: p }); return [L.playoffTeams, L.playoffRounds, L.regularWeeks]; };
  assert.deepEqual(pick(6, 6), [6, 3, 14]);
  assert.deepEqual(pick(5, 6), [4, 2, 15]);
  assert.deepEqual(pick(4, 4), [4, 2, 15]);
  assert.deepEqual(pick(6, 4), [4, 2, 15]);
  assert.deepEqual(pick(3, 4), [2, 1, 16]);
  assert.deepEqual(pick(2, 6), [2, 1, 16]);

  const L = newLeague(db, { numTeams: 5, teamName: "Canton Bulldogs" });
  assert.deepEqual(L.teams, [
    { id: "t0", name: "Canton Bulldogs", isUser: true },
    { id: "t1", name: "Leather Helmets", isUser: false },
    { id: "t2", name: "Single Wing", isUser: false },
    { id: "t3", name: "Flying Wedge", isUser: false },
    { id: "t4", name: "Wishbone", isUser: false }
  ]);
  assert.equal(L.stage, "draft");
  assert.equal(L.mode, "historical");
  assert.deepEqual(L.settings, HIST);
  assert.deepEqual(JSON.parse(JSON.stringify(L)), L, "league is plain JSON");
});

test("draft order: seeded random shuffle, or the user's chosen slot", () => {
  const db = stdDb();
  const a = newLeague(db, { numTeams: 6, seed: "order" });
  const b = newLeague(db, { numTeams: 6, seed: "order" });
  assert.deepEqual(a.draftOrder, b.draftOrder, "same seed, same order");
  assert.deepEqual(a.draftOrder.slice().sort(), ["t0", "t1", "t2", "t3", "t4", "t5"]);
  const orders = new Set(["1", "2", "3", "4", "5", "6"].map((s) => newLeague(db, { numTeams: 6, seed: s }).draftOrder.join()));
  assert.ok(orders.size > 1, "different seeds give different orders");
  for (let k = 1; k <= 6; k++) {
    const c = newLeague(db, { numTeams: 6, draftOrder: "custom", userPick: k });
    assert.equal(c.draftOrder[k - 1], "t0");
    assert.equal(c.userPick, k);
    assert.deepEqual(c.draftOrder.slice().sort(), ["t0", "t1", "t2", "t3", "t4", "t5"]);
  }
});

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

test("currentPick follows a snake order", () => {
  const db = stdDb();
  const L = newLeague(db, { numTeams: 3, draftOrder: "custom", userPick: 2 });
  const o = L.draftOrder;
  const expected = [o[0], o[1], o[2], o[2], o[1], o[0], o[0], o[1], o[2]];
  const seen = [];
  for (let i = 0; i < expected.length; i++) {
    const cp = FFP.currentPick(L);
    assert.equal(cp.overall, i + 1);
    assert.equal(cp.round, Math.floor(i / 3) + 1);
    assert.equal(cp.pickInRound, (i % 3) + 1);
    seen.push(cp.teamId);
    FFP.makePick(L, db, FFP.aiPick(L, db, cp.teamId));
  }
  assert.deepEqual(seen, expected);
  assert.deepEqual(L.picks.map((p) => p.teamId), expected);
});

test("canPick rejects rostered players, players outside the pool, and picks that strand a starting slot", () => {
  const extra = [{ player: { id: "QB-few", name: "Few Games", pos: "QB", hof: false, legend: false, first: 1980, last: 1980 },
    games: Array.from({ length: 10 }, (_, i) => Object.assign(gameBase("QB-few", i), ZERO_OFF, { pass_yds: 300 })) }];
  const db = makeDb({ counts: STD_COUNTS, extraPlayers: extra });
  const L = newLeague(db, { numTeams: 2, draftOrder: "custom", userPick: 1 });
  assert.equal(FFP.currentPick(L).teamId, "t0");
  const out = FFP.canPick(L, db, "t0", "QB-few");
  assert.equal(out.ok, false);
  assert.match(out.reason, /pool/);
  assert.equal(FFP.canPick(L, db, "t0", "nobody").ok, false);
  assert.throws(() => FFP.makePick(L, db, "QB-few"), /pool/);

  // User drafts QB, WR, TE and then six RBs: 9 players, needs K and DEF with 2 picks left.
  const plan = ["QB", "WR", "TE", "RB", "RB", "RB", "RB", "RB", "RB"];
  let firstPick = null;
  for (const pos of plan) {
    FFP.runAIPicks(L, db);
    assert.equal(FFP.currentPick(L).teamId, "t0");
    const pid = bestAvailable(L, db, pos);
    if (!firstPick) firstPick = pid;
    assert.deepEqual(FFP.canPick(L, db, "t0", pid), { ok: true, reason: "" });
    FFP.makePick(L, db, pid);
  }
  FFP.runAIPicks(L, db);
  assert.equal(L.rosters.t0.length, 9);
  const taken = FFP.canPick(L, db, "t0", firstPick);
  assert.equal(taken.ok, false);
  assert.match(taken.reason, /already on/);
  const rb = FFP.canPick(L, db, "t0", bestAvailable(L, db, "RB"));
  assert.equal(rb.ok, false);
  assert.match(rb.reason, /K|DEF/);
  assert.throws(() => FFP.makePick(L, db, bestAvailable(L, db, "RB")));
  assert.equal(FFP.canPick(L, db, "t0", bestAvailable(L, db, "K")).ok, true);
  assert.equal(FFP.canPick(L, db, "t0", bestAvailable(L, db, "DEF")).ok, true);
  FFP.makePick(L, db, bestAvailable(L, db, "K"));
  FFP.runAIPicks(L, db);
  assert.equal(FFP.canPick(L, db, "t0", bestAvailable(L, db, "QB")).ok, false, "last pick must be DEF");
  FFP.makePick(L, db, bestAvailable(L, db, "DEF"));
  FFP.runAIPicks(L, db);
  assert.equal(L.stage, "season");
  assert.equal(FFP.canPick(L, db, "t0", bestAvailable(L, db, "QB")).ok, false);
  assert.equal(FFP.currentPick(L), null);
});

test("AI picks fill every slot, respect the 2-per-position cap, and runAIPicks stops at the user", () => {
  const db = stdDb();
  const L = newLeague(db, { numTeams: 6, playoffTeams: 6, draftOrder: "custom", userPick: 4 });
  FFP.runAIPicks(L, db);
  assert.equal(L.picks.length, 3);
  assert.equal(FFP.currentPick(L).teamId, "t0");
  // AI picks are the best available by avgPoints, subject to the rules.
  const pool = FFP.draftPool(db, "historical", HIST);
  assert.equal(L.picks[0].pid, pool[0].id);
  draftAll(FFP, L, db);
  assert.equal(L.stage, "season");
  assert.equal(L.week, 1);
  const all = Object.values(L.rosters).flat();
  assert.equal(all.length, 66);
  assert.equal(new Set(all).size, 66, "no player drafted twice");
  const poolIds = new Set(pool.map((p) => p.id));
  for (const t of L.teams) {
    const roster = L.rosters[t.id];
    assert.equal(roster.length, FFP.ROSTER_SIZE);
    for (const pid of roster) assert.ok(poolIds.has(pid));
    const lu = L.lineups[t.id];
    for (const s of FFP.SLOTS) assert.ok(lu[s], t.id + " fills " + s);
    assert.equal(lu.bench.length, FFP.BENCH);
    const c = {};
    roster.forEach((pid) => { c[posOf(db, pid)] = (c[posOf(db, pid)] || 0) + 1; });
    for (const p of ["QB", "TE", "K", "DEF"]) assert.ok((c[p] || 0) <= 2, t.id + " has " + c[p] + " " + p);
  }
  // Same seed and options → the same draft.
  const again = draftedLeague(db, { numTeams: 6, playoffTeams: 6, draftOrder: "custom", userPick: 4 });
  assert.deepEqual(again.picks, L.picks);
});

test("draft completes when supply is exactly one per team (league-wide legality)", () => {
  // 4 QB, TE, K, DEF for 4 teams; 44 players for 44 roster spots.
  const db = makeDb({ counts: { QB: 4, RB: 14, WR: 14, TE: 4, K: 4, DEF: 4 } });
  assert.equal(FFP.poolSummary(db, "historical", HIST).maxTeams, 4);
  const L = newLeague(db, { numTeams: 4, draftOrder: "custom", userPick: 1 });
  FFP.makePick(L, db, bestAvailable(L, db, "QB"));
  FFP.runAIPicks(L, db);
  const second = FFP.canPick(L, db, "t0", bestAvailable(L, db, "QB"));
  assert.equal(second.ok, false, "a second QB would leave another team without one");
  assert.match(second.reason, /QB/);
  draftAll(FFP, L, db);
  assert.equal(L.stage, "season");
  for (const t of L.teams) {
    const c = {};
    L.rosters[t.id].forEach((pid) => { c[posOf(db, pid)] = (c[posOf(db, pid)] || 0) + 1; });
    for (const p of ["QB", "TE", "K", "DEF"]) assert.equal(c[p], 1, t.id + " " + p);
  }
});

// ---------------------------------------------------------------------------
// Schedule and byes
// ---------------------------------------------------------------------------

test("schedule: even team count, circle-method round robin repeated", () => {
  const L = draftedLeague(stdDb(), { numTeams: 4 });
  const ids = L.teams.map((t) => t.id);
  assert.equal(Object.keys(L.schedule).length, L.regularWeeks);
  const pairs = new Set();
  for (let w = 1; w <= L.regularWeeks; w++) {
    const games = L.schedule[w];
    assert.equal(games.length, 2);
    const teams = games.flatMap((g) => [g.home, g.away]).sort();
    assert.deepEqual(teams, ids.slice().sort(), "every team plays once in week " + w);
    if (w <= 3) games.forEach((g) => pairs.add([g.home, g.away].sort().join()));
    if (w > 3) assert.deepEqual(games, L.schedule[w - 3], "round robin repeats in order");
  }
  assert.equal(pairs.size, 6, "every pair meets once per cycle");
});

test("schedule: odd team count leaves one team idle each week", () => {
  const L = draftedLeague(stdDb(), { numTeams: 5 });
  const idle = {};
  const pairs = new Set();
  for (let w = 1; w <= L.regularWeeks; w++) {
    const games = L.schedule[w];
    assert.equal(games.length, 2);
    const playing = games.flatMap((g) => [g.home, g.away]);
    assert.equal(new Set(playing).size, 4);
    const out = L.teams.map((t) => t.id).filter((id) => !playing.includes(id));
    assert.equal(out.length, 1);
    if (w <= 5) {
      idle[out[0]] = (idle[out[0]] || 0) + 1;
      games.forEach((g) => pairs.add([g.home, g.away].sort().join()));
    }
  }
  assert.deepEqual(Object.values(idle), [1, 1, 1, 1, 1], "each team idle once per cycle");
  assert.equal(pairs.size, 10, "every pair meets once per cycle");
  // The idle team draws nothing (checked weekly by playChecked).
  playChecked(FFP, L, stdDb());
  assert.equal(L.stage, "complete");
});

test("byes: exactly one per rostered player, drawn from weeks 2..regularWeeks", () => {
  for (const [n, p] of [[6, 6], [4, 4], [2, 2]]) {
    const L = draftedLeague(stdDb(), { numTeams: n, playoffTeams: p, seed: "byes" + n });
    const rostered = Object.values(L.rosters).flat();
    assert.deepEqual(Object.keys(L.byes).sort(), rostered.slice().sort());
    for (const pid of rostered) {
      assert.ok(Number.isInteger(L.byes[pid]));
      assert.ok(L.byes[pid] >= 2 && L.byes[pid] <= L.regularWeeks, pid + " bye " + L.byes[pid]);
    }
    assert.ok(new Set(Object.values(L.byes)).size > 3, "byes are spread over several weeks");
    const before = JSON.parse(JSON.stringify(L.byes));
    const stats = playChecked(FFP, L, stdDb());
    assert.deepEqual(L.byes, before, "byes are never reassigned");
    // Even team counts: every player sat exactly one bye in the regular season.
    for (const pid of rostered) assert.equal(stats.byeLines[pid], 1, pid);
    for (let w = L.regularWeeks + 1; w <= 17; w++) {
      for (const m of L.results[w].matchups) {
        for (const tid of [m.home, m.away]) assert.ok(m.lines[tid].concat(m.bench[tid]).every((l) => !l.bye));
      }
    }
    for (const m of L.results[1].matchups) {
      for (const tid of [m.home, m.away]) assert.ok(m.lines[tid].concat(m.bench[tid]).every((l) => !l.bye), "no bye in week 1");
    }
  }
});

// ---------------------------------------------------------------------------
// Lineups
// ---------------------------------------------------------------------------

test("setLineup validates positions and the exact roster; autoLineup prefers players not on bye", () => {
  const db = stdDb();
  const L = draftedLeague(db, { numTeams: 4 });
  const lu = JSON.parse(JSON.stringify(L.lineups.t0));
  const rosterK = lu.K;
  assert.throws(() => FFP.setLineup(L, db, "t0", Object.assign({}, lu, { QB: rosterK, K: lu.QB })), /can't start/);
  const other = L.rosters.t1[0];
  assert.throws(() => FFP.setLineup(L, db, "t0", Object.assign({}, lu, { bench: [other].concat(lu.bench.slice(1)) })),
    /roster/);
  assert.throws(() => FFP.setLineup(L, db, "t0", Object.assign({}, lu, { bench: lu.bench.slice(1) })), /bench/);
  assert.throws(() => FFP.setLineup(L, db, "t0", Object.assign({}, lu, { bench: [lu.QB].concat(lu.bench.slice(1)) })),
    /two slots/);
  // A legal swap: put a bench RB/WR/TE in FLEX.
  const benchFlex = lu.bench.find((pid) => ["RB", "WR", "TE"].includes(posOf(db, pid)));
  const swapped = Object.assign({}, lu, { FLEX: benchFlex, bench: lu.bench.map((p) => (p === benchFlex ? lu.FLEX : p)) });
  FFP.setLineup(L, db, "t0", swapped);
  assert.deepEqual(L.lineups.t0, swapped);

  // autoLineup with byes: put every starter-capable player at each position on bye in turn.
  const roster = L.rosters.t1;
  for (let w = 2; w <= L.regularWeeks; w++) {
    const auto = FFP.autoLineup(L, db, "t1", w);
    const onBye = (pid) => L.byes[pid] === w;
    for (const s of FFP.SLOTS) {
      if (onBye(auto[s])) {
        const allowed = FFP.SLOT_POSITIONS[s];
        assert.ok(!auto.bench.some((b) => !onBye(b) && allowed.includes(posOf(db, b))),
          "a playable bench player could have started at " + s + " in week " + w);
      }
    }
    assert.deepEqual(Object.values(auto).flat().filter(Boolean).sort(), roster.slice().sort());
  }
});

test("the user's lineup is used as saved, even with a starter on bye", () => {
  const db = stdDb();
  const L = draftedLeague(db, { numTeams: 4, seed: "saved" });
  // Find the week the user's QB has a bye and play up to it with the QB starting.
  const qb = L.lineups.t0.QB;
  const byeWeek = L.byes[qb];
  playChecked(FFP, L, db, { untilWeek: byeWeek - 1 });
  assert.equal(L.week, byeWeek);
  assert.equal(L.lineups.t0.QB, qb);
  FFP.playWeek(L, db);
  const m = L.results[byeWeek].matchups.find((x) => x.home === "t0" || x.away === "t0");
  const line = m.lines.t0.find((l) => l.slot === "QB");
  assert.deepEqual(line, { slot: "QB", pid: qb, gameKey: null, points: 0, bye: true });
});

// ---------------------------------------------------------------------------
// Draws, results, standings, playoffs
// ---------------------------------------------------------------------------

test("draws: one consumed game per result, never the same game twice, byes consume nothing", () => {
  const db = stdDb();
  const L = draftedLeague(db, { numTeams: 6, playoffTeams: 6, seed: "draws" });
  const stats = playChecked(FFP, L, db);
  assert.equal(stats.weeks, 17);
  assert.equal(L.stage, "complete");
  // Total consumption equals the number of non-bye lines across all results.
  let lines = 0;
  for (let w = 1; w <= 17; w++) {
    for (const m of L.results[w].matchups) {
      for (const tid of [m.home, m.away]) lines += m.lines[tid].concat(m.bench[tid]).filter((l) => !l.bye).length;
    }
  }
  const consumed = Object.values(L.consumed).reduce((a, c) => a + c.length, 0);
  assert.equal(consumed, lines);
  assert.equal(stats.draws, lines);
  // Each player consumed at most 16 games (17 weeks minus a bye).
  for (const c of Object.values(L.consumed)) assert.ok(c.length <= 16);
  // A played week is never drawn again.
  const snapshot = JSON.stringify(L);
  L.stage = "season"; L.week = 3;
  assert.throws(() => FFP.playWeek(L, db), /already been played/);
  assert.equal(JSON.stringify(Object.assign(JSON.parse(snapshot), { stage: "season", week: 3 })), JSON.stringify(L));
});

test("draws are reproducible from the seed and differ between seeds", () => {
  const db = stdDb();
  const a = draftedLeague(db, { numTeams: 4, seed: "same" });
  const b = draftedLeague(db, { numTeams: 4, seed: "same" });
  const c = draftedLeague(db, { numTeams: 4, seed: "other" });
  for (let i = 0; i < 3; i++) { FFP.playWeek(a, db); FFP.playWeek(b, db); FFP.playWeek(c, db); }
  assert.deepEqual(a.results, b.results);
  assert.deepEqual(a.consumed, b.consumed);
  assert.notDeepEqual(a.consumed, c.consumed);
});

test("standings rank by wins + ½·ties, then points for, then team order", () => {
  const mk = (home, away, hs, as) => ({ home, away, homeScore: hs, awayScore: as,
    winner: hs > as ? home : as > hs ? away : null, lines: {}, bench: {} });
  const league = {
    teams: [{ id: "t0" }, { id: "t1" }, { id: "t2" }, { id: "t3" }],
    regularWeeks: 2,
    results: {
      1: { matchups: [mk("t0", "t1", 100.2, 100.2), mk("t2", "t3", 90, 80)] },
      2: { matchups: [mk("t0", "t2", 60.1, 50), mk("t1", "t3", 70, 70)] },
      3: { matchups: [mk("t3", "t2", 500, 0)] } // playoff week: ignored
    }
  };
  // t0 1-0-1 (1.5); t1 0-0-2 (1.0, pf 170.2); t2 1-1-0 (1.0, pf 140); t3 0-1-1 (0.5)
  assert.deepEqual(FFP.standings(league), [
    { teamId: "t0", w: 1, l: 0, t: 1, pf: 160.3, pa: 150.2 },
    { teamId: "t1", w: 0, l: 0, t: 2, pf: 170.2, pa: 170.2 },
    { teamId: "t2", w: 1, l: 1, t: 0, pf: 140, pa: 140.1 },
    { teamId: "t3", w: 0, l: 1, t: 1, pf: 150, pa: 160 }
  ]);
  // Full ties fall back to team order (not id order).
  const tied = { teams: [{ id: "t2" }, { id: "t0" }, { id: "t1" }], regularWeeks: 3,
    results: { 1: { matchups: [mk("t0", "t1", 10, 10)] }, 2: { matchups: [mk("t2", "t0", 10, 10)] },
      3: { matchups: [mk("t1", "t2", 10, 10)] } } };
  assert.deepEqual(FFP.standings(tied).map((r) => r.teamId), ["t2", "t0", "t1"]);
});

function checkBracket(L) {
  const seeds = L.playoffs.seeds;
  assert.deepEqual(seeds, FFP.standings(L).slice(0, L.playoffTeams).map((r) => r.teamId));
  const winner = (w, i) => L.results[w].matchups[i].winner;
  const pair = (w, i) => [L.schedule[w][i].home, L.schedule[w][i].away];
  const s = (n) => seeds[n - 1];
  const higher = (a, b) => (seeds.indexOf(a) < seeds.indexOf(b) ? [a, b] : [b, a]);
  for (let w = L.regularWeeks + 1; w <= 17; w++) {
    for (const m of L.results[w].matchups) {
      const hs = H(m.homeScore), as = H(m.awayScore);
      const expected = hs > as ? m.home : as > hs ? m.away : (seeds.indexOf(m.home) < seeds.indexOf(m.away) ? m.home : m.away);
      assert.equal(m.winner, expected, "playoff winner week " + w);
      assert.ok(m.playoff);
    }
  }
  if (L.playoffTeams === 6) {
    assert.equal(L.regularWeeks, 14);
    assert.deepEqual(pair(15, 0), [s(3), s(6)]);
    assert.deepEqual(pair(15, 1), [s(4), s(5)]);
    assert.deepEqual(pair(16, 0), [s(1), winner(15, 1)]);
    assert.deepEqual(pair(16, 1), [s(2), winner(15, 0)]);
    assert.deepEqual(pair(17, 0), higher(winner(16, 0), winner(16, 1)));
  } else if (L.playoffTeams === 4) {
    assert.equal(L.regularWeeks, 15);
    assert.ok(!L.schedule[15][0].playoff);
    assert.deepEqual(pair(16, 0), [s(1), s(4)]);
    assert.deepEqual(pair(16, 1), [s(2), s(3)]);
    assert.deepEqual(pair(17, 0), higher(winner(16, 0), winner(16, 1)));
  } else {
    assert.equal(L.regularWeeks, 16);
    assert.deepEqual(pair(17, 0), [s(1), s(2)]);
  }
  assert.equal(L.schedule[17].length, 1);
  assert.equal(L.champion, winner(17, 0));
}

test("playoff brackets for 6, 4 and 2 teams", () => {
  const db = stdDb();
  for (const [n, p] of [[6, 6], [6, 4], [5, 4], [4, 4], [4, 2], [3, 4], [2, 2]]) {
    const L = draftedLeague(db, { numTeams: n, playoffTeams: p, seed: "bracket" + n + p });
    // Before the regular season ends there is no playoff schedule.
    assert.equal(L.schedule[L.regularWeeks + 1], undefined);
    playChecked(FFP, L, db);
    assert.equal(L.stage, "complete");
    assert.ok(L.champion);
    checkBracket(L);
    // Eliminated and resting teams had no matchup (playChecked asserted they drew nothing).
    if (L.playoffTeams === 6) {
      const wk15 = L.results[15].matchups.flatMap((m) => [m.home, m.away]);
      assert.ok(!wk15.includes(L.playoffs.seeds[0]) && !wk15.includes(L.playoffs.seeds[1]), "seeds 1–2 rest in week 15");
    }
    assert.equal(L.week, 17);
    assert.throws(() => FFP.playWeek(L, db), /over/);
  }
});

test("ties: all-zero data ties every game; standings fall to team order and playoff ties go to the higher seed", () => {
  const db = makeDb({ counts: STD_COUNTS, zero: true });
  for (const p of [6, 4, 2]) {
    const L = draftedLeague(db, { numTeams: 6, playoffTeams: p, seed: "zero" });
    playChecked(FFP, L, db);
    const st = FFP.standings(L);
    assert.deepEqual(st.map((r) => r.teamId), ["t0", "t1", "t2", "t3", "t4", "t5"]);
    assert.ok(st.every((r) => r.w === 0 && r.l === 0 && r.t === L.regularWeeks && r.pf === 0));
    for (let w = 1; w <= L.regularWeeks; w++) assert.ok(L.results[w].matchups.every((m) => m.winner === null));
    assert.deepEqual(L.playoffs.seeds, ["t0", "t1", "t2", "t3", "t4", "t5"].slice(0, p));
    checkBracket(L);
    assert.equal(L.champion, "t0", "top seed wins every tie");
  }
});

// ---------------------------------------------------------------------------
// Free agents
// ---------------------------------------------------------------------------

test("free agents: pool minus rostered players; add/drop keeps a legal roster and consumed games", () => {
  const db = stdDb();
  const L = newLeague(db, { numTeams: 4, seed: "fa" });
  assert.throws(() => FFP.addDrop(L, db, "t0", "QB-0", "QB-1"), /between weeks/);
  draftAll(FFP, L, db);
  const fa = FFP.freeAgents(L, db);
  const rostered = new Set(Object.values(L.rosters).flat());
  assert.equal(fa.length, 72 - 44);
  assert.ok(fa.every((p) => !rostered.has(p.id) && p.remaining === p.eligibleCount));
  for (let i = 1; i < fa.length; i++) assert.ok(fa[i - 1].avgPoints >= fa[i].avgPoints);

  playChecked(FFP, L, db, { untilWeek: 3 });
  assert.equal(L.week, 4);
  const roster = L.rosters.t0.slice();
  const drop = roster.find((pid) => posOf(db, pid) === "RB");
  const dropConsumed = L.consumed[drop].slice();
  const dropBye = L.byes[drop];
  assert.ok(dropConsumed.length >= 2);
  const add = FFP.freeAgents(L, db).find((p) => p.pos === "RB").id;

  // Illegal moves leave the league untouched.
  const before = JSON.stringify(L);
  const onlyQB = roster.filter((pid) => posOf(db, pid) === "QB");
  if (onlyQB.length === 1) {
    assert.throws(() => FFP.addDrop(L, db, "t0", add, onlyQB[0]), /QB/);
  }
  const onlyK = roster.filter((pid) => posOf(db, pid) === "K");
  if (onlyK.length === 1) assert.throws(() => FFP.addDrop(L, db, "t0", add, onlyK[0]), /K/);
  assert.throws(() => FFP.addDrop(L, db, "t0", L.rosters.t1[0], drop), /already on a roster/);
  assert.throws(() => FFP.addDrop(L, db, "t0", add, L.rosters.t1[0]), /isn't on this roster/);
  assert.throws(() => FFP.addDrop(L, db, "t0", "nobody", drop), /pool/);
  assert.equal(JSON.stringify(L), before);

  FFP.addDrop(L, db, "t0", add, drop);
  assert.equal(L.rosters.t0.length, 11);
  assert.ok(L.rosters.t0.includes(add) && !L.rosters.t0.includes(drop));
  FFP.setLineup(L, db, "t0", L.lineups.t0); // still a valid lineup
  assert.ok(Object.values(L.lineups.t0).flat().includes(add));
  assert.ok(L.byes[add] >= 5 && L.byes[add] <= L.regularWeeks, "new bye after the current week");
  assert.deepEqual(L.consumed[drop], dropConsumed, "consumed games stay with the player");
  const back = FFP.freeAgents(L, db).find((p) => p.id === drop);
  assert.equal(back.remaining, back.eligibleCount - dropConsumed.length);
  assert.deepEqual(L.transactions, [{ week: 4, teamId: "t0", add, drop }]);

  // Another team picks the dropped player up: same bye, earlier games stay consumed.
  const t1drop = L.rosters.t1.find((pid) => posOf(db, pid) === "RB" && !Object.values(L.lineups.t1).slice(0, 7).includes(pid)) ||
    L.rosters.t1.find((pid) => posOf(db, pid) === "WR");
  FFP.addDrop(L, db, "t1", drop, t1drop);
  assert.equal(L.byes[drop], dropBye, "bye never reassigned");
  playChecked(FFP, L, db);
  assert.deepEqual(L.consumed[drop].slice(0, dropConsumed.length), dropConsumed);
  assert.equal(L.stage, "complete");
  assert.throws(() => FFP.addDrop(L, db, "t0", t1drop, add), /between weeks/);
});

test("free agents added late get a bye only if a regular week after the current one remains", () => {
  const db = stdDb();
  const L = draftedLeague(db, { numTeams: 4, seed: "late" });
  playChecked(FFP, L, db, { untilWeek: L.regularWeeks - 2 });
  assert.equal(L.week, L.regularWeeks - 1);
  // A free agent who has never been on a roster (so has no bye yet).
  const wr = () => FFP.freeAgents(L, db).find((p) => p.pos === "WR" && !(p.id in L.byes)).id;
  const dropWR = (tid) => L.rosters[tid].filter((pid) => posOf(db, pid) === "WR")[1] ||
    L.rosters[tid].filter((pid) => posOf(db, pid) === "RB")[1];
  const a = wr();
  FFP.addDrop(L, db, "t0", a, dropWR("t0"));
  assert.equal(L.byes[a], L.regularWeeks, "only the last regular week remains after the current one");
  FFP.playWeek(L, db);
  const b = wr();
  FFP.addDrop(L, db, "t1", b, dropWR("t1"));
  assert.ok(Object.prototype.hasOwnProperty.call(L.byes, b));
  assert.equal(L.byes[b], null, "no regular week left after the current one: no bye");
  playChecked(FFP, L, db);
  assert.equal(L.stage, "complete");
});

test("dropping a starter for a player who can't fill that slot moves a bench player in", () => {
  // Spare kickers, so one is still a free agent after AI teams draft their backups.
  const db = makeDb({ counts: Object.assign({}, STD_COUNTS, { K: 12 }), histOnly: STD_HIST_ONLY });
  const L = draftedLeague(db, { numTeams: 4, seed: "swap" });
  // Drop a team's FLEX starter for a kicker: a flex-capable bench player must move into FLEX.
  const team = L.teams.find((t) => L.lineups[t.id].bench.some((pid) => ["RB", "WR", "TE"].includes(posOf(db, pid))));
  assert.ok(team, "some team has a flex-capable bench player");
  const lu = JSON.parse(JSON.stringify(L.lineups[team.id]));
  const k = FFP.freeAgents(L, db).find((p) => p.pos === "K").id;
  FFP.addDrop(L, db, team.id, k, lu.FLEX);
  const after = L.lineups[team.id];
  assert.ok(lu.bench.includes(after.FLEX), "a bench player moved into FLEX");
  assert.ok(after.bench.includes(k));
  for (const s of ["QB", "RB", "WR", "TE", "DEF", "K"]) assert.equal(after[s], lu[s], s + " unchanged");
  FFP.setLineup(L, db, team.id, after);
});

// ---------------------------------------------------------------------------
// Save / load
// ---------------------------------------------------------------------------

test("serialize/deserialize round trip preserves everything; unknown versions are rejected", () => {
  const db = stdDb();
  const L = draftedLeague(db, { numTeams: 5, seed: "save" });
  for (let i = 0; i < 6; i++) FFP.playWeek(L, db);
  const text = FFP.serialize(L);
  const parsed = JSON.parse(text);
  assert.equal(parsed.saveVersion, 1);
  assert.equal(parsed.engineVersion, "proto-1");
  const back = FFP.deserialize(text);
  assert.deepEqual(back, L);
  assert.equal(FFP.serialize(back), text);
  assert.notEqual(back, L);
  // Draft-stage leagues round-trip too.
  const D = newLeague(db, { numTeams: 4 });
  FFP.runAIPicks(D, db);
  assert.deepEqual(FFP.deserialize(FFP.serialize(D)), D);

  assert.throws(() => FFP.deserialize(JSON.stringify(Object.assign(parsed, { saveVersion: 2 }))), /save version 2/);
  assert.throws(() => FFP.deserialize(JSON.stringify({ saveVersion: 1, engineVersion: "proto-9", league: {} })),
    /engine version/);
  assert.throws(() => FFP.deserialize("{not json"), /valid JSON/);
  assert.throws(() => FFP.deserialize(JSON.stringify({ hello: 1 })), /isn't a/);
});

test("continuing after save/load gives the same season as never saving", () => {
  const db = stdDb();
  const opts = { numTeams: 6, playoffTeams: 6, seed: "continue", draftOrder: "custom", userPick: 2 };
  // Reference: never saved.
  const ref = draftedLeague(db, opts);
  while (ref.stage === "season") FFP.playWeek(ref, db);
  // Saved mid-draft, then saved and reloaded before every week.
  let L = newLeague(db, opts);
  FFP.runAIPicks(L, db);
  FFP.makePick(L, db, FFP.aiPick(L, db, "t0"));
  L = FFP.deserialize(FFP.serialize(L));
  draftAll(FFP, L, db);
  while (L.stage === "season") {
    L = FFP.deserialize(FFP.serialize(L));
    FFP.playWeek(L, db);
  }
  assert.equal(FFP.serialize(L), FFP.serialize(ref));
  // And one save/load at week 8 with a free-agent move on both copies.
  const a = draftedLeague(db, opts);
  for (let i = 0; i < 7; i++) FFP.playWeek(a, db);
  const b = FFP.deserialize(FFP.serialize(a));
  for (const x of [a, b]) {
    const fa = FFP.freeAgents(x, db)[0];
    const add = fa.id;
    const drop = x.rosters.t0.filter((pid) => posOf(db, pid) === fa.pos).pop();
    FFP.addDrop(x, db, "t0", add, drop);
    while (x.stage === "season") FFP.playWeek(x, db);
  }
  assert.deepEqual(b, a);
});

// ---------------------------------------------------------------------------
// Reveal
// ---------------------------------------------------------------------------

test("revealTimeline: highlights add up exactly to the final, one per starter who played", () => {
  const db = stdDb();
  const L = draftedLeague(db, { numTeams: 5, playoffTeams: 4, seed: "reveal" });
  while (L.stage === "season") FFP.playWeek(L, db);
  let checked = 0;
  for (let w = 1; w <= 17; w++) {
    L.results[w].matchups.forEach((m, i) => {
      const r = FFP.revealTimeline(L, db, w, i);
      assert.deepEqual(FFP.revealTimeline(L, db, w, i), r, "deterministic");
      assert.equal(r.final.homeScore, m.homeScore);
      assert.equal(r.final.awayScore, m.awayScore);
      assert.equal(r.final.winner, m.winner);
      const sum = { [m.home]: 0, [m.away]: 0 };
      let q = 1;
      for (const h of r.highlights) {
        assert.ok(h.quarter >= 1 && h.quarter <= 4);
        assert.ok(h.quarter >= q, "highlights are in quarter order");
        q = h.quarter;
        sum[h.teamId] += H(h.points);
        assert.equal(h.homeScore, sum[m.home] / 100);
        assert.equal(h.awayScore, sum[m.away] / 100);
      }
      assert.equal(sum[m.home], H(m.homeScore), "home highlights sum to the final");
      assert.equal(sum[m.away], H(m.awayScore), "away highlights sum to the final");
      for (const tid of [m.home, m.away]) {
        const played = m.lines[tid].filter((l) => !l.bye).map((l) => l.pid).sort();
        assert.deepEqual(r.highlights.filter((h) => h.teamId === tid).map((h) => h.pid).sort(), played);
        const side = tid === m.home ? r.vs.home : r.vs.away;
        assert.equal(side.teamId, tid);
        assert.deepEqual(side.starters.map((s) => s.slot), [...FFP.SLOTS]);
        for (const s of side.starters) {
          assert.deepEqual(Object.keys(s).sort(), ["bye", "name", "pid", "pos", "season", "slot"], "VS shows only the season");
        }
        r.final.lines[tid].forEach((l, k) => {
          const stored = m.lines[tid][k];
          assert.equal(l.pid, stored.pid);
          assert.equal(l.points, stored.points);
          assert.equal(side.starters[k].season, l.game ? l.game.season : null);
          if (l.bye) {
            assert.equal(l.game, null);
            assert.deepEqual(l.parts, []);
          } else {
            assert.equal(l.game.key, stored.gameKey);
            for (const f of ["date", "team", "opp", "home_away", "team_game", "result", "team_score", "opp_score"]) {
              assert.ok(f in l.game, f);
            }
            assert.equal(l.parts.reduce((a, p) => a + H(p.points), 0), H(l.points));
          }
        });
        assert.equal(r.final.bench[tid].length, FFP.BENCH);
        assert.ok(r.final.bench[tid].every((b, k) => b.pid === m.bench[tid][k].pid && b.slot === "BN"));
      }
      checked++;
    });
  }
  assert.ok(checked > 30);
  assert.throws(() => FFP.revealTimeline(L, db, 18, 0), /hasn't been played/);
  assert.throws(() => FFP.revealTimeline(L, db, 1, 9), /No matchup/);
});

// ---------------------------------------------------------------------------
// Regressions from the review
// ---------------------------------------------------------------------------

// A pool big enough for 16 teams in both modes.
let BIG_DB = null;
function bigDb() {
  if (!BIG_DB) BIG_DB = makeDb({ counts: { QB: 34, RB: 40, WR: 40, TE: 34, K: 34, DEF: 34 }, games: 18 });
  return BIG_DB;
}

function gamesPlayed(L) {
  const n = {};
  L.teams.forEach((t) => { n[t.id] = 0; });
  for (let w = 1; w <= L.regularWeeks; w++) L.schedule[w].forEach((m) => { n[m.home]++; n[m.away]++; });
  return n;
}

test("schedule (odd counts): the user is never idle in week 1 and never plays fewer games than anyone", () => {
  const db = bigDb();
  for (const n of [3, 5, 7, 9, 11, 13, 15]) {
    for (const p of [2, 4, 6]) {
      for (const seed of ["odd-a", "odd-b"]) {
        const L = draftedLeague(db, { numTeams: n, playoffTeams: p, seed });
        assert.equal(L.numTeams, n);
        const ids = L.teams.map((t) => t.id);
        const playing1 = L.schedule[1].flatMap((m) => [m.home, m.away]);
        assert.ok(playing1.includes(L.userTeamId), `n=${n} p=${p} ${seed}: the user plays in week 1`);
        const games = gamesPlayed(L);
        const counts = Object.values(games);
        const most = Math.max(...counts);
        assert.equal(games[L.userTeamId], most, `n=${n} p=${p} ${seed}: user ${games[L.userTeamId]} games, most ${most}`);
        assert.ok(most - Math.min(...counts) <= 1, `n=${n} p=${p}: game counts differ by at most one`);
        // Still a circle-method round robin: every pair meets once in the first cycle, one idle team a week.
        const pairs = new Set();
        for (let w = 1; w <= Math.min(n, L.regularWeeks); w++) {
          const pl = L.schedule[w].flatMap((m) => [m.home, m.away]);
          assert.equal(new Set(pl).size, n - 1, "one idle team in week " + w);
          L.schedule[w].forEach((m) => pairs.add([m.home, m.away].sort().join()));
        }
        if (L.regularWeeks >= n) assert.equal(pairs.size, n * (n - 1) / 2, "every pair meets once per cycle");
        for (let w = n + 1; w <= L.regularWeeks; w++) {
          const key = (ms) => ms.map((m) => [m.home, m.away].sort().join()).sort().join(";");
          assert.equal(key(L.schedule[w]), key(L.schedule[w - n]), "pairings repeat in order");
        }
        assert.ok(ids.every((id) => games[id] > 0));
      }
    }
  }
  // Which computer team sits out week 1 depends on the seed.
  const idleIn1 = new Set();
  for (const seed of ["i1", "i2", "i3", "i4", "i5", "i6"]) {
    const L = draftedLeague(db, { numTeams: 7, playoffTeams: 4, seed });
    const pl = L.schedule[1].flatMap((m) => [m.home, m.away]);
    idleIn1.add(L.teams.map((t) => t.id).find((id) => !pl.includes(id)));
  }
  assert.ok(idleIn1.size > 1, "the week-1 idle team varies with the seed");
  assert.ok(!idleIn1.has("t0"));
});

// Kicker games for one player across two seasons. `split(season, fgm)` says whether the distance split is known.
function kickerPlayer(id, seasons, split) {
  const games = [];
  let i = 0;
  for (const season of seasons) {
    for (let j = 0; j < 10; j++, i++) {
      const fgm = j % 3 === 0 ? 0 : 1 + (j % 2);
      const known = split(season, fgm);
      games.push(Object.assign(gameBase(id, i), {
        season, date: `${season}-10-${String(1 + j).padStart(2, "0")}`, game_id: `${season}10${String(1 + j).padStart(2, "0")}-${id}`,
        fgm, fga: fgm + 1, fg_missed: 1, fgm_0_39: known ? fgm : null, fgm_40_49: known ? 0 : null,
        fgm_50p: known ? 0 : null, xpm: 2, xpa: 2, xp_missed: 0
      }, ZERO_K_OFF));
    }
  }
  return { player: { id, name: "Kicker " + id, pos: "K", hof: false, legend: false, first: seasons[0], last: seasons[seasons.length - 1] }, games };
}

test("strict kickers: a season whose distance splits are known only for no-field-goal games isn't drawable", () => {
  // 1990: splits known for every game. 1985: known only when no field goal was made (the pre-1999 pattern).
  // K-c never has a split: no distance data at all doesn't make a season skewed.
  const pattern = (season, fgm) => season === 1990 || fgm === 0;
  const db = makeDb({ counts: {}, extraPlayers: [
    kickerPlayer("K-a", [1985, 1990], pattern),
    kickerPlayer("K-b", [1985, 1990], pattern),
    kickerPlayer("K-c", [1990], () => false)
  ] });
  assert.deepEqual(db.fgDistanceSkewedSeasons, [1985]);
  const strict = FFP.eligibleGames(db, "K-a", "strict", HIST);
  assert.equal(strict.length, 10);
  assert.ok(strict.every((g) => g.season === 1990), "only the unskewed season is drawable in Strict");
  // The 1985 no-field-goal games are complete and still scoreable; they just aren't drawn.
  const skewedGame = db.gamesByPid["K-a"].find((g) => g.season === 1985 && g.fgm === 0);
  assert.equal(FFP.isEligible(skewedGame, "K", "strict", HIST), true);
  assert.equal(FFP.scoreGame(skewedGame, "K", "strict", HIST).total, 1);
  // Historical (flat field goals) uses every season.
  assert.equal(FFP.eligibleGames(db, "K-a", "historical", HIST).length, 20);
  assert.equal(FFP.eligibleGames(db, "K-c", "strict", HIST).length, 0);
  // No kicker reaches 16 drawable Strict games, so the Strict pool has no kickers.
  assert.equal(FFP.poolSummary(db, "strict", HIST).counts.K, 0);
  assert.equal(FFP.poolSummary(db, "historical", HIST).counts.K, 2, "K-a and K-b have 20 games each; K-c has 10");
  // Fully known seasons are never skewed.
  const all = makeDb({ counts: {}, extraPlayers: [kickerPlayer("K-d", [1985, 1990], () => true)] });
  assert.deepEqual(all.fgDistanceSkewedSeasons, []);
  assert.equal(FFP.eligibleGames(all, "K-d", "strict", HIST).length, 20);
});

test("AI drafting keeps a backup at all but one position, and breaks the QB/TE/K/DEF cap only when forced", () => {
  const db = bigDb();
  for (const mode of ["historical", "strict"]) {
    const L = draftedLeague(db, { numTeams: 8, playoffTeams: 4, mode, seed: "bench-" + mode });
    for (const t of L.teams) {
      const c = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
      L.rosters[t.id].forEach((pid) => { c[posOf(db, pid)]++; });
      assert.ok(Object.values(c).every((x) => x >= 1 && x <= 2), t.id + " " + JSON.stringify(c));
      assert.equal(Object.values(c).filter((x) => x === 1).length, 1, t.id + " has one position without a backup");
    }
    // A bye costs an AI team a starter at most once a season: autoLineup only starts a player on bye when
    // nobody else on the roster can play that slot.
    // (Before this fix every AI team had a lone TE, K and DEF: at least three bye starts a season.)
    const forced = {};
    // The user's lineup is used as saved, so set it the way an AI team's is set.
    playChecked(FFP, L, db, { untilWeek: L.regularWeeks, beforeWeek: (lg, w) => FFP.autoLineup(lg, db, lg.userTeamId, w) });
    for (let w = 1; w <= L.regularWeeks; w++) {
      for (const m of L.results[w].matchups) {
        for (const tid of [m.home, m.away]) forced[tid] = (forced[tid] || 0) + m.lines[tid].filter((l) => l.bye).length;
      }
    }
    const total = Object.values(forced).reduce((a, b) => a + b, 0);
    assert.ok(Object.values(forced).every((x) => x <= 2), mode + ": bye starts per team " + JSON.stringify(forced));
    assert.ok(total < 2 * L.numTeams, mode + ": bye starts across the league " + total);
  }

  // Forced: two teams must take all 22 players, 10 of them defenses, so a third DEF is unavoidable.
  const tight = makeDb({ counts: { QB: 2, RB: 3, WR: 3, TE: 2, K: 2, DEF: 10 } });
  const T = newLeague(tight, { numTeams: 2, playoffTeams: 2, seed: "forced" });
  let thirds = 0;
  while (T.stage === "draft") {
    const cp = FFP.currentPick(T);
    const pid = FFP.aiPick(T, tight, cp.teamId);
    const pos = posOf(tight, pid);
    const have = T.rosters[cp.teamId].filter((x) => posOf(tight, x) === pos).length;
    if (["QB", "TE", "K", "DEF"].includes(pos) && have >= 2) {
      thirds++;
      // Only when nothing within the cap was legal.
      const own = (p) => T.rosters[cp.teamId].filter((x) => posOf(tight, x) === p).length;
      const alternatives = FFP.freeAgents(T, tight).filter((p) => !(["QB", "TE", "K", "DEF"].includes(p.pos) && own(p.pos) >= 2))
        .filter((p) => FFP.canPick(T, tight, cp.teamId, p.id).ok);
      assert.deepEqual(alternatives.map((p) => p.id), [], "a capped-legal pick existed for " + cp.teamId);
    }
    FFP.makePick(T, tight, pid);
  }
  assert.ok(thirds > 0, "this pool forces at least one third DEF");
});

test("a save remembers its data build; replaying after the data was revised keeps the stored score", () => {
  const db1 = stdDb();
  assert.equal(db1.dataVersion, null, "fixtures carry no data version");
  const tagged = (version, tweak) => {
    const players = db1.players.map((p) => Object.assign({}, p));
    const games = {};
    for (const pos of POS) {
      const list = Object.values(db1.gamesByPid).flat().filter((g) => db1.playersById[g.pid].pos === pos)
        .map((g) => { const o = Object.assign({}, g); delete o.key; return o; });
      games[pos] = list;
    }
    if (tweak) tweak(games);
    return FFP.loadData({ players: { version: 1, dataVersion: version, seasons: [1960, 1999], players }, games });
  };
  const dbA = tagged("aaaaaaaaaaaa");
  assert.equal(dbA.dataVersion, "aaaaaaaaaaaa");
  const L = draftedLeague(dbA, { numTeams: 4, seed: "revise" });
  assert.equal(L.dataVersion, "aaaaaaaaaaaa");
  FFP.playWeek(L, dbA);
  const saved = FFP.deserialize(FFP.serialize(L));
  assert.equal(saved.dataVersion, "aaaaaaaaaaaa");

  const m = saved.results[1].matchups[0];
  const lines = m.lines[m.home].filter((l) => !l.bye);
  const [changed, gone, unscoreable] = lines;
  const kept = lines[3];
  const posOfLine = (l) => dbA.playersById[l.pid].pos;
  const dbB = tagged("bbbbbbbbbbbb", (games) => {
    const find = (l) => games[posOfLine(l)].find((g) => g.pid + "|" + g.game_id === l.gameKey);
    const g1 = find(changed);
    if (posOfLine(changed) === "DEF") g1.pts_allowed = 0; else if (posOfLine(changed) === "K") g1.xpm += 3; else g1.rush_td += 1;
    const g2 = find(gone);
    games[posOfLine(gone)] = games[posOfLine(gone)].filter((g) => g !== g2);
    const g3 = find(unscoreable);
    g3.ret_td = null;
    if (posOfLine(unscoreable) === "K") { g3.fgm = null; g3.fgm_0_39 = null; }
  });
  const r = FFP.revealTimeline(saved, dbB, 1, 0);
  const byPid = {};
  r.final.lines[m.home].forEach((l) => { byPid[l.pid] = l; });
  for (const l of [changed, gone, unscoreable]) {
    const shown = byPid[l.pid];
    assert.equal(shown.points, l.points, "the stored score stands for " + l.pid);
    assert.equal(shown.dataChanged, true, l.pid + " is flagged");
    assert.deepEqual(shown.parts, [], "no breakdown that doesn't add up");
  }
  assert.notEqual(byPid[changed.pid].currentPoints, changed.points);
  assert.equal(byPid[gone.pid].game, null);
  assert.equal(byPid[gone.pid].currentPoints, null);
  assert.equal(byPid[unscoreable.pid].currentPoints, null);
  assert.equal(byPid[kept.pid].dataChanged, false);
  assert.equal(byPid[kept.pid].parts.reduce((a, p) => a + H(p.points), 0), H(kept.points));
  assert.equal(r.final.homeScore, m.homeScore);
  const sum = r.highlights.filter((h) => h.teamId === m.home).reduce((a, h) => a + H(h.points), 0);
  assert.equal(sum, H(m.homeScore), "highlights still add up to the stored final");
  // Unchanged data: nothing is flagged.
  const same = FFP.revealTimeline(saved, dbA, 1, 0);
  for (const tid of [m.home, m.away]) assert.ok(same.final.lines[tid].every((l) => l.dataChanged === false));
});

test("deserialize rejects structurally broken saves with a clear error", () => {
  const db = stdDb();
  const L = draftedLeague(db, { numTeams: 4, seed: "shape" });
  FFP.playWeek(L, db);
  FFP.playWeek(L, db);
  const good = JSON.parse(FFP.serialize(L));
  const broken = (mutate) => { const o = JSON.parse(JSON.stringify(good)); mutate(o.league); return JSON.stringify(o); };
  assert.throws(() => FFP.deserialize(broken((lg) => { delete lg.schedule; })), /damaged or incomplete: the schedule/);
  assert.throws(() => FFP.deserialize(broken((lg) => { delete lg.lineups; })), /damaged or incomplete: the lineups/);
  assert.throws(() => FFP.deserialize(broken((lg) => { delete lg.lineups.t1.QB; })), /lineup is missing its QB/);
  assert.throws(() => FFP.deserialize(broken((lg) => { delete lg.results[1]; })), /results for week 1 are missing/);
  assert.throws(() => FFP.deserialize(broken((lg) => { delete lg.stage; })), /stage/);
  assert.throws(() => FFP.deserialize(broken((lg) => { lg.rosters.t2.pop(); })), /roster/);
  assert.throws(() => FFP.deserialize(JSON.stringify({ saveVersion: 1, engineVersion: "proto-1", league: { teams: [], rosters: {} } })),
    /damaged or incomplete: the team list/);
  // Every stage of a real league still loads.
  assert.deepEqual(FFP.deserialize(FFP.serialize(L)), L);
  const D = newLeague(db, { numTeams: 4, seed: "shape-draft" });
  assert.deepEqual(FFP.deserialize(FFP.serialize(D)), D);
  const C = draftedLeague(db, { numTeams: 5, playoffTeams: 4, seed: "shape-done" });
  while (C.stage === "season") FFP.playWeek(C, db);
  assert.deepEqual(FFP.deserialize(FFP.serialize(C)), C);
  // A save written before leagues carried a data version still loads.
  const old = JSON.parse(FFP.serialize(L));
  delete old.league.dataVersion;
  assert.equal(FFP.deserialize(JSON.stringify(old)).dataVersion, undefined);
});
