/*
 * Fantasy Football of the Past — prototype engine.
 *
 * Pure game logic: no DOM, no Math.random, no Date. Every random choice comes from a
 * seeded PRNG stream derived from league.seed plus a label, so a league replays
 * identically. All league state is plain JSON. Points are summed in integer
 * hundredths and reported rounded to 2 decimals.
 *
 * UMD: browser global `FFP`, Node `module.exports`.
 */
(function (root, factory) {
  if (typeof module === "object" && module && module.exports) {
    module.exports = factory();
  } else {
    root.FFP = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  var ENGINE_VERSION = "proto-1";
  var SAVE_VERSION = 1;
  var TOTAL_WEEKS = 17;
  var MIN_GAMES = 16; // 17 weeks minus one bye
  var SLOTS = ["QB", "RB", "WR", "TE", "FLEX", "DEF", "K"];
  var BENCH = 4;
  var ROSTER_SIZE = 11;
  var POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];
  var MODES = ["strict", "historical"];
  var FIRST_SEASON = 1960;
  var LAST_SEASON = 1999;
  var MAX_TEAMS = 16;
  var BENCH_SLOT = "BN";

  var SLOT_POSITIONS = {
    QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"],
    FLEX: ["RB", "WR", "TE"], DEF: ["DEF"], K: ["K"]
  };

  /*
   * AI roster caps, tried in order until one gives a legal pick:
   *   1. at most 2 at every position. Twelve places for eleven picks, so each AI roster ends up with a
   *      backup at all but one position, and a bye rarely leaves one of its starting slots empty.
   *   2. at most 2 each of QB, TE, K, DEF (the spec's cap): a third RB or WR is allowed.
   *   3. anything legal. Only reached when the pool forces it (for example a small Strict pool where
   *      the remaining players can't fill every roster within the caps).
   */
  var AI_CAPS = [
    { QB: 2, RB: 2, WR: 2, TE: 2, K: 2, DEF: 2 },
    { QB: 2, TE: 2, K: 2, DEF: 2 },
    {}
  ];

  var AI_TEAM_NAMES = [
    "Leather Helmets", "Single Wing", "Flying Wedge", "Wishbone", "Run-and-Shoot",
    "Wing-T", "Shotgun", "Ice Bowl", "Statue of Liberty", "Hook and Ladder",
    "Flea Flicker", "Fumblerooski", "Hail Mary", "Coffin Corner", "Sudden Death"
  ];

  function deepFreeze(o) {
    if (o && typeof o === "object") {
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
      Object.freeze(o);
    }
    return o;
  }

  // Offense coefficients are placeholders; the real ones come from the live site's code.
  var DEFAULT_RULES = deepFreeze({
    offense: {
      pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, rush_td: 6, rec: 1, rec_yd: 0.1, rec_td: 6,
      ret_td: 6, two_pt: 2, fum_rec_td: 6, fumble_lost: 0
    },
    kicker: { xp: 1, xp_miss: -1, fg_0_39: 3, fg_40_49: 4, fg_50p: 5, fg_flat: 3, fg_miss: -1 },
    defense: {
      sack: 1, int: 2, fum_rec: 2, safety: 2, block: 2, def_td: 6, ret_td: 6,
      pa_tiers: [[0, 10], [6, 7], [13, 4], [20, 1], [27, 0], [34, -1], [999, -4]]
    }
  });

  var DEFAULT_SETTINGS = deepFreeze({ historical: { includeInterceptions: false } });

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function copy(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function cmpStr(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  // Integer hundredths -> points (never -0).
  function hToPts(h) { h = Math.round(h) || 0; return h / 100 || 0; }
  function ptsToH(p) { return Math.round(p * 100) || 0; }
  function isOffense(pos) { return pos === "QB" || pos === "RB" || pos === "WR" || pos === "TE"; }

  function checkMode(mode) {
    if (MODES.indexOf(mode) < 0) throw new Error("Unknown mode \"" + mode + "\" (use \"strict\" or \"historical\").");
  }
  function checkPos(pos) {
    if (POSITIONS.indexOf(pos) < 0) throw new Error("Unknown position \"" + pos + "\".");
  }
  function includeInterceptions(settings) {
    if (!settings) return false;
    if (settings.historical && typeof settings.historical === "object") return settings.historical.includeInterceptions === true;
    return settings.includeInterceptions === true;
  }
  function normalizeSettings(settings) {
    return { historical: { includeInterceptions: includeInterceptions(settings) } };
  }
  function normalizeRules(rules) {
    var d = DEFAULT_RULES;
    rules = rules || {};
    var out = {
      offense: Object.assign({}, d.offense, rules.offense || {}),
      kicker: Object.assign({}, d.kicker, rules.kicker || {}),
      defense: Object.assign({}, d.defense, rules.defense || {})
    };
    out.defense.pa_tiers = copy(out.defense.pa_tiers);
    return copy(out);
  }

  // ---------------------------------------------------------------------------
  // Seeded randomness: FNV-1a + murmur3 finalizer -> mulberry32
  // ---------------------------------------------------------------------------

  function hashString(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** A PRNG stream (floats in [0, 1)) for a seed and a label. */
  function rngStream(seed, label) {
    return mulberry32(hashString(String(seed) + "|" + label));
  }

  function seededShuffle(arr, rand) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------------------------------------------------------------------------
  // Eligibility and scoring
  // ---------------------------------------------------------------------------

  var OFF_HIST = ["pass_yds", "pass_td", "pass_int", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td", "ret_td"];
  var OFF_STRICT = OFF_HIST.concat(["two_pt", "fum_rec_td"]);
  // Strict kickers: the kicking contract (missed extra points cost 1) plus the kicker's own offense stats.
  var K_STRICT = ["xpm", "xp_missed", "fgm_0_39", "fgm_40_49", "fgm_50p", "fg_missed"].concat(OFF_STRICT);
  var K_HIST = ["fgm", "xpm", "fg_missed"];
  var DEF_STRICT = ["pts_allowed", "sacks", "def_int", "fum_rec", "safeties", "blk_punt", "blk_fg", "blk_xp",
    "def_int_td", "def_fum_td", "ret_td", "st_other_td"];
  var DEF_HIST = ["pts_allowed", "ret_td"];

  /** Fields that must be non-null for a game to be eligible. */
  function requiredFields(pos, mode, settings) {
    checkPos(pos); checkMode(mode);
    var strict = mode === "strict";
    if (isOffense(pos)) return (strict ? OFF_STRICT : OFF_HIST).slice();
    if (pos === "K") return (strict ? K_STRICT : K_HIST).slice();
    if (strict) return DEF_STRICT.slice();
    return includeInterceptions(settings) ? DEF_HIST.concat(["def_int"]) : DEF_HIST.slice();
  }

  /** True when every required field is a number and the season is 1960–1999. */
  function isEligible(game, pos, mode, settings) {
    if (!game || typeof game !== "object") return false;
    var season = game.season;
    if (!isNum(season) || season < FIRST_SEASON || season > LAST_SEASON) return false;
    var req = requiredFields(pos, mode, settings);
    for (var i = 0; i < req.length; i++) {
      if (!isNum(game[req[i]])) return false;
    }
    if (pos === "DEF") {
      if (mode === "strict" && game.int_verified !== true) return false;
      if (mode === "historical" && includeInterceptions(settings) && game.int_verified !== true) return false;
    }
    return true;
  }

  /** Points for points allowed: the first [max, pts] tier with pa <= max. */
  function paTierPoints(pa, tiers) {
    tiers = tiers || DEFAULT_RULES.defense.pa_tiers;
    for (var i = 0; i < tiers.length; i++) {
      if (pa <= tiers[i][0]) return tiers[i][1];
    }
    if (!tiers.length) throw new Error("No points-allowed tiers defined.");
    return tiers[tiers.length - 1][1];
  }

  // [stat field, label, coefficient] for the mode. DEF's points-allowed tier is handled separately.
  function scoringTerms(pos, mode, settings, rules) {
    var strict = mode === "strict";
    if (isOffense(pos) || (pos === "K" && strict)) {
      var o = rules.offense;
      var t = [
        ["pass_yds", "Passing yards", o.pass_yd],
        ["pass_td", "Passing TDs", o.pass_td],
        ["pass_int", "Interceptions thrown", o.pass_int],
        ["rush_yds", "Rushing yards", o.rush_yd],
        ["rush_td", "Rushing TDs", o.rush_td],
        ["rec", "Receptions", o.rec],
        ["rec_yds", "Receiving yards", o.rec_yd],
        ["rec_td", "Receiving TDs", o.rec_td],
        ["ret_td", "Return TDs", o.ret_td]
      ];
      if (strict) {
        t.push(["two_pt", "Two-point conversions", o.two_pt]);
        t.push(["fum_rec_td", "Fumble recovery TDs", o.fum_rec_td]);
      }
      if (isOffense(pos)) return t;
      var ks = rules.kicker;
      return [
        ["xpm", "Extra points", ks.xp],
        ["xp_missed", "Missed extra points", ks.xp_miss],
        ["fgm_0_39", "Field goals 0–39 yd", ks.fg_0_39],
        ["fgm_40_49", "Field goals 40–49 yd", ks.fg_40_49],
        ["fgm_50p", "Field goals 50+ yd", ks.fg_50p],
        ["fg_missed", "Missed field goals", ks.fg_miss]
      ].concat(t);
    }
    if (pos === "K") {
      var k = rules.kicker;
      return [
        ["fgm", "Field goals", k.fg_flat],
        ["xpm", "Extra points", k.xp],
        ["fg_missed", "Missed field goals", k.fg_miss]
      ];
    }
    var d = rules.defense;
    if (strict) {
      return [
        ["sacks", "Sacks", d.sack],
        ["def_int", "Interceptions", d.int],
        ["fum_rec", "Fumble recoveries", d.fum_rec],
        ["safeties", "Safeties", d.safety],
        ["blk_punt", "Blocked punts", d.block],
        ["blk_fg", "Blocked field goals", d.block],
        ["blk_xp", "Blocked extra points", d.block],
        ["def_int_td", "Interception return TDs", d.def_td],
        ["def_fum_td", "Fumble return TDs", d.def_td],
        ["ret_td", "Kick/punt return TDs", d.ret_td],
        ["st_other_td", "Other special-teams TDs", d.ret_td]
      ];
    }
    var h = [["ret_td", "Kick/punt return TDs", d.ret_td]];
    if (includeInterceptions(settings)) h.push(["def_int", "Interceptions", d.int]);
    return h;
  }

  // Score in integer hundredths. Assumes the game is eligible.
  function scoreHundredths(game, pos, mode, settings, rules) {
    var parts = [];
    var total = 0;
    if (pos === "DEF") {
      var pa = game.pts_allowed;
      var tierH = ptsToH(paTierPoints(pa, rules.defense.pa_tiers));
      total += tierH;
      parts.push({ label: "Points allowed tier", stat: "pts_allowed", value: pa, points: hToPts(tierH) });
    }
    var terms = scoringTerms(pos, mode, settings, rules);
    for (var i = 0; i < terms.length; i++) {
      var stat = terms[i][0];
      var value = game[stat];
      var coef = terms[i][2];
      var h = Math.round(value * coef * 100) || 0;
      total += h;
      if (value !== 0) parts.push({ label: terms[i][1], stat: stat, value: value, points: hToPts(h) });
    }
    return { totalH: total, parts: parts };
  }

  /** {total, parts: [{label, stat, value, points}]}. Throws if the game isn't eligible. */
  function scoreGame(game, pos, mode, settings, rules) {
    checkPos(pos); checkMode(mode);
    if (!isEligible(game, pos, mode, settings)) {
      var missing = requiredFields(pos, mode, settings).filter(function (f) { return !game || !isNum(game[f]); });
      throw new Error("Game " + (game && game.key ? game.key : (game && game.game_id) || "?") +
        " is not eligible for " + pos + " in " + mode + " mode" +
        (missing.length ? " (unknown: " + missing.join(", ") + ")" : "") + ".");
    }
    var r = scoreHundredths(game, pos, mode, settings, rules ? normalizeRules(rules) : DEFAULT_RULES);
    return { total: hToPts(r.totalH), parts: r.parts };
  }

  // ---------------------------------------------------------------------------
  // Data and pools
  // ---------------------------------------------------------------------------

  function cacheOf(db) {
    if (!db || typeof db !== "object") throw new Error("Expected a db from FFP.loadData().");
    if (!db._ffpCache) {
      Object.defineProperty(db, "_ffpCache", { value: { elig: {}, pool: {}, keyIndex: {} }, enumerable: false, writable: true });
    }
    return db._ffpCache;
  }

  /*
   * Strict kickers and selection bias. Strict scores field goals by distance, so a kicker's game is
   * strict-eligible only when the distance split is known. If a season's data knows the split mostly
   * for games with no field goal made (before 1999 the sheets know it only for those: all three bins
   * are a proven 0), drawing from that season would hand Strict kickers their worst games. Such a
   * season is "skewed": its kicker games stay scoreable (isEligible) but are not drawable in Strict
   * (eligibleGames, draftPool, playWeek). A season is skewed when, counting only kickers with a known
   * split in at least one game that season, made-field-goal games have a known split at a rate more
   * than FG_SKEW_TOLERANCE below games without a field goal made.
   */
  var FG_SKEW_TOLERANCE = 0.1;

  function countFgDistance(stats, g) {
    if (!isNum(g.fgm) || !isNum(g.season)) return;
    var bySeason = stats[g.season] || (stats[g.season] = {});
    var s = bySeason[g.pid] || (bySeason[g.pid] = { made: 0, madeKnown: 0, none: 0, noneKnown: 0 });
    var known = isNum(g.fgm_0_39) && isNum(g.fgm_40_49) && isNum(g.fgm_50p);
    if (g.fgm > 0) { s.made++; if (known) s.madeKnown++; } else { s.none++; if (known) s.noneKnown++; }
  }

  function skewedSeasons(stats) {
    return Object.keys(stats).map(Number).filter(function (season) {
      var t = { made: 0, madeKnown: 0, none: 0, noneKnown: 0 };
      Object.keys(stats[season]).forEach(function (pid) {
        var s = stats[season][pid];
        if (s.madeKnown + s.noneKnown === 0) return; // no distance data for him this season: no selection
        t.made += s.made; t.madeKnown += s.madeKnown; t.none += s.none; t.noneKnown += s.noneKnown;
      });
      if (!t.made) return false;
      var madeRate = t.madeKnown / t.made;
      var noneRate = t.none ? t.noneKnown / t.none : 0;
      return madeRate < noneRate - FG_SKEW_TOLERANCE;
    }).sort(function (a, b) { return a - b; });
  }

  /**
   * loadData({players, games: {QB, RB, WR, TE, K, DEF}}) -> db.
   * `players` is players.json (or its players array); each games entry is {columns, rows}
   * (or an array of game objects).
   */
  function loadData(input) {
    input = input || {};
    var plist = Array.isArray(input.players) ? input.players
      : (input.players && Array.isArray(input.players.players) ? input.players.players : []);
    var db = {
      version: input.players && input.players.version !== undefined ? input.players.version : null,
      // Fingerprint of the data build (players.json `dataVersion`), stored in leagues so a save can tell
      // when the data has been revised since it was played. null when the data doesn't carry one.
      dataVersion: input.players && typeof input.players.dataVersion === "string" ? input.players.dataVersion : null,
      seasons: input.players && input.players.seasons ? input.players.seasons.slice() : [FIRST_SEASON, LAST_SEASON],
      players: [],
      playersById: {},
      gamesByPid: {},
      duplicateGames: 0,
      fgDistanceSkewedSeasons: []
    };
    plist.forEach(function (p) {
      db.players.push(p);
      db.playersById[p.id] = p;
      if (!db.gamesByPid[p.id]) db.gamesByPid[p.id] = [];
    });
    var seen = {};
    var fgStats = {};
    var games = input.games || {};
    POSITIONS.forEach(function (pos) {
      var g = games[pos];
      if (!g) return;
      var objs;
      if (Array.isArray(g)) {
        objs = g.map(function (o) { return Object.assign({}, o); });
      } else {
        var cols = g.columns || [];
        objs = (g.rows || []).map(function (row) {
          var o = {};
          for (var i = 0; i < cols.length; i++) o[cols[i]] = row[i] === undefined ? null : row[i];
          return o;
        });
      }
      objs.forEach(function (o) {
        o.key = o.pid + "|" + o.game_id;
        if (seen[o.key]) { db.duplicateGames++; return; }
        seen[o.key] = true;
        if (!db.gamesByPid[o.pid]) db.gamesByPid[o.pid] = [];
        db.gamesByPid[o.pid].push(o);
        if (pos === "K") countFgDistance(fgStats, o);
      });
    });
    db.fgDistanceSkewedSeasons = skewedSeasons(fgStats);
    Object.keys(db.gamesByPid).forEach(function (pid) {
      db.gamesByPid[pid].sort(function (a, b) {
        return cmpStr(String(a.date), String(b.date)) || cmpStr(String(a.game_id), String(b.game_id));
      });
    });
    cacheOf(db);
    return db;
  }

  function modeKey(mode, settings) {
    return mode + (includeInterceptions(settings) ? "+int" : "");
  }

  function eligibleInternal(db, pid, mode, settings) {
    var c = cacheOf(db);
    var mk = modeKey(mode, settings);
    var m = c.elig[mk] || (c.elig[mk] = {});
    if (m[pid]) return m[pid];
    var p = db.playersById[pid];
    var games = db.gamesByPid[pid] || [];
    var pos = p ? p.pos : null;
    var skewed = null;
    if (mode === "strict" && pos === "K" && db.fgDistanceSkewedSeasons && db.fgDistanceSkewedSeasons.length) {
      skewed = {};
      db.fgDistanceSkewedSeasons.forEach(function (s) { skewed[s] = true; });
    }
    var out = (pos && POSITIONS.indexOf(pos) >= 0)
      ? games.filter(function (g) { return isEligible(g, pos, mode, settings) && !(skewed && skewed[g.season]); })
      : [];
    m[pid] = out;
    return out;
  }

  /**
   * Eligible games for a player in a mode (date order): the games a player can draw. In Strict a
   * kicker's games from a skewed season (see FG_SKEW_TOLERANCE) are left out even though isEligible
   * accepts them.
   */
  function eligibleGames(db, pid, mode, settings) {
    checkMode(mode);
    return eligibleInternal(db, pid, mode, settings).slice();
  }

  // Internal pool: {list (sorted), byId}; entries carry avgExact for ranking.
  function poolInternal(db, mode, settings, rules) {
    checkMode(mode);
    rules = rules ? normalizeRules(rules) : normalizeRules(DEFAULT_RULES);
    var c = cacheOf(db);
    var key = modeKey(mode, settings) + "|" + JSON.stringify(rules);
    if (c.pool[key]) return c.pool[key];
    var list = [];
    db.players.forEach(function (p) {
      if (POSITIONS.indexOf(p.pos) < 0) return;
      var games = eligibleInternal(db, p.id, mode, settings);
      if (games.length < MIN_GAMES) return;
      var sum = 0;
      for (var i = 0; i < games.length; i++) sum += scoreHundredths(games[i], p.pos, mode, settings, rules).totalH;
      var avgExact = sum / games.length / 100;
      list.push({
        id: p.id, name: p.name, pos: p.pos, hof: p.hof === true, legend: p.legend === true,
        first: p.first === undefined ? null : p.first, last: p.last === undefined ? null : p.last,
        eligibleCount: games.length,
        avgPoints: Math.round(avgExact * 100) / 100 || 0,
        avgExact: avgExact
      });
    });
    list.sort(function (a, b) { return (b.avgExact - a.avgExact) || cmpStr(a.id, b.id); });
    var byId = {};
    list.forEach(function (e, i) { e.rank = i; byId[e.id] = e; });
    var res = { list: list, byId: byId };
    c.pool[key] = res;
    return res;
  }

  function publicPoolEntry(e) {
    return {
      id: e.id, name: e.name, pos: e.pos, hof: e.hof, legend: e.legend, first: e.first, last: e.last,
      eligibleCount: e.eligibleCount, avgPoints: e.avgPoints
    };
  }

  /** Players with at least MIN_GAMES eligible games, sorted by avgPoints descending. */
  function draftPool(db, mode, settings, rules) {
    return poolInternal(db, mode, settings, rules).list.map(publicPoolEntry);
  }

  function countsByPos(list) {
    var c = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
    list.forEach(function (e) { c[e.pos]++; });
    return c;
  }

  /*
   * maxTeams: the largest N <= 16 for which a full draft is possible. The spec lists
   * QB, TE, K, DEF >= N, RB + WR + TE >= 3N and total >= 11N. A full draft also needs
   * RB >= N, WR >= N and RB + WR + TE >= 4N (RB, WR, TE and FLEX starters), so those are
   * checked too; with them the conditions are sufficient as well as necessary.
   */
  function maxTeamsFor(c) {
    var total = c.QB + c.RB + c.WR + c.TE + c.K + c.DEF;
    var rwt = c.RB + c.WR + c.TE;
    for (var n = MAX_TEAMS; n >= 1; n--) {
      if (c.QB >= n && c.TE >= n && c.K >= n && c.DEF >= n && c.RB >= n && c.WR >= n &&
          rwt >= 3 * n && rwt >= 4 * n && total >= ROSTER_SIZE * n) return n;
    }
    return 0;
  }

  /** {counts: {QB, RB, WR, TE, K, DEF}, maxTeams}. */
  function poolSummary(db, mode, settings, rules) {
    var counts = countsByPos(poolInternal(db, mode, settings, rules).list);
    return { counts: counts, maxTeams: maxTeamsFor(counts) };
  }

  // ---------------------------------------------------------------------------
  // League
  // ---------------------------------------------------------------------------

  function leaguePool(league, db) {
    return poolInternal(db, league.mode, league.settings, league.rules);
  }

  function teamById(league, teamId) {
    for (var i = 0; i < league.teams.length; i++) if (league.teams[i].id === teamId) return league.teams[i];
    return null;
  }

  function playoffRoundsFor(playoffTeams) { return playoffTeams === 6 ? 3 : playoffTeams === 4 ? 2 : 1; }

  /**
   * createLeague({name, teamName, numTeams, playoffTeams, mode, historical, draftOrder, userPick, seed, rules}, db)
   */
  function createLeague(opts, db) {
    opts = opts || {};
    var mode = opts.mode || "historical";
    checkMode(mode);
    var settings = normalizeSettings(opts.historical !== undefined ? { historical: opts.historical } : opts.settings);
    var rules = normalizeRules(opts.rules);
    var summary = poolSummary(db, mode, settings, rules);
    if (summary.maxTeams < 2) {
      throw new Error("The " + mode + " player pool is too small for a two-team league.");
    }
    var requested = Math.floor(Number(opts.numTeams));
    if (!isFinite(requested)) requested = 8;
    var numTeams = Math.max(2, Math.min(MAX_TEAMS, summary.maxTeams, requested));
    var pReq = Math.floor(Number(opts.playoffTeams));
    if (!isFinite(pReq)) pReq = 4;
    var playoffTeams = (pReq >= 6 && numTeams >= 6) ? 6 : (pReq >= 4 && numTeams >= 4) ? 4 : 2;
    var rounds = playoffRoundsFor(playoffTeams);
    var seed = (opts.seed === undefined || opts.seed === null || opts.seed === "") ? "1" : String(opts.seed);

    var teams = [{ id: "t0", name: (opts.teamName && String(opts.teamName).trim()) || "My Team", isUser: true }];
    for (var i = 1; i < numTeams; i++) teams.push({ id: "t" + i, name: AI_TEAM_NAMES[i - 1], isUser: false });
    var ids = teams.map(function (t) { return t.id; });

    var orderMode = opts.draftOrder === "custom" ? "custom" : "random";
    var order;
    var rand = rngStream(seed, "draftOrder");
    if (orderMode === "custom") {
      var pick = Math.floor(Number(opts.userPick));
      if (!isFinite(pick)) pick = 1;
      pick = Math.max(1, Math.min(numTeams, pick));
      order = seededShuffle(ids.slice(1), rand);
      order.splice(pick - 1, 0, "t0");
    } else {
      order = seededShuffle(ids, rand);
    }

    var rosters = {};
    ids.forEach(function (id) { rosters[id] = []; });

    return {
      engineVersion: ENGINE_VERSION,
      dataVersion: db.dataVersion || null,
      name: (opts.name && String(opts.name).trim()) || "Fantasy Football of the Past",
      mode: mode,
      settings: settings,
      rules: rules,
      seed: seed,
      numTeams: numTeams,
      numTeamsRequested: requested,
      maxTeams: summary.maxTeams,
      playoffTeams: playoffTeams,
      playoffRounds: rounds,
      regularWeeks: TOTAL_WEEKS - rounds,
      totalWeeks: TOTAL_WEEKS,
      teams: teams,
      userTeamId: "t0",
      draftOrderMode: orderMode,
      userPick: order.indexOf("t0") + 1,
      draftOrder: order,
      picks: [],
      rosters: rosters,
      stage: "draft",
      week: 0,
      schedule: {},
      byes: {},
      lineups: {},
      consumed: {},
      results: {},
      playoffs: null,
      champion: null,
      transactions: []
    };
  }

  // ---------------------------------------------------------------------------
  // Draft
  // ---------------------------------------------------------------------------

  /** {overall, round, pickInRound, teamId} or null when the draft is done. */
  function currentPick(league) {
    if (league.stage !== "draft") return null;
    var n = league.numTeams;
    var overall = league.picks.length + 1;
    if (overall > n * ROSTER_SIZE) return null;
    var round = Math.ceil(overall / n);
    var pickInRound = ((overall - 1) % n) + 1;
    var idx = round % 2 === 1 ? pickInRound - 1 : n - pickInRound;
    return { overall: overall, round: round, pickInRound: pickInRound, teamId: league.draftOrder[idx] };
  }

  function ownerMap(league) {
    var m = {};
    Object.keys(league.rosters).forEach(function (tid) {
      league.rosters[tid].forEach(function (pid) { m[pid] = tid; });
    });
    return m;
  }

  function posCounts(pids, posOf) {
    var c = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
    pids.forEach(function (pid) { var p = posOf(pid); if (p && hasOwn(c, p)) c[p]++; });
    return c;
  }

  // Starting-slot needs of a roster given its position counts.
  function needsOf(c) {
    var n = {
      QB: Math.max(0, 1 - c.QB), RB: Math.max(0, 1 - c.RB), WR: Math.max(0, 1 - c.WR),
      TE: Math.max(0, 1 - c.TE), K: Math.max(0, 1 - c.K), DEF: Math.max(0, 1 - c.DEF)
    };
    var flexExtra = Math.max(0, c.RB - 1) + Math.max(0, c.WR - 1) + Math.max(0, c.TE - 1);
    n.FLEX = flexExtra >= 1 ? 0 : 1;
    n.total = n.QB + n.RB + n.WR + n.TE + n.K + n.DEF + n.FLEX;
    return n;
  }

  function needsText(n) {
    var out = [];
    SLOTS.forEach(function (s) { if (n[s]) out.push(s); });
    return out.join(", ");
  }

  function dbPosOf(db, pool) {
    return function (pid) {
      var e = pool.byId[pid];
      if (e) return e.pos;
      var p = db.playersById[pid];
      return p ? p.pos : null;
    };
  }

  // Snapshot used by canPick/aiPick.
  function draftContext(league, db) {
    var pool = leaguePool(league, db);
    var owners = ownerMap(league);
    var posOf = dbPosOf(db, pool);
    var avail = countsByPos(pool.list);
    Object.keys(owners).forEach(function (pid) {
      var e = pool.byId[pid];
      if (e) avail[e.pos]--;
    });
    var teams = {};
    league.teams.forEach(function (t) {
      var r = league.rosters[t.id] || [];
      teams[t.id] = { size: r.length, counts: posCounts(r, posOf) };
    });
    return { pool: pool, owners: owners, avail: avail, teams: teams, posOf: posOf };
  }

  function addCount(c, pos, d) {
    var o = Object.assign({}, c);
    o[pos] += d;
    return o;
  }

  // Legality of teamId taking pid, given a context. Returns {ok, reason}.
  function checkPick(league, ctx, teamId, pid) {
    var team = teamById(league, teamId);
    if (!team) return { ok: false, reason: "Unknown team " + teamId + "." };
    var entry = ctx.pool.byId[pid];
    if (!entry) {
      var p = ctx.posOf(pid) ? true : false;
      return { ok: false, reason: p ? "That player isn't in this league's player pool (fewer than " + MIN_GAMES +
        " eligible games in " + league.mode + " mode)." : "Unknown player " + pid + "." };
    }
    if (hasOwn(ctx.owners, pid)) {
      var owner = teamById(league, ctx.owners[pid]);
      return { ok: false, reason: entry.name + " is already on " + (owner ? owner.name : "a roster") + "." };
    }
    var t = ctx.teams[teamId];
    if (t.size >= ROSTER_SIZE) return { ok: false, reason: "That roster is full." };
    var counts = addCount(t.counts, entry.pos, 1);
    var remaining = ROSTER_SIZE - t.size - 1;
    var need = needsOf(counts);
    if (need.total > remaining) {
      return {
        ok: false,
        reason: "Taking a " + entry.pos + " now would leave " + remaining + " pick" + (remaining === 1 ? "" : "s") +
          " to fill " + need.total + " open starting slot" + (need.total === 1 ? "" : "s") + " (" + needsText(need) + ")."
      };
    }
    // League-wide supply: after this pick every team must still be able to fill its starters.
    var avail = addCount(ctx.avail, entry.pos, -1);
    var sum = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0, FLEX: 0 };
    var remainingAll = 0;
    league.teams.forEach(function (tm) {
      var tc = tm.id === teamId ? counts : ctx.teams[tm.id].counts;
      var size = tm.id === teamId ? t.size + 1 : ctx.teams[tm.id].size;
      var n = needsOf(tc);
      Object.keys(sum).forEach(function (k) { sum[k] += n[k]; });
      remainingAll += ROSTER_SIZE - size;
    });
    var short = [];
    ["QB", "RB", "WR", "TE", "K", "DEF"].forEach(function (k) { if (avail[k] < sum[k]) short.push(k); });
    var flexSpare = (avail.RB - sum.RB) + (avail.WR - sum.WR) + (avail.TE - sum.TE);
    if (!short.length && flexSpare < sum.FLEX) short.push("FLEX");
    var totalAvail = avail.QB + avail.RB + avail.WR + avail.TE + avail.K + avail.DEF;
    if (short.length || totalAvail < remainingAll) {
      return {
        ok: false,
        reason: "Taking this " + entry.pos + " would leave too few players in the pool for every team to fill " +
          (short.length ? short.join(", ") : "its roster") + "."
      };
    }
    return { ok: true, reason: "" };
  }

  /** {ok, reason} for teamId drafting pid. */
  function canPick(league, db, teamId, pid) {
    if (league.stage !== "draft" || !currentPick(league)) return { ok: false, reason: "The draft is over." };
    return checkPick(league, draftContext(league, db), teamId, pid);
  }

  /** The team on the clock takes pid. Throws if the pick isn't legal. */
  function makePick(league, db, pid) {
    var cp = currentPick(league);
    if (!cp) throw new Error("The draft is over.");
    var chk = canPick(league, db, cp.teamId, pid);
    if (!chk.ok) throw new Error(chk.reason);
    league.rosters[cp.teamId].push(pid);
    league.picks.push({ overall: cp.overall, round: cp.round, pickInRound: cp.pickInRound, teamId: cp.teamId, pid: pid });
    if (league.picks.length === league.numTeams * ROSTER_SIZE) startSeason(league, db);
    return league;
  }

  /**
   * Best available avgPoints that keeps the team (and league) able to fill every starter, within the
   * first AI_CAPS level that leaves a legal pick.
   */
  function aiPick(league, db, teamId) {
    if (league.stage !== "draft") throw new Error("The draft is over.");
    var ctx = draftContext(league, db);
    var t = ctx.teams[teamId];
    if (!t) throw new Error("Unknown team " + teamId + ".");
    if (t.size >= ROSTER_SIZE) throw new Error("That roster is full.");
    var list = ctx.pool.list;
    for (var pass = 0; pass < AI_CAPS.length; pass++) {
      var caps = AI_CAPS[pass];
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (hasOwn(ctx.owners, e.id)) continue;
        if (caps[e.pos] !== undefined && t.counts[e.pos] >= caps[e.pos]) continue;
        if (checkPick(league, ctx, teamId, e.id).ok) return e.id;
      }
    }
    throw new Error("No legal pick is left for " + teamId + ".");
  }

  /** AI teams pick until the user is on the clock or the draft ends. */
  function runAIPicks(league, db) {
    var cp;
    while ((cp = currentPick(league))) {
      var team = teamById(league, cp.teamId);
      if (team.isUser) break;
      makePick(league, db, aiPick(league, db, cp.teamId));
    }
    return league;
  }

  // ---------------------------------------------------------------------------
  // Season
  // ---------------------------------------------------------------------------

  /*
   * Circle-method round robin. With an even count, ids[0] is the fixed point. With an odd count the
   * dummy "idle" slot is the fixed point, so the team order sets who sits out when: ids[n-1] is idle
   * in round 1, ids[n-2] in round 2, ..., ids[0] in the last round of the cycle.
   */
  function roundRobin(ids) {
    var odd = ids.length % 2 === 1;
    var arr = odd ? [null].concat(ids) : ids.slice();
    var n = arr.length;
    var rounds = [];
    var rot = arr.slice();
    for (var r = 0; r < n - 1; r++) {
      var games = [];
      for (var i = 0; i < n / 2; i++) {
        var a = rot[i], b = rot[n - 1 - i];
        if (a === null || b === null) continue;
        // Odd counts: home/away is set over the whole season in buildSchedule.
        var swap = odd ? false : i === 0 ? (r % 2 === 1) : (i % 2 === 1);
        games.push(swap ? { home: b, away: a } : { home: a, away: b });
      }
      rounds.push(games);
      rot = [rot[0], rot[n - 1]].concat(rot.slice(1, n - 1));
    }
    return rounds;
  }

  /*
   * Team order for the round robin. Odd counts: the user goes first, so his idle week is the last
   * round of each cycle. He is never idle in week 1, and when the regular season isn't a whole number
   * of cycles the extra idle weeks fall on computer teams (chosen by a seeded shuffle), so the user
   * never plays fewer games than anyone else.
   */
  function scheduleOrder(league) {
    var ids = league.teams.map(function (t) { return t.id; });
    if (ids.length % 2 === 0) return ids;
    var user = league.userTeamId || ids[0];
    var others = ids.filter(function (id) { return id !== user; });
    return [user].concat(seededShuffle(others, rngStream(league.seed, "schedule")));
  }

  function buildSchedule(league) {
    var order = scheduleOrder(league);
    var rounds = roundRobin(order);
    var odd = order.length % 2 === 1;
    // Odd counts: in week order, the team that has hosted less (net of road games) hosts; on a tie,
    // the pair swaps from their last meeting.
    var net = {}, lastHome = {};
    var schedule = {};
    for (var w = 1; w <= league.regularWeeks; w++) {
      var games = copy(rounds[(w - 1) % rounds.length]);
      if (odd) {
        games = games.map(function (g) {
          var a = g.home, b = g.away, pair = [a, b].sort().join("|");
          var na = net[a] || 0, nb = net[b] || 0;
          var home = na !== nb ? (na < nb ? a : b) : lastHome[pair] === a ? b : a;
          var away = home === a ? b : a;
          net[home] = (net[home] || 0) + 1;
          net[away] = (net[away] || 0) - 1;
          lastHome[pair] = home;
          return { home: home, away: away };
        });
      }
      schedule[w] = games;
    }
    return schedule;
  }

  function drawBye(league, pid, firstWeek) {
    var lastWeek = league.regularWeeks;
    if (firstWeek > lastWeek) return null;
    var r = rngStream(league.seed, "bye|" + pid)();
    return firstWeek + Math.floor(r * (lastWeek - firstWeek + 1));
  }

  /** Builds the schedule, assigns byes, sets lineups; stage "season", week 1. */
  function startSeason(league, db) {
    if (league.stage !== "draft") throw new Error("The season has already started.");
    league.teams.forEach(function (t) {
      if ((league.rosters[t.id] || []).length !== ROSTER_SIZE) throw new Error(t.name + " doesn't have a full roster yet.");
    });
    league.schedule = buildSchedule(league);
    league.byes = league.byes || {};
    league.teams.forEach(function (t) {
      league.rosters[t.id].forEach(function (pid) {
        if (!hasOwn(league.byes, pid)) league.byes[pid] = drawBye(league, pid, 2);
      });
    });
    league.consumed = league.consumed || {};
    league.results = league.results || {};
    league.stage = "season";
    league.week = 1;
    league.playoffs = {
      teams: league.playoffTeams, rounds: league.playoffRounds, startWeek: league.regularWeeks + 1, seeds: null
    };
    league.teams.forEach(function (t) { autoLineup(league, db, t.id, 1); });
    return league;
  }

  function avgOf(pool, pid) {
    var e = pool.byId[pid];
    return e ? e.avgExact : -Infinity;
  }

  /** Best avgPoints starters, preferring players not on bye that week. Sets and returns the lineup. */
  function autoLineup(league, db, teamId, week) {
    var roster = league.rosters[teamId];
    if (!roster) throw new Error("Unknown team " + teamId + ".");
    if (week === undefined || week === null) week = league.week;
    var pool = leaguePool(league, db);
    var posOf = dbPosOf(db, pool);
    var onBye = function (pid) { return league.byes && league.byes[pid] === week ? 1 : 0; };
    var sorted = roster.slice().sort(function (a, b) {
      return (onBye(a) - onBye(b)) || (avgOf(pool, b) - avgOf(pool, a)) || cmpStr(a, b);
    });
    var used = {};
    var lineup = {};
    var take = function (allowed) {
      for (var i = 0; i < sorted.length; i++) {
        var pid = sorted[i];
        if (!used[pid] && allowed.indexOf(posOf(pid)) >= 0) { used[pid] = true; return pid; }
      }
      return null;
    };
    ["QB", "RB", "WR", "TE", "DEF", "K"].forEach(function (s) { lineup[s] = take(SLOT_POSITIONS[s]); });
    lineup.FLEX = take(SLOT_POSITIONS.FLEX);
    var out = {};
    SLOTS.forEach(function (s) { out[s] = lineup[s]; });
    out.bench = sorted.filter(function (pid) { return !used[pid]; });
    league.lineups[teamId] = out;
    return copy(out);
  }

  function lineupProblem(league, db, teamId, lineup) {
    var roster = league.rosters[teamId];
    if (!roster) return "Unknown team " + teamId + ".";
    if (!lineup || typeof lineup !== "object") return "No lineup given.";
    var pool = leaguePool(league, db);
    var posOf = dbPosOf(db, pool);
    var seen = {};
    for (var i = 0; i < SLOTS.length; i++) {
      var s = SLOTS[i];
      var pid = lineup[s];
      if (!pid) return "The " + s + " slot is empty.";
      if (roster.indexOf(pid) < 0) return "The " + s + " starter isn't on this roster.";
      if (SLOT_POSITIONS[s].indexOf(posOf(pid)) < 0) return "A " + posOf(pid) + " can't start at " + s + ".";
      if (seen[pid]) return "A player is in two slots.";
      seen[pid] = true;
    }
    if (!Array.isArray(lineup.bench) || lineup.bench.length !== BENCH) return "The bench must have " + BENCH + " players.";
    for (var j = 0; j < lineup.bench.length; j++) {
      var b = lineup.bench[j];
      if (roster.indexOf(b) < 0) return "A bench player isn't on this roster.";
      if (seen[b]) return "A player is in two slots.";
      seen[b] = true;
    }
    if (Object.keys(seen).length !== roster.length) return "The lineup must use exactly the roster.";
    return null;
  }

  /** Validates positions and that the lineup uses exactly the roster; stores it. */
  function setLineup(league, db, teamId, lineup) {
    if (league.stage !== "season") throw new Error("Lineups can only be set during the season.");
    var problem = lineupProblem(league, db, teamId, lineup);
    if (problem) throw new Error(problem);
    var out = {};
    SLOTS.forEach(function (s) { out[s] = lineup[s]; });
    out.bench = lineup.bench.slice();
    league.lineups[teamId] = out;
    return league;
  }

  function playoffLabel(league, week) {
    var fromEnd = TOTAL_WEEKS - week;
    if (fromEnd === 0) return "Championship";
    if (fromEnd === 1) return "Semifinal";
    return "Wild card";
  }

  function playoffGame(league, a, b, week) {
    var seeds = league.playoffs.seeds;
    var sa = seeds.indexOf(a) + 1, sb = seeds.indexOf(b) + 1;
    var hi = sa <= sb ? a : b, lo = sa <= sb ? b : a;
    return {
      home: hi, away: lo, homeSeed: Math.min(sa, sb), awaySeed: Math.max(sa, sb),
      playoff: true, label: playoffLabel(league, week)
    };
  }

  function seedPlayoffs(league) {
    var st = standings(league);
    var seeds = st.slice(0, league.playoffTeams).map(function (r) { return r.teamId; });
    league.playoffs.seeds = seeds;
    var w = league.regularWeeks + 1;
    var s = function (n) { return seeds[n - 1]; };
    if (league.playoffTeams === 6) {
      league.schedule[w] = [playoffGame(league, s(3), s(6), w), playoffGame(league, s(4), s(5), w)];
    } else if (league.playoffTeams === 4) {
      league.schedule[w] = [playoffGame(league, s(1), s(4), w), playoffGame(league, s(2), s(3), w)];
    } else {
      league.schedule[w] = [playoffGame(league, s(1), s(2), w)];
    }
  }

  function nextPlayoffRound(league, playedWeek) {
    var prev = league.results[playedWeek].matchups;
    var w = playedWeek + 1;
    var seeds = league.playoffs.seeds;
    if (league.playoffTeams === 6 && playedWeek === league.regularWeeks + 1) {
      // week 15: [3 v 6, 4 v 5] -> week 16: 1 v winner(4/5), 2 v winner(3/6)
      league.schedule[w] = [
        playoffGame(league, seeds[0], prev[1].winner, w),
        playoffGame(league, seeds[1], prev[0].winner, w)
      ];
    } else {
      league.schedule[w] = [playoffGame(league, prev[0].winner, prev[1].winner, w)];
    }
  }

  /** Plays league.week: one consumed game per non-bye rostered player of every team with a matchup. */
  function playWeek(league, db) {
    if (league.stage !== "season") throw new Error(league.stage === "draft" ? "Finish the draft first." : "The season is over.");
    var w = league.week;
    if (league.results[w]) throw new Error("Week " + w + " has already been played.");
    var matchups = league.schedule[w];
    if (!matchups) throw new Error("No schedule for week " + w + ".");

    league.teams.forEach(function (t) { if (!t.isUser) autoLineup(league, db, t.id, w); });
    matchups.forEach(function (m) {
      [m.home, m.away].forEach(function (tid) {
        var problem = lineupProblem(league, db, tid, league.lineups[tid]);
        if (problem) throw new Error(teamById(league, tid).name + "'s lineup is invalid: " + problem);
      });
    });

    var newlyConsumed = {};
    var drawn = {};
    var playPlayer = function (slot, pid) {
      if (league.byes[pid] === w) return { slot: slot, pid: pid, gameKey: null, points: 0, bye: true };
      if (drawn[pid]) throw new Error("Player " + pid + " appears twice in week " + w + ".");
      drawn[pid] = true;
      var player = db.playersById[pid];
      if (!player) throw new Error("Unknown player " + pid + ".");
      var used = {};
      (league.consumed[pid] || []).forEach(function (k) { used[k] = true; });
      var avail = eligibleInternal(db, pid, league.mode, league.settings).filter(function (g) { return !used[g.key]; });
      if (!avail.length) throw new Error(player.name + " has no unplayed eligible games left.");
      var g = avail[Math.floor(rngStream(league.seed, "draw|" + w + "|" + pid)() * avail.length)];
      newlyConsumed[pid] = g.key;
      var h = scoreHundredths(g, player.pos, league.mode, league.settings, league.rules).totalH;
      return { slot: slot, pid: pid, gameKey: g.key, points: hToPts(h), bye: false };
    };

    var out = matchups.map(function (m) {
      var res = { home: m.home, away: m.away, homeScore: 0, awayScore: 0, winner: null, lines: {}, bench: {} };
      if (m.playoff) {
        res.playoff = true; res.label = m.label; res.homeSeed = m.homeSeed; res.awaySeed = m.awaySeed;
      }
      var scoreH = {};
      [m.home, m.away].forEach(function (tid) {
        var lu = league.lineups[tid];
        var lines = SLOTS.map(function (s) { return playPlayer(s, lu[s]); });
        res.lines[tid] = lines;
        res.bench[tid] = lu.bench.map(function (pid) { return playPlayer(BENCH_SLOT, pid); });
        scoreH[tid] = lines.reduce(function (acc, l) { return acc + ptsToH(l.points); }, 0);
      });
      res.homeScore = hToPts(scoreH[m.home]);
      res.awayScore = hToPts(scoreH[m.away]);
      if (scoreH[m.home] > scoreH[m.away]) res.winner = m.home;
      else if (scoreH[m.away] > scoreH[m.home]) res.winner = m.away;
      else if (m.playoff) res.winner = (m.homeSeed <= m.awaySeed) ? m.home : m.away; // higher seed
      else res.winner = null;
      return res;
    });

    // Commit only after every draw succeeded.
    Object.keys(newlyConsumed).forEach(function (pid) {
      if (!league.consumed[pid]) league.consumed[pid] = [];
      league.consumed[pid].push(newlyConsumed[pid]);
    });
    league.results[w] = { week: w, playoff: w > league.regularWeeks, matchups: out };

    if (w >= TOTAL_WEEKS) {
      var final = out[0];
      league.champion = final ? final.winner : null;
      league.stage = "complete";
      return league;
    }
    if (w === league.regularWeeks) seedPlayoffs(league);
    else if (w > league.regularWeeks) nextPlayoffRound(league, w);
    league.week = w + 1;
    league.teams.forEach(function (t) { if (!t.isUser) autoLineup(league, db, t.id, league.week); });
    return league;
  }

  /** [{teamId, w, l, t, pf, pa}] ranked by wins + ½·ties, then points for, then team order. */
  function standings(league) {
    var rows = league.teams.map(function (t, i) { return { teamId: t.id, w: 0, l: 0, t: 0, pfH: 0, paH: 0, idx: i }; });
    var byId = {};
    rows.forEach(function (r) { byId[r.teamId] = r; });
    for (var wk = 1; wk <= league.regularWeeks; wk++) {
      var res = league.results && league.results[wk];
      if (!res) continue;
      res.matchups.forEach(function (m) {
        var h = byId[m.home], a = byId[m.away];
        var hs = ptsToH(m.homeScore), as = ptsToH(m.awayScore);
        h.pfH += hs; h.paH += as; a.pfH += as; a.paH += hs;
        if (hs > as) { h.w++; a.l++; } else if (as > hs) { a.w++; h.l++; } else { h.t++; a.t++; }
      });
    }
    rows.sort(function (x, y) {
      return ((y.w + y.t / 2) - (x.w + x.t / 2)) || (y.pfH - x.pfH) || (x.idx - y.idx);
    });
    return rows.map(function (r) {
      return { teamId: r.teamId, w: r.w, l: r.l, t: r.t, pf: hToPts(r.pfH), pa: hToPts(r.paH) };
    });
  }

  // ---------------------------------------------------------------------------
  // Free agents
  // ---------------------------------------------------------------------------

  /** Draft pool minus rostered players; adds `remaining` (eligible games not yet consumed). */
  function freeAgents(league, db) {
    var owners = ownerMap(league);
    return leaguePool(league, db).list.filter(function (e) { return !hasOwn(owners, e.id); }).map(function (e) {
      var p = publicPoolEntry(e);
      p.remaining = e.eligibleCount - ((league.consumed && league.consumed[e.id]) || []).length;
      return p;
    });
  }

  /** Between weeks: add a free agent and drop a rostered player. Roster stays at 11 and fills every slot. */
  function addDrop(league, db, teamId, addPid, dropPid) {
    if (league.stage !== "season") throw new Error("Add/drop is only open between weeks of the season.");
    if (league.results[league.week]) throw new Error("Week " + league.week + " has already been played.");
    var roster = league.rosters[teamId];
    if (!roster) throw new Error("Unknown team " + teamId + ".");
    var pool = leaguePool(league, db);
    var add = pool.byId[addPid];
    if (!add) throw new Error("That player isn't in this league's player pool.");
    var owners = ownerMap(league);
    if (hasOwn(owners, addPid)) throw new Error(add.name + " is already on a roster.");
    var idx = roster.indexOf(dropPid);
    if (idx < 0) throw new Error("The player to drop isn't on this roster.");
    var posOf = dbPosOf(db, pool);
    var next = roster.slice();
    next[idx] = addPid;
    var need = needsOf(posCounts(next, posOf));
    if (need.total > 0) throw new Error("After this move the roster couldn't fill " + needsText(need) + ".");

    league.rosters[teamId] = next;
    if (!hasOwn(league.byes, addPid)) league.byes[addPid] = drawBye(league, addPid, league.week + 1);

    // Keep the lineup valid with as little change as possible.
    var lu = copy(league.lineups[teamId]);
    var slot = null;
    SLOTS.forEach(function (s) { if (lu[s] === dropPid) slot = s; });
    if (slot === null) {
      lu.bench = lu.bench.map(function (p) { return p === dropPid ? addPid : p; });
    } else if (SLOT_POSITIONS[slot].indexOf(add.pos) >= 0) {
      lu[slot] = addPid;
    } else {
      var w = league.week;
      var cands = lu.bench.filter(function (p) { return SLOT_POSITIONS[slot].indexOf(posOf(p)) >= 0; });
      cands.sort(function (a, b) {
        var ba = league.byes[a] === w ? 1 : 0, bb = league.byes[b] === w ? 1 : 0;
        return (ba - bb) || (avgOf(pool, b) - avgOf(pool, a)) || cmpStr(a, b);
      });
      if (cands.length) {
        lu[slot] = cands[0];
        lu.bench = lu.bench.map(function (p) { return p === cands[0] ? addPid : p; });
      } else {
        lu = null;
      }
    }
    if (lu && !lineupProblem(league, db, teamId, lu)) league.lineups[teamId] = lu;
    else autoLineup(league, db, teamId, league.week);

    league.transactions.push({ week: league.week, teamId: teamId, add: addPid, drop: dropPid });
    return league;
  }

  // ---------------------------------------------------------------------------
  // Save, load, reveal
  // ---------------------------------------------------------------------------

  function serialize(league) {
    return JSON.stringify({ saveVersion: SAVE_VERSION, engineVersion: ENGINE_VERSION, league: league });
  }

  function deserialize(text) {
    var obj;
    if (typeof text === "string") {
      try { obj = JSON.parse(text); } catch (e) { throw new Error("This save isn't valid JSON (" + e.message + ")."); }
    } else {
      obj = text;
    }
    if (!obj || typeof obj !== "object" || !obj.league || typeof obj.league !== "object") {
      throw new Error("This isn't a Fantasy Football of the Past save.");
    }
    if (obj.saveVersion !== SAVE_VERSION) {
      throw new Error("Unknown save version " + JSON.stringify(obj.saveVersion) + "; this build reads save version " +
        SAVE_VERSION + ".");
    }
    if (obj.engineVersion !== ENGINE_VERSION) {
      throw new Error("Unknown engine version " + JSON.stringify(obj.engineVersion) + "; this build is " + ENGINE_VERSION + ".");
    }
    var problem = leagueShapeProblem(obj.league);
    if (problem) throw new Error("This save is damaged or incomplete: " + problem);
    var league = copy(obj.league);
    // Saves from before a coefficient existed (the missed-XP penalty) get the default for it.
    league.rules = normalizeRules(league.rules);
    return league;
  }

  /*
   * Structural check of a saved league: everything the engine and UI read without further checks.
   * Returns a plain-language problem, or null. It doesn't check players against the data (the caller
   * has the db for that).
   */
  function leagueShapeProblem(lg) {
    var isObj = function (x) { return !!x && typeof x === "object" && !Array.isArray(x); };
    var isStr = function (x) { return typeof x === "string" && x.length > 0; };
    var isInt = function (x) { return typeof x === "number" && isFinite(x) && Math.floor(x) === x; };
    if (!isObj(lg)) return "there is no league in it.";
    if (!Array.isArray(lg.teams) || lg.teams.length < 2 || lg.teams.length > MAX_TEAMS) return "the team list is missing or the wrong size.";
    var ids = {};
    for (var i = 0; i < lg.teams.length; i++) {
      var t = lg.teams[i];
      if (!isObj(t) || !isStr(t.id) || typeof t.name !== "string" || ids[t.id]) return "a team is missing its id or name.";
      ids[t.id] = true;
    }
    if (lg.numTeams !== lg.teams.length) return "the number of teams doesn't match the team list.";
    if (!isStr(lg.userTeamId) || !ids[lg.userTeamId]) return "it doesn't say which team is yours.";
    if (MODES.indexOf(lg.mode) < 0) return "the scoring mode is missing.";
    if (!isObj(lg.settings) || !isObj(lg.settings.historical)) return "the league settings are missing.";
    if (!isObj(lg.rules) || !isObj(lg.rules.offense) || !isObj(lg.rules.kicker) || !isObj(lg.rules.defense) ||
        !Array.isArray(lg.rules.defense.pa_tiers)) return "the scoring rules are missing.";
    if (lg.seed === undefined || lg.seed === null) return "the seed is missing.";
    if ([2, 4, 6].indexOf(lg.playoffTeams) < 0 || lg.playoffRounds !== playoffRoundsFor(lg.playoffTeams) ||
        lg.regularWeeks !== TOTAL_WEEKS - lg.playoffRounds) return "the playoff settings are missing or don't fit together.";
    if (["draft", "season", "complete"].indexOf(lg.stage) < 0) return "the league stage is missing.";
    if (!Array.isArray(lg.draftOrder) || lg.draftOrder.length !== lg.numTeams ||
        !lg.draftOrder.every(function (id) { return ids[id]; })) return "the draft order is missing.";
    if (!Array.isArray(lg.picks)) return "the pick list is missing.";
    if (!isObj(lg.rosters)) return "the rosters are missing.";
    var size = lg.stage === "draft" ? null : ROSTER_SIZE;
    for (var tid in ids) {
      var r = lg.rosters[tid];
      if (!Array.isArray(r) || !r.every(isStr)) return "a roster is missing.";
      if (size !== null && r.length !== size) return "a roster doesn't have " + ROSTER_SIZE + " players.";
    }
    var names = ["schedule", "byes", "lineups", "consumed", "results"];
    for (var k = 0; k < names.length; k++) if (!isObj(lg[names[k]])) return "the " + names[k] + " section is missing.";
    for (var pid in lg.consumed) if (!Array.isArray(lg.consumed[pid])) return "the list of used games is damaged.";
    if (!Array.isArray(lg.transactions)) return "the list of moves is missing.";
    if (!isInt(lg.week) || lg.week < 0 || lg.week > TOTAL_WEEKS) return "the current week is missing.";
    var matchupOk = function (m) { return isObj(m) && ids[m.home] && ids[m.away]; };
    for (var w in lg.schedule) {
      if (!Array.isArray(lg.schedule[w]) || !lg.schedule[w].every(matchupOk)) return "the schedule for week " + w + " is damaged.";
    }
    for (var rw in lg.results) {
      var res = lg.results[rw];
      if (!isObj(res) || !Array.isArray(res.matchups)) return "the results for week " + rw + " are damaged.";
      for (var j = 0; j < res.matchups.length; j++) {
        var m = res.matchups[j];
        if (!matchupOk(m) || typeof m.homeScore !== "number" || typeof m.awayScore !== "number" || !isObj(m.lines)) {
          return "the results for week " + rw + " are damaged.";
        }
        var sides = [m.home, m.away];
        for (var s = 0; s < 2; s++) {
          var lines = m.lines[sides[s]];
          if (!Array.isArray(lines) || !lines.every(function (l) { return isObj(l) && isStr(l.pid) && typeof l.points === "number"; })) {
            return "the results for week " + rw + " are damaged.";
          }
        }
      }
    }
    if (lg.stage === "draft") return null;
    if (lg.week < 1) return "the current week is missing.";
    for (var wk = 1; wk <= lg.regularWeeks; wk++) if (!lg.schedule[wk]) return "the schedule for week " + wk + " is missing.";
    if (lg.stage === "season" && !lg.schedule[lg.week]) return "the schedule for week " + lg.week + " is missing.";
    if (!isObj(lg.playoffs)) return "the playoff bracket is missing.";
    for (var lt in ids) {
      var lu = lg.lineups[lt];
      if (!isObj(lu) || !Array.isArray(lu.bench)) return "a lineup is missing.";
      for (var q = 0; q < SLOTS.length; q++) if (!isStr(lu[SLOTS[q]])) return "a lineup is missing its " + SLOTS[q] + ".";
    }
    for (var pw = 1; pw < (lg.stage === "complete" ? TOTAL_WEEKS + 1 : lg.week); pw++) {
      if (!lg.results[pw]) return "the results for week " + pw + " are missing.";
    }
    return null;
  }

  function findGame(db, pid, key) {
    var c = cacheOf(db);
    var idx = c.keyIndex[pid];
    if (!idx) {
      idx = {};
      (db.gamesByPid[pid] || []).forEach(function (g) { idx[g.key] = g; });
      c.keyIndex[pid] = idx;
    }
    return idx[key] || null;
  }

  /** VS card, fictional quarter highlights and the real FINAL for one stored matchup. */
  function revealTimeline(league, db, week, matchupIndex) {
    var res = league.results && league.results[week];
    if (!res) throw new Error("Week " + week + " hasn't been played.");
    var m = res.matchups[matchupIndex];
    if (!m) throw new Error("No matchup " + matchupIndex + " in week " + week + ".");

    /*
     * A stored result is never rescored: `points` is always the stored value. The parts are recomputed
     * from the loaded data, and if the data was revised after the week was played (the game is gone,
     * no longer scoreable, or scores differently) the line gets `dataChanged: true`, `parts: []` and
     * `currentPoints` (what the revised record scores, or null), so nothing shows a breakdown that
     * doesn't add up to the stored score.
     */
    var detail = function (line) {
      var p = db.playersById[line.pid] || {};
      var out = {
        slot: line.slot, pid: line.pid, name: p.name || line.pid, pos: p.pos || null, bye: line.bye,
        points: line.points, parts: [], game: null, dataChanged: false
      };
      if (!line.gameKey) return out;
      var game = findGame(db, line.pid, line.gameKey);
      if (!game) {
        out.dataChanged = true;
        out.currentPoints = null;
        return out;
      }
      out.game = copy(game);
      var scored = null;
      try { scored = scoreGame(game, p.pos, league.mode, league.settings, league.rules); } catch (e) { scored = null; }
      if (scored && ptsToH(scored.total) === ptsToH(line.points)) {
        out.parts = scored.parts;
      } else {
        out.dataChanged = true;
        out.currentPoints = scored ? scored.total : null;
      }
      return out;
    };

    var side = function (tid) {
      var t = teamById(league, tid);
      return {
        teamId: tid,
        name: t ? t.name : tid,
        starters: m.lines[tid].map(function (l) {
          var p = db.playersById[l.pid] || {};
          var g = l.gameKey ? findGame(db, l.pid, l.gameKey) : null;
          return { slot: l.slot, pid: l.pid, name: p.name || l.pid, pos: p.pos || null, season: g ? g.season : null, bye: l.bye };
        })
      };
    };

    var rand = rngStream(league.seed, "reveal|" + week + "|" + matchupIndex);
    var hl = [];
    [m.home, m.away].forEach(function (tid) {
      m.lines[tid].forEach(function (l) {
        if (l.bye) return;
        var p = db.playersById[l.pid] || {};
        var quarter = 1 + Math.floor(rand() * 4);
        hl.push({ quarter: quarter, teamId: tid, slot: l.slot, pid: l.pid, name: p.name || l.pid, pos: p.pos || null,
          points: l.points, _k: rand(), _o: hl.length });
      });
    });
    hl.sort(function (a, b) { return (a.quarter - b.quarter) || (a._k - b._k) || (a._o - b._o); });
    var runH = {}; runH[m.home] = 0; runH[m.away] = 0;
    hl.forEach(function (h) {
      runH[h.teamId] += ptsToH(h.points);
      h.homeScore = hToPts(runH[m.home]);
      h.awayScore = hToPts(runH[m.away]);
      delete h._k; delete h._o;
    });

    var lines = {}, bench = {};
    [m.home, m.away].forEach(function (tid) {
      lines[tid] = m.lines[tid].map(detail);
      bench[tid] = (m.bench && m.bench[tid] ? m.bench[tid] : []).map(detail);
    });

    return {
      week: week,
      matchupIndex: matchupIndex,
      playoff: !!m.playoff,
      label: m.label || null,
      vs: { home: side(m.home), away: side(m.away) },
      highlights: hl,
      final: { homeScore: m.homeScore, awayScore: m.awayScore, winner: m.winner, lines: lines, bench: bench }
    };
  }

  // ---------------------------------------------------------------------------

  return {
    ENGINE_VERSION: ENGINE_VERSION,
    SAVE_VERSION: SAVE_VERSION,
    TOTAL_WEEKS: TOTAL_WEEKS,
    MIN_GAMES: MIN_GAMES,
    SLOTS: Object.freeze(SLOTS.slice()),
    BENCH: BENCH,
    ROSTER_SIZE: ROSTER_SIZE,
    DEFAULT_RULES: DEFAULT_RULES,
    // extras (not in the spec, safe to ignore)
    POSITIONS: Object.freeze(POSITIONS.slice()),
    SLOT_POSITIONS: deepFreeze(copy(SLOT_POSITIONS)),
    AI_TEAM_NAMES: Object.freeze(AI_TEAM_NAMES.slice()),
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    paTierPoints: paTierPoints,
    rngStream: rngStream,

    requiredFields: requiredFields,
    isEligible: isEligible,
    scoreGame: scoreGame,
    loadData: loadData,
    eligibleGames: eligibleGames,
    draftPool: draftPool,
    poolSummary: poolSummary,
    createLeague: createLeague,
    currentPick: currentPick,
    canPick: canPick,
    makePick: makePick,
    aiPick: aiPick,
    runAIPicks: runAIPicks,
    startSeason: startSeason,
    setLineup: setLineup,
    autoLineup: autoLineup,
    playWeek: playWeek,
    standings: standings,
    freeAgents: freeAgents,
    addDrop: addDrop,
    serialize: serialize,
    deserialize: deserialize,
    revealTimeline: revealTimeline
  };
});
