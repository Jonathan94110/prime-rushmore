// Integration test against the real data in P/data. Skips cleanly when data/players.json is missing.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const FFP = require("../src/engine.js");
const { draftAll, playChecked } = require("./invariants.js");

const DATA = path.join(__dirname, "..", "data");
const HAVE_DATA = fs.existsSync(path.join(DATA, "players.json"));
const SKIP = HAVE_DATA ? false : "data/players.json not found (run build_data.py first)";
const HIST = { historical: { includeInterceptions: false } };

let DB = null;
function db() {
  if (!DB) {
    const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
    const games = {};
    for (const pos of ["QB", "RB", "WR", "TE", "K", "DEF"]) games[pos] = read(`games_${pos.toLowerCase()}.json`);
    DB = FFP.loadData({ players: read("players.json"), games });
  }
  return DB;
}

test("real data: loads, and every player has games", { skip: SKIP }, () => {
  const d = db();
  assert.ok(d.players.length > 500, "players: " + d.players.length);
  assert.equal(d.duplicateGames, 0);
  for (const p of d.players) {
    assert.ok(["QB", "RB", "WR", "TE", "K", "DEF"].includes(p.pos), p.id);
    assert.ok(d.gamesByPid[p.id].length > 0, p.id + " has no games");
  }
  for (const pid of Object.keys(d.gamesByPid)) assert.ok(d.playersById[pid], pid + " has games but no player");
});

test("real data: Joe Montana, 1989-09-10 at IND, scores 15.42 in both modes", { skip: SKIP }, () => {
  // The repaired sheet proves fum_rec_td = 0 from the final score (source tag SCORE0), so the game is strict-eligible.
  const d = db();
  const montana = d.players.find((p) => p.name === "Joe Montana" && p.pos === "QB");
  assert.ok(montana, "Joe Montana is in players.json");
  assert.equal(montana.id, "QB-15597");
  const g = d.gamesByPid[montana.id].find((x) => x.date === "1989-09-10");
  assert.ok(g, "the 1989-09-10 game is present");
  assert.equal(g.team, "SFO");
  assert.equal(g.opp, "IND");
  assert.equal(g.pass_yds, 233);
  assert.equal(g.two_pt, 0);
  assert.equal(g.fum_rec_td, 0);
  assert.equal(g.source, "PFR+RULE2PT+SCORE0", "source is copied as-is");
  for (const mode of ["historical", "strict"]) {
    const r = FFP.scoreGame(g, "QB", mode, HIST, FFP.DEFAULT_RULES);
    assert.equal(r.total, 15.42, mode);
    assert.equal(r.parts.reduce((a, p) => a + Math.round(p.points * 100), 0), 1542);
    assert.equal(FFP.isEligible(g, "QB", mode, HIST), true, mode);
    assert.ok(FFP.eligibleGames(d, montana.id, mode, HIST).some((x) => x.key === g.key), mode);
  }
});

test("real data: data matches the repaired sheets (quarantined INTs, the 1999 PHI safety, data version)", { skip: SKIP }, () => {
  const d = db();
  assert.match(d.dataVersion, /^[0-9a-f]{12}$/);
  const game = (pid, gid) => d.gamesByPid[pid].find((x) => x.game_id === gid);
  // A disputed interception count is quarantined: blank in the sheet, so null here.
  const stl = game("DEF-cardinals", "19671008-STL-MIN");
  assert.equal(stl.def_int, null);
  assert.equal(stl.int_verified, false);
  assert.equal(stl.source, "PFR+QUARANTINE+SCORE0");
  const bos = game("DEF-patriots", "19601016-BOS-OAK");
  assert.equal(bos.def_int, null);
  // No unverified interception count survives anywhere.
  for (const pid of Object.keys(d.gamesByPid)) {
    if (d.playersById[pid].pos !== "DEF") continue;
    for (const x of d.gamesByPid[pid]) if (x.int_verified !== true) assert.equal(x.def_int, null, x.key);
  }
  // 1999-10-03 PHI at NYG: the safety belongs to Philadelphia (nflverse play-by-play).
  assert.equal(game("DEF-phi", "19991003-PHI-NYG").safeties, 1);
  assert.equal(game("DEF-nyg", "19991003-PHI-NYG").safeties, 0);
  const strict = (pid) => FFP.scoreGame(game(pid, "19991003-PHI-NYG"), "DEF", "strict", HIST, FFP.DEFAULT_RULES);
  assert.ok(strict("DEF-phi").parts.some((p) => p.stat === "safeties" && p.points === 2));
  assert.ok(!strict("DEF-nyg").parts.some((p) => p.stat === "safeties"));
});

test("real data: Strict kickers draw only from seasons with recorded field-goal distances", { skip: SKIP }, () => {
  const d = db();
  // Before 1999 the sheets know distances only for games with no field goal made.
  const skewed = [];
  for (let s = 1960; s <= 1998; s++) skewed.push(s);
  assert.deepEqual(d.fgDistanceSkewedSeasons, skewed);
  const kickers = FFP.draftPool(d, "strict", HIST).filter((p) => p.pos === "K");
  assert.ok(kickers.length >= 16, "enough Strict kickers for 16 teams: " + kickers.length);
  for (const k of kickers) {
    for (const g of FFP.eligibleGames(d, k.id, "strict", HIST)) assert.equal(g.season, 1999, g.key);
  }
});

test("real data: pool summaries for both modes", { skip: SKIP }, (t) => {
  for (const mode of ["historical", "strict"]) {
    const s = FFP.poolSummary(db(), mode, HIST);
    const pool = FFP.draftPool(db(), mode, HIST);
    assert.equal(pool.length, Object.values(s.counts).reduce((a, b) => a + b, 0));
    assert.ok(pool.every((p) => p.eligibleCount >= FFP.MIN_GAMES));
    assert.ok(s.maxTeams >= 2, mode + " maxTeams " + s.maxTeams);
    t.diagnostic(`${mode}: ${JSON.stringify(s)}`);
  }
  assert.equal(FFP.poolSummary(db(), "historical", HIST).maxTeams, 16);
  // With the repaired sheets, Strict offense covers 1960-99 and Strict also supports 16 teams.
  assert.equal(FFP.poolSummary(db(), "strict", HIST).maxTeams, 16);
});

function fullSeason(opts) {
  const d = db();
  const L = FFP.createLeague(opts, d);
  draftAll(FFP, L, d);
  assert.equal(L.stage, "season");
  for (const t of L.teams) {
    assert.equal(L.rosters[t.id].length, FFP.ROSTER_SIZE);
    for (const s of FFP.SLOTS) assert.ok(L.lineups[t.id][s], t.id + " fills " + s);
  }
  const stats = playChecked(FFP, L, d);
  assert.equal(stats.weeks, FFP.TOTAL_WEEKS);
  assert.equal(L.stage, "complete");
  assert.ok(L.champion && L.teams.some((t) => t.id === L.champion), "a champion exists");
  // Every rostered player had exactly one bye week in the regular season (even team counts).
  if (L.numTeams % 2 === 0) {
    for (const pid of Object.values(L.rosters).flat()) assert.equal(stats.byeLines[pid], 1, pid);
  }
  // Reveal adds up for every matchup.
  for (let w = 1; w <= FFP.TOTAL_WEEKS; w++) {
    L.results[w].matchups.forEach((m, i) => {
      const r = FFP.revealTimeline(L, d, w, i);
      for (const tid of [m.home, m.away]) {
        const sum = r.highlights.filter((h) => h.teamId === tid).reduce((a, h) => a + Math.round(h.points * 100), 0);
        assert.equal(sum, Math.round((tid === m.home ? m.homeScore : m.awayScore) * 100));
      }
    });
  }
  // Save/load mid-way reproduces the same season.
  const again = FFP.createLeague(opts, d);
  draftAll(FFP, again, d);
  for (let i = 0; i < 9; i++) FFP.playWeek(again, d);
  const loaded = FFP.deserialize(FFP.serialize(again));
  while (loaded.stage === "season") FFP.playWeek(loaded, d);
  assert.equal(FFP.serialize(loaded), FFP.serialize(L));
  return { L, stats };
}

test("real data: a full 8-team historical season", { skip: SKIP }, () => {
  const { L, stats } = fullSeason({ name: "Integration", teamName: "Mine", numTeams: 8, playoffTeams: 4,
    mode: "historical", historical: { includeInterceptions: false }, draftOrder: "random", seed: "integration-hist" });
  assert.equal(L.numTeams, 8);
  assert.ok(stats.draws > 8 * 11 * 10);
});

test("real data: a full strict season at its maxTeams", { skip: SKIP }, () => {
  const max = FFP.poolSummary(db(), "strict", HIST).maxTeams;
  assert.equal(max, 16);
  const { L } = fullSeason({ name: "Integration strict", teamName: "Mine", numTeams: 16, playoffTeams: 6,
    mode: "strict", historical: { includeInterceptions: false }, draftOrder: "custom", userPick: 1,
    seed: "integration-strict" });
  assert.equal(L.numTeams, max, "numTeams clamped to strict maxTeams");
});

test("real data: historical with interceptions included plays a full season too", { skip: SKIP }, () => {
  const { L } = fullSeason({ numTeams: 7, playoffTeams: 6, mode: "historical",
    historical: { includeInterceptions: true }, seed: "integration-int" });
  assert.equal(L.settings.historical.includeInterceptions, true);
});
