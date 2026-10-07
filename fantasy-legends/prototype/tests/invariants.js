// Shared season checks for engine.test.js and data.integration.test.js (not a test file itself).
"use strict";
const assert = require("node:assert/strict");

/** Draft every pick with the AI (including the user's team) until the season starts. */
function draftAll(FFP, league, db) {
  while (league.stage === "draft") {
    FFP.runAIPicks(league, db);
    const cp = FFP.currentPick(league);
    if (cp) FFP.makePick(league, db, FFP.aiPick(league, db, cp.teamId));
  }
  return league;
}

/**
 * Plays weeks until the stage changes (or `untilWeek` is reached), asserting after each week:
 * every non-bye player of a team with a matchup consumed exactly one new, eligible, never-used game
 * whose score matches the line; bye lines consume nothing and only fall in weeks 2..regularWeeks;
 * teams without a matchup consume nothing; team scores are the sum of starters only.
 */
function playChecked(FFP, league, db, opts) {
  opts = opts || {};
  const eligible = {};
  const eligibleMap = (pid) => {
    if (!eligible[pid]) {
      const m = new Map();
      for (const g of FFP.eligibleGames(db, pid, league.mode, league.settings)) m.set(g.key, g);
      eligible[pid] = m;
    }
    return eligible[pid];
  };
  const byeLines = {};
  let weeks = 0;
  let draws = 0;
  while (league.stage === "season" && (opts.untilWeek === undefined || league.week <= opts.untilWeek)) {
    const w = league.week;
    const before = JSON.parse(JSON.stringify(league.consumed));
    const scheduled = JSON.parse(JSON.stringify(league.schedule[w]));
    if (opts.beforeWeek) opts.beforeWeek(league, w);
    FFP.playWeek(league, db);
    const res = league.results[w];
    assert.ok(res, "results stored for week " + w);
    assert.equal(res.matchups.length, scheduled.length);
    const playing = new Set();
    res.matchups.forEach((m, i) => {
      assert.equal(m.home, scheduled[i].home);
      assert.equal(m.away, scheduled[i].away);
      for (const tid of [m.home, m.away]) {
        assert.ok(!playing.has(tid), "a team plays twice in week " + w);
        playing.add(tid);
        assert.equal(m.lines[tid].length, FFP.SLOTS.length);
        assert.equal(m.bench[tid].length, FFP.BENCH);
        const all = m.lines[tid].concat(m.bench[tid]);
        assert.deepEqual(all.map((l) => l.pid).sort(), league.rosters[tid].slice().sort(), "lines cover the roster");
        let sumH = 0;
        m.lines[tid].forEach((l, k) => {
          assert.equal(l.slot, FFP.SLOTS[k]);
          sumH += Math.round(l.points * 100);
        });
        const score = tid === m.home ? m.homeScore : m.awayScore;
        assert.equal(Math.round(score * 100), sumH, "team score is the sum of its starters");
        for (const l of all) {
          const prev = before[l.pid] || [];
          const now = league.consumed[l.pid] || [];
          if (l.bye) {
            assert.equal(league.byes[l.pid], w);
            assert.ok(w >= 2 && w <= league.regularWeeks, "bye in week " + w);
            assert.equal(l.gameKey, null);
            assert.equal(l.points, 0);
            assert.deepEqual(now, prev, "a bye consumes nothing");
            byeLines[l.pid] = (byeLines[l.pid] || 0) + 1;
          } else {
            assert.notEqual(league.byes[l.pid], w);
            assert.equal(now.length, prev.length + 1, "exactly one new game for " + l.pid + " in week " + w);
            assert.deepEqual(now.slice(0, -1), prev);
            assert.equal(now[now.length - 1], l.gameKey);
            assert.ok(!prev.includes(l.gameKey), "game drawn twice: " + l.gameKey);
            const g = eligibleMap(l.pid).get(l.gameKey);
            assert.ok(g, "drawn game is eligible: " + l.gameKey);
            const pos = db.playersById[l.pid].pos;
            assert.equal(FFP.scoreGame(g, pos, league.mode, league.settings, league.rules).total, l.points);
            draws++;
          }
        }
      }
    });
    if (res.matchups.length) {
      const winnerOk = res.matchups.every((m) => m.winner === null || m.winner === m.home || m.winner === m.away);
      assert.ok(winnerOk);
    }
    // Everyone else (idle, eliminated, resting, dropped players) consumed nothing.
    const keys = new Set(Object.keys(before).concat(Object.keys(league.consumed)));
    for (const pid of keys) {
      const onPlayingTeam = [...playing].some((tid) => league.rosters[tid].includes(pid));
      if (!onPlayingTeam) assert.deepEqual(league.consumed[pid] || [], before[pid] || [], pid + " consumed while not playing");
    }
    weeks++;
  }
  for (const pid of Object.keys(league.consumed)) {
    assert.equal(new Set(league.consumed[pid]).size, league.consumed[pid].length, "duplicate consumption for " + pid);
  }
  for (const pid of Object.keys(byeLines)) assert.ok(byeLines[pid] <= 1, pid + " had more than one bye");
  return { weeks, draws, byeLines };
}

module.exports = { draftAll, playChecked };
