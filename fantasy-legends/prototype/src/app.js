/*
 * Fantasy Football of the Past — prototype UI.
 * Talks to the game only through window.FFP (src/engine.js). No external requests besides
 * the page's own data files and the Google Fonts stylesheet in page.html.
 */
(function () {
  "use strict";

  var FFP = window.FFP;
  var SAVE_KEY = "ffp-proto-save-v1";
  var POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];
  var SLOTS = FFP.SLOTS.slice();
  // FLEX takes RB, WR or TE (spec section 2).
  var SLOT_OK = { QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], FLEX: ["RB", "WR", "TE"], DEF: ["DEF"], K: ["K"] };
  var POS_PLURAL = { QB: "quarterbacks", RB: "running backs", WR: "wide receivers", TE: "tight ends", K: "kickers", DEF: "defenses" };
  var DATA_FILES = [
    { key: "players", url: "data/players.json", label: "Players" },
    { key: "QB", url: "data/games_qb.json", label: "Quarterbacks" },
    { key: "RB", url: "data/games_rb.json", label: "Running backs" },
    { key: "WR", url: "data/games_wr.json", label: "Receivers" },
    { key: "TE", url: "data/games_te.json", label: "Tight ends" },
    { key: "K", url: "data/games_k.json", label: "Kickers" },
    { key: "DEF", url: "data/games_def.json", label: "Defenses" }
  ];
  var FIELD_NAMES = {
    pass_cmp: "completions", pass_att: "pass attempts", pass_yds: "passing yards", pass_td: "passing TDs",
    pass_int: "interceptions thrown", rush_att: "rush attempts", rush_yds: "rushing yards", rush_td: "rushing TDs",
    rec: "receptions", rec_yds: "receiving yards", rec_td: "receiving TDs", ret_td: "return TDs",
    two_pt: "two-point conversions", fum_rec_td: "fumble-recovery TDs", xpm: "extra points made",
    xpa: "extra-point attempts", fgm: "field goals made", fga: "field-goal attempts", fg_missed: "missed field goals",
    fgm_0_39: "field goals 0–39 yd", fgm_40_49: "field goals 40–49 yd", fgm_50p: "field goals 50+ yd",
    pts_allowed: "points allowed", sacks: "sacks", def_int: "interceptions", fum_rec: "fumble recoveries",
    safeties: "safeties", blk_punt: "blocked punts", blk_fg: "blocked field goals", blk_xp: "blocked extra points",
    def_int_td: "interception-return TDs", def_fum_td: "fumble-return TDs"
  };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var HIGHLIGHT_MS = 1700;
  var PAGE = 60;
  var DRAFT_PAGE = 40;

  var S = {
    db: null,
    totalGames: 0,
    league: null,
    pools: {},
    tab: "week",
    draft: { search: "", pos: "ALL", hof: false, limit: DRAFT_PAGE, busy: false, timer: null },
    fa: { search: "", pos: "ALL", limit: PAGE, addPid: null, msg: "" },
    gc: null,
    confirmAction: null,
    bootNotice: ""
  };

  // ------------------------------------------------------------------ helpers

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function fmtPts(n) {
    if (n === null || n === undefined) return "?";
    return (n < 0 ? "−" : "") + Math.abs(n).toFixed(2);
  }
  function fmtSigned(n) { return (n < 0 ? "−" : "+") + Math.abs(n).toFixed(2); }
  function fmtInt(n) { return Number(n).toLocaleString("en-US"); }
  function val(x) { return x === null || x === undefined ? "?" : String(x); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || "");
    if (!m) return d ? String(d) : "date unknown";
    return MONTHS[Number(m[2]) - 1] + " " + Number(m[3]) + ", " + m[1];
  }
  function yearsOf(p) {
    if (!p || p.first === null || p.first === undefined) return "";
    if (p.first === p.last || p.last === null || p.last === undefined) return String(p.first);
    var a = String(p.first), b = String(p.last);
    return a + "–" + (a.slice(0, 2) === b.slice(0, 2) ? b.slice(2) : b);
  }
  function reducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
  }
  function modeName(mode) { return mode === "strict" ? "Strict" : "Historical"; }
  function L() { return S.league; }
  function uid() { return S.league.userTeamId || "t0"; }
  function team(tid) {
    var ts = S.league.teams;
    for (var i = 0; i < ts.length; i++) if (ts[i].id === tid) return ts[i];
    return null;
  }
  function teamName(tid) { var t = team(tid); return t ? t.name : String(tid); }
  function player(pid) { return S.db.playersById[pid] || { id: pid, name: pid, pos: null }; }
  function posOf(pid) { var p = S.db.playersById[pid]; return p ? p.pos : null; }
  function fits(pid, slot) { return SLOT_OK[slot].indexOf(posOf(pid)) >= 0; }
  function nextFrame() { return new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 0); }); }); }

  function leaguePool() {
    var lg = S.league;
    var key = lg.mode + "|" + JSON.stringify(lg.settings) + "|" + JSON.stringify(lg.rules);
    if (!S.pools[key]) {
      var list = FFP.draftPool(S.db, lg.mode, lg.settings, lg.rules);
      var byId = {};
      list.forEach(function (p) { byId[p.id] = p; });
      S.pools[key] = { list: list, byId: byId };
    }
    return S.pools[key];
  }

  // Which games a mode can draw, per position, worked out from the loaded data (never hard-coded).
  function coverage(mode, settings) {
    var key = "cov|" + mode + "|" + JSON.stringify(settings || {});
    if (S.pools[key]) return S.pools[key];
    var out = {};
    POSITIONS.forEach(function (p) { out[p] = { games: 0, eligible: 0, seasons: {} }; });
    S.db.players.forEach(function (pl) {
      var c = out[pl.pos];
      if (!c) return;
      c.games += (S.db.gamesByPid[pl.id] || []).length;
      FFP.eligibleGames(S.db, pl.id, mode, settings).forEach(function (g) { c.eligible++; c.seasons[g.season] = true; });
    });
    POSITIONS.forEach(function (p) {
      var ss = Object.keys(out[p].seasons).map(Number).sort(function (a, b) { return a - b; });
      out[p].first = ss.length ? ss[0] : null;
      out[p].last = ss.length ? ss[ss.length - 1] : null;
      out[p].seasonCount = ss.length;
      out[p].pct = out[p].games ? Math.round(100 * out[p].eligible / out[p].games) : 0;
    });
    S.pools[key] = out;
    return out;
  }

  function joinAnd(list) {
    return list.length <= 1 ? list.join("") : list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
  }

  // "QB, RB, WR and TE: 83–84% of games, 1960–1999. K and DEF: 1999 games only."
  function coverageText(mode, settings) {
    var cov = coverage(mode, settings);
    var groups = [];
    var byKey = {};
    POSITIONS.forEach(function (p) {
      var c = cov[p];
      var key = !c.eligible ? "none" : c.seasonCount === 1 ? "one|" + c.first : (c.pct === 100 ? "all|" : "some|") + c.first + "|" + c.last;
      if (!byKey[key]) { byKey[key] = { key: key, pos: [], pcts: [], c: c }; groups.push(byKey[key]); }
      byKey[key].pos.push(p);
      byKey[key].pcts.push(c.pct);
    });
    return groups.map(function (g) {
      var who = joinAnd(g.pos);
      var c = g.c;
      if (g.key === "none") return who + ": no games.";
      if (g.key.indexOf("one|") === 0) return who + ": " + c.first + " games only.";
      if (g.key.indexOf("all|") === 0) return who + ": every game, " + c.first + "–" + c.last + ".";
      var lo = Math.min.apply(null, g.pcts), hi = Math.max.apply(null, g.pcts);
      return who + ": " + (lo === hi ? lo : lo + "–" + hi) + "% of games, " + c.first + "–" + c.last + ".";
    }).join(" ");
  }

  function hofBadge(p) { return p && p.hof ? ' <span class="hof" title="Pro Football Hall of Fame">HOF</span>' : ""; }
  function posChip(pos) { return '<span class="pos">' + esc(pos || "?") + "</span>"; }

  // Run a UI action, showing any engine error in the given element instead of throwing.
  function guard(errId, fn) {
    return function (ev) {
      var el = errId ? $(errId) : null;
      if (el) el.textContent = "";
      try { fn(ev); } catch (e) {
        if (el) el.textContent = e && e.message ? e.message : String(e);
        else showHubError(e && e.message ? e.message : String(e));
      }
    };
  }
  function showHubError(msg) { var el = $("hub-error"); if (el) el.textContent = msg || ""; }

  // ------------------------------------------------------------------ storage

  function setSaveStatus(text, warn) {
    var el = $("save-status");
    el.textContent = text || "";
    el.classList.toggle("warn", !!warn);
  }
  var NO_STORAGE = "This browser isn't keeping saves (storage is blocked or full). Open Saves and copy your league to keep it.";

  // Returns true when the league reached localStorage.
  function save() {
    if (!S.league) return true;
    var text = FFP.serialize(S.league);
    var ok = true;
    try {
      window.localStorage.setItem(SAVE_KEY, text);
      setSaveStatus("Saved in this browser.");
    } catch (e) {
      ok = false;
      setSaveStatus(NO_STORAGE, true);
    }
    S.storageOk = ok;
    if (!$("save-panel").hidden) { $("save-export").value = text; renderSaveHint(); }
    return ok;
  }
  function renderSaveHint() {
    $("save-hint").textContent = S.storageOk === false ?
      "This browser isn't keeping saves (storage is blocked or full), so your league is gone when the page reloads. Copy this text to keep it, and paste it into Import to pick up where you left off." :
      "Your league autosaves in this browser. To keep a copy or move it to another device, copy this text and paste it into Import later.";
  }
  function readSave() { try { return window.localStorage.getItem(SAVE_KEY); } catch (e) { return null; } }
  function clearSave() { try { window.localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage unavailable */ } }

  // ------------------------------------------------------------------ screens

  var SCREENS = ["loading", "setup", "draft", "hub", "game"];
  function showScreen(name) {
    SCREENS.forEach(function (s) { $("screen-" + s).hidden = s !== name; });
    if (name !== "game") stopGcTimer();
    if (name !== "draft") stopDraftTimer();
    var tools = $("masthead-tools");
    tools.hidden = name === "loading";
    $("btn-new-league").hidden = !S.league;
  }

  function route() {
    if (!S.league) { showSetup(); return; }
    if (S.league.stage === "draft") { showDraft(); return; }
    showHub();
  }

  // ------------------------------------------------------------------ confirm bar

  function askConfirm(text, yesLabel, onYes) {
    $("confirm-text").textContent = text;
    $("confirm-yes").textContent = yesLabel;
    S.confirmAction = onYes;
    S.confirmOpener = document.activeElement;
    $("confirm-bar").hidden = false;
    $("confirm-yes").focus();
  }
  function closeConfirm() { $("confirm-bar").hidden = true; S.confirmAction = null; }
  function cancelConfirm() {
    var back = S.confirmOpener;
    closeConfirm();
    S.confirmOpener = null;
    if (back && back !== document.body && document.contains(back) && !back.disabled && back.offsetParent !== null) back.focus();
  }
  // Move keyboard focus to the first match that is on screen, so a re-render doesn't drop it on the page body.
  function focusFirst(selector) {
    var els = document.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) {
      if (!els[i].disabled && els[i].offsetParent !== null) { els[i].focus(); return true; }
    }
    return false;
  }

  // ------------------------------------------------------------------ loading

  function initLoadingList() {
    $("loading-list").innerHTML = DATA_FILES.map(function (f, i) {
      return '<li id="load-item-' + i + '"><span>' + esc(f.label) + '</span><span class="num" id="load-state-' + i + '">waiting</span></li>';
    }).join("");
  }

  function setProgress(frac) {
    var pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
    $("loading-fill").style.width = pct + "%";
    $("loading-bar").setAttribute("aria-valuenow", String(pct));
  }

  function fetchJson(f, i, prog) {
    var stateEl = $("load-state-" + i);
    stateEl.textContent = "loading";
    return fetch(f.url).then(function (res) {
      if (!res.ok) throw new Error(f.url + " answered HTTP " + res.status + ".");
      var total = Number(res.headers.get("content-length")) || 0;
      prog.totals[i] = total;
      if (!res.body || !res.body.getReader || !total) {
        return res.text().then(function (t) { prog.loaded[i] = total || t.length; prog.update(); return t; });
      }
      var reader = res.body.getReader();
      var chunks = [];
      var got = 0;
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            var all = new Uint8Array(got);
            var off = 0;
            chunks.forEach(function (c) { all.set(c, off); off += c.length; });
            return new TextDecoder("utf-8").decode(all);
          }
          chunks.push(r.value);
          got += r.value.length;
          prog.loaded[i] = got;
          prog.update();
          stateEl.textContent = Math.round(got / 1e5) / 10 + " MB";
          return pump();
        });
      }
      return pump();
    }).then(function (text) {
      var json;
      try { json = JSON.parse(text); } catch (e) { throw new Error(f.url + " isn't valid JSON."); }
      $("load-item-" + i).classList.add("done");
      stateEl.textContent = "ready";
      prog.done++;
      prog.update();
      return json;
    }, function (err) {
      $("load-item-" + i).classList.add("fail");
      stateEl.textContent = "failed";
      var msg = err && err.message ? err.message : String(err);
      if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) msg = f.url + " couldn't be reached.";
      throw new Error(msg);
    });
  }

  function loadAll() {
    showScreen("loading");
    $("loading-error").hidden = true;
    $("loading-msg").textContent = "Loading 40 seasons of game logs…";
    initLoadingList();
    setProgress(0);
    var prog = {
      totals: DATA_FILES.map(function () { return 0; }),
      loaded: DATA_FILES.map(function () { return 0; }),
      done: 0,
      update: function () {
        var known = prog.totals.every(function (t) { return t > 0; });
        if (known) {
          var t = prog.totals.reduce(function (a, b) { return a + b; }, 0);
          var l = prog.loaded.reduce(function (a, b) { return a + b; }, 0);
          setProgress(0.95 * l / t);
        } else {
          setProgress(0.95 * prog.done / DATA_FILES.length);
        }
      }
    };
    Promise.all(DATA_FILES.map(function (f, i) { return fetchJson(f, i, prog); })).then(function (parts) {
      $("loading-msg").textContent = "Indexing every game…";
      return nextFrame().then(function () {
        var games = {};
        var total = 0;
        DATA_FILES.forEach(function (f, i) {
          if (i === 0) return;
          games[f.key] = parts[i];
          total += parts[i] && parts[i].rows ? parts[i].rows.length : 0;
        });
        S.totalGames = total;
        S.db = FFP.loadData({ players: parts[0], games: games });
        setProgress(1);
        boot();
      });
    }).catch(function (err) {
      $("loading-msg").textContent = "The game data didn't load.";
      $("loading-error-text").textContent = "Couldn't load the game data: " + (err && err.message ? err.message : String(err)) +
        " The page needs its data folder next to it. Check your connection, then try again.";
      $("loading-error").hidden = false;
    });
  }

  function boot() {
    var saved = readSave();
    if (saved) {
      try {
        var lg = FFP.deserialize(saved);
        checkLeagueAgainstData(lg);
        S.league = lg;
        setSaveStatus("Picked up your saved league.");
      } catch (e) {
        S.bootNotice = "Your saved league couldn't be opened: " + e.message + " Start a new league or import a save.";
      }
    }
    initSetupForm();
    try {
      route();
    } catch (e) {
      stopDraftTimer();
      S.league = null;
      S.bootNotice = "Your saved league couldn't be opened: " + (e && e.message ? e.message : String(e)) + " Start a new league or import a save.";
      setSaveStatus("");
      showSetup();
    }
  }

  function checkLeagueAgainstData(lg) {
    if (!lg || !Array.isArray(lg.teams) || !lg.rosters) throw new Error("This save is missing its teams.");
    Object.keys(lg.rosters).forEach(function (tid) {
      lg.rosters[tid].forEach(function (pid) {
        if (!S.db.playersById[pid]) throw new Error("This save names a player (" + pid + ") who isn't in the loaded data.");
      });
    });
  }

  // ------------------------------------------------------------------ setup

  function newSeed() { return String(1000 + Math.floor(Math.random() * 900000)); }

  function setupValues() {
    var mode = $("setup-mode-strict").checked ? "strict" : "historical";
    return {
      name: $("setup-league-name").value.trim() || "Old Leather League",
      teamName: $("setup-team-name").value.trim() || "Home Team",
      mode: mode,
      includeInterceptions: mode === "historical" && $("setup-int").checked,
      numTeams: Number($("setup-teams").value) || 8,
      playoffTeams: Number($("setup-playoffs").value) || 4,
      draftOrder: $("setup-order-custom").checked ? "custom" : "random",
      userPick: Number($("setup-pick").value) || 1,
      seed: $("setup-seed").value.trim() || newSeed()
    };
  }

  function initSetupForm() {
    if (!$("setup-seed").value) $("setup-seed").value = newSeed();
    var facts = [
      ["Seasons", "1960–99"],
      ["Player-games", fmtInt(S.totalGames)],
      ["Players", fmtInt(S.db.players.length)]
    ];
    $("kickoff-facts").innerHTML = facts.map(function (f) {
      return "<div><dt>" + esc(f[0]) + "</dt><dd>" + esc(f[1]) + "</dd></div>";
    }).join("");
    $("setup-teams").dataset.want = "8";
    renderSetup();
  }

  function maxTeamsWhy(mode, counts, max) {
    var name = modeName(mode);
    if (max >= 16) return name + " supports up to 16 teams, the most this prototype allows.";
    var n = max + 1;
    var short = [];
    POSITIONS.forEach(function (p) { if (counts[p] < n) short.push(counts[p] + " " + POS_PLURAL[p]); });
    var why;
    if (short.length) {
      var list = short.length === 1 ? short[0] : short.slice(0, -1).join(", ") + " and " + short[short.length - 1];
      why = "only " + list + " have " + FFP.MIN_GAMES + " or more eligible games, and every team needs at least one at each position.";
    } else {
      var rwt = counts.RB + counts.WR + counts.TE;
      if (rwt < 4 * n) why = "only " + rwt + " running backs, receivers and tight ends qualify for the RB, WR, TE and FLEX slots.";
      else why = "the pool is too small to fill " + n + " rosters of " + FFP.ROSTER_SIZE + ".";
    }
    return name + " allows at most " + max + " teams: " + why;
  }

  function effectivePlayoffs(n, p) { return (p >= 6 && n >= 6) ? 6 : (p >= 4 && n >= 4) ? 4 : 2; }
  function playoffNote(n, p) {
    var e = effectivePlayoffs(n, p);
    if (e === 6) return "Top 6 of " + n + " make it. Regular season weeks 1–14; wild cards week 15 (seeds 1 and 2 rest), semifinals week 16, championship week 17.";
    if (e === 4) return "Top 4 of " + n + " make it. Regular season weeks 1–15; semifinals week 16, championship week 17.";
    return "With " + n + " teams, the top 2 meet in a week-17 championship. Regular season weeks 1–16.";
  }

  function renderSetup() {
    var v = setupValues();
    var settings = { historical: { includeInterceptions: v.includeInterceptions } };
    var sum = FFP.poolSummary(S.db, v.mode, settings);
    var c = sum.counts;
    $("pool-counts").innerHTML = "<thead><tr>" + POSITIONS.map(function (p) { return "<th>" + p + "</th>"; }).join("") +
      "<th>Max teams</th></tr></thead><tbody><tr>" + POSITIONS.map(function (p) {
        return '<td class="num">' + fmtInt(c[p]) + "</td>";
      }).join("") + '<td class="num">' + sum.maxTeams + "</td></tr></tbody>";
    $("pool-label").textContent = modeName(v.mode) + ": players with " + FFP.MIN_GAMES + " or more eligible games";
    if (!$("setup-strict-coverage").textContent) {
      $("setup-strict-coverage").textContent = "In this data: " + coverageText("strict", { historical: { includeInterceptions: false } });
    }

    var sel = $("setup-teams");
    var want = Number(sel.dataset.want || sel.value || 8);
    var max = Math.max(2, sum.maxTeams);
    var opts = "";
    for (var n = 2; n <= max; n++) opts += '<option value="' + n + '">' + n + " teams</option>";
    sel.innerHTML = opts;
    sel.value = String(Math.min(want, max));
    $("setup-teams-why").textContent = maxTeamsWhy(v.mode, c, sum.maxTeams);

    $("setup-int").disabled = v.mode !== "historical";
    var nTeams = Number(sel.value);
    $("setup-playoffs-note").textContent = playoffNote(nTeams, Number($("setup-playoffs").value));

    var pickSel = $("setup-pick");
    var pickWant = Number(pickSel.value) || 1;
    var po = "";
    for (var k = 1; k <= nTeams; k++) po += '<option value="' + k + '">Pick ' + k + " of " + nTeams + "</option>";
    pickSel.innerHTML = po;
    pickSel.value = String(Math.min(pickWant, nTeams));
    $("setup-pick-wrap").hidden = !$("setup-order-custom").checked;
  }

  function showSetup() {
    showScreen("setup");
    renderSetup();
    var notice = S.bootNotice;
    $("setup-error").textContent = notice || "";
    S.bootNotice = "";
  }

  function startLeague(opts, autodraft) {
    var lg = FFP.createLeague(opts, S.db);
    S.league = lg;
    S.tab = "week";
    S.draft = { search: "", pos: "ALL", hof: false, limit: DRAFT_PAGE, busy: false, timer: null };
    S.fa = { search: "", pos: "ALL", limit: PAGE, addPid: null, msg: "" };
    resetFilterControls();
    if (autodraft) autodraftAll();
    save();
    $("setup-seed").value = newSeed();
    route();
  }

  function resetFilterControls() {
    $("draft-search").value = "";
    $("draft-pos-all").checked = true;
    $("draft-hof").checked = false;
    $("fa-search").value = "";
    $("fa-pos-all").checked = true;
  }

  function autodraftAll() {
    var lg = S.league;
    var cp;
    while ((cp = FFP.currentPick(lg))) {
      if (team(cp.teamId).isUser) FFP.makePick(lg, S.db, FFP.aiPick(lg, S.db, cp.teamId));
      else FFP.runAIPicks(lg, S.db);
    }
  }

  // ------------------------------------------------------------------ draft

  function stopDraftTimer() {
    if (S.draft.timer) { clearTimeout(S.draft.timer); S.draft.timer = null; }
    S.draft.busy = false;
  }

  function showDraft() {
    showScreen("draft");
    renderDraft();
    runAIStep();
  }

  function rosterSlots(pids) {
    var out = { bench: [] };
    var used = {};
    ["QB", "RB", "WR", "TE", "DEF", "K"].forEach(function (s) {
      out[s] = null;
      for (var i = 0; i < pids.length; i++) {
        if (!used[pids[i]] && fits(pids[i], s)) { out[s] = pids[i]; used[pids[i]] = true; break; }
      }
    });
    out.FLEX = null;
    for (var j = 0; j < pids.length; j++) {
      if (!used[pids[j]] && fits(pids[j], "FLEX")) { out.FLEX = pids[j]; used[pids[j]] = true; break; }
    }
    pids.forEach(function (p) { if (!used[p]) out.bench.push(p); });
    return out;
  }

  function renderDraft() {
    var lg = S.league;
    if (!lg || lg.stage !== "draft") return;
    $("draft-sub").textContent = lg.name + " · " + modeName(lg.mode) + " · " + lg.numTeams + " teams · snake draft, " + FFP.ROSTER_SIZE + " rounds";
    renderDraftClock();
    renderDraftTable();
    renderDraftRoster();
    renderDraftLog();
  }

  function userNextPick() {
    var lg = S.league;
    var n = lg.numTeams;
    for (var o = lg.picks.length + 1; o <= n * FFP.ROSTER_SIZE; o++) {
      var round = Math.ceil(o / n);
      var inRound = ((o - 1) % n) + 1;
      var idx = round % 2 === 1 ? inRound - 1 : n - inRound;
      if (lg.draftOrder[idx] === uid()) return { overall: o, round: round, pickInRound: inRound };
    }
    return null;
  }

  function renderDraftClock() {
    var cp = FFP.currentPick(S.league);
    var box = $("draft-clock");
    var el = $("draft-clock-main");
    if (!cp) { box.classList.remove("mine"); el.innerHTML = '<span class="clock-title">The draft is complete.</span>'; return; }
    var t = team(cp.teamId);
    var mine = t.isUser;
    box.classList.toggle("mine", mine);
    var title = mine ? "You're on the clock" : esc(t.name) + (S.draft.busy ? " are picking…" : " are up next");
    var sub = "Round " + cp.round + " · pick " + cp.pickInRound + " · " + cp.overall + " overall";
    if (!mine) {
      var nx = userNextPick();
      if (nx) sub += " · your next pick: " + nx.overall + " overall";
    }
    var sl = rosterSlots(S.league.rosters[uid()] || []);
    var needs = SLOTS.filter(function (s) { return !sl[s]; });
    el.innerHTML = '<span class="clock-title">' + title + '</span><span class="clock-sub">' + sub + "</span>" +
      '<span class="clock-needs">' + (needs.length ? "You still need " + esc(needs.join(", ")) + "." : "Your starting slots are filled; the rest is bench.") + "</span>";
  }

  function draftList() {
    var pool = leaguePool();
    var owned = {};
    Object.keys(S.league.rosters).forEach(function (tid) { S.league.rosters[tid].forEach(function (p) { owned[p] = tid; }); });
    var q = S.draft.search.toLowerCase();
    return pool.list.filter(function (p) {
      if (owned[p.id]) return false;
      if (S.draft.pos !== "ALL" && p.pos !== S.draft.pos) return false;
      if (S.draft.hof && !p.hof) return false;
      if (q && p.name.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function renderDraftTable() {
    var lg = S.league;
    var cp = FFP.currentPick(lg);
    var myTurn = !!cp && team(cp.teamId).isUser && !S.draft.busy;
    var list = draftList();
    var shown = list.slice(0, S.draft.limit);
    var blocked = [];
    var rows = shown.map(function (p) {
      var chk = FFP.canPick(lg, S.db, uid(), p.id);
      var disabled = !myTurn || !chk.ok;
      var why = !chk.ok ? chk.reason : (!myTurn ? "Wait for your pick." : "Draft " + p.name);
      if (!chk.ok && blocked.indexOf(chk.reason) < 0) blocked.push(chk.reason);
      var pl = player(p.id);
      return "<tr" + (chk.ok ? "" : ' class="taken"') + '><td class="player"><span class="player-name">' + esc(p.name) + "</span>" + hofBadge(p) +
        '<span class="player-sub">' + esc([yearsOf(p)].concat(pl.teams || []).join(" · ")) + '<span class="show-sm"> · ' + p.eligibleCount + " games</span></span>" +
        (chk.ok ? "" : '<span class="sr">You can\'t draft him now. ' + esc(chk.reason) + "</span>") + "</td>" +
        "<td>" + posChip(p.pos) + '</td><td class="n hide-sm">' + p.eligibleCount +
        '</td><td class="n">' + p.avgPoints.toFixed(2) + '</td><td><button type="button" class="btn btn-small" id="pick-' + esc(p.id) +
        '" data-pick="' + esc(p.id) + '" title="' + esc(why) + '"' + (disabled ? " disabled" : "") + ">Draft</button></td></tr>";
    });
    if (!rows.length) rows.push('<tr class="empty-row"><td colspan="5">No available players match this search.</td></tr>');
    $("draft-tbody").innerHTML = rows.join("");
    var note = $("draft-blocked");
    note.hidden = !blocked.length;
    note.innerHTML = blocked.length ? "<b>Greyed-out players can't be drafted by you right now.</b> " +
      blocked.slice(0, 4).map(esc).join(" ") + (blocked.length > 4 ? " (and " + (blocked.length - 4) + " more reasons)" : "") : "";
    $("draft-more").hidden = list.length <= S.draft.limit;
    $("draft-count").textContent = "Showing " + shown.length + " of " + list.length + " available";
    $("draft-autopick").disabled = !myTurn;
    $("draft-autodraft").disabled = !cp || S.draft.busy;
  }

  function renderDraftRoster() {
    var mine = S.league.rosters[uid()] || [];
    var sl = rosterSlots(mine);
    var items = SLOTS.map(function (s) {
      var pid = sl[s];
      if (!pid) return '<li class="open"><span class="slot">' + s + '</span><span class="who">Open</span><span></span></li>';
      var p = player(pid);
      return '<li><span class="slot">' + s + '</span><span class="who">' + esc(p.name) + hofBadge(p) + "</span>" + posChip(p.pos) + "</li>";
    });
    for (var b = 0; b < FFP.BENCH; b++) {
      var bp = sl.bench[b];
      if (bp) {
        var p2 = player(bp);
        items.push('<li><span class="slot">BN</span><span class="who">' + esc(p2.name) + hofBadge(p2) + "</span>" + posChip(p2.pos) + "</li>");
      } else {
        items.push('<li class="open"><span class="slot">BN</span><span class="who">Open</span><span></span></li>');
      }
    }
    $("draft-roster").innerHTML = items.join("");
    var needs = SLOTS.filter(function (s) { return !sl[s]; });
    var left = FFP.ROSTER_SIZE - mine.length;
    $("draft-needs").textContent = left === 0 ? "Your roster is full." :
      (needs.length ? "Still to fill: " + needs.join(", ") + ". " : "Every starting slot is filled. ") + plural(left, "pick") + " left.";
  }

  function renderDraftLog() {
    var lg = S.league;
    var items = lg.picks.slice().reverse().map(function (pk) {
      var p = player(pk.pid);
      var mine = pk.teamId === uid();
      return '<li class="' + (mine ? "mine" : "") + '"><span class="pk num">' + pk.round + "." + pad2(pk.pickInRound) + '</span><span class="who"><b>' +
        esc(p.name) + "</b> " + posChip(p.pos) + '<span class="team">' + esc(teamName(pk.teamId)) + "</span></span></li>";
    });
    $("draft-log").innerHTML = items.length ? items.join("") : '<li><span class="pk"></span><span class="who">No picks yet.</span></li>';
  }

  function runAIStep() {
    var lg = S.league;
    if (!lg) return;
    if (lg.stage !== "draft") { finishDraft(); return; }
    var cp = FFP.currentPick(lg);
    if (!cp) { finishDraft(); return; }
    if (team(cp.teamId).isUser) {
      S.draft.busy = false;
      renderDraft();
      return;
    }
    S.draft.busy = true;
    renderDraftClock();
    renderDraftTable();
    S.draft.timer = setTimeout(function () {
      S.draft.timer = null;
      try {
        FFP.makePick(lg, S.db, FFP.aiPick(lg, S.db, cp.teamId));
      } catch (e) {
        S.draft.busy = false;
        $("draft-error").textContent = e.message;
        return;
      }
      save();
      renderDraftLog();
      renderDraftRoster();
      runAIStep();
    }, reducedMotion() ? 0 : 90);
  }

  function userPick(pid) {
    var lg = S.league;
    var cp = FFP.currentPick(lg);
    if (!cp || !team(cp.teamId).isUser || S.draft.busy) return;
    FFP.makePick(lg, S.db, pid);
    save();
    renderDraft();
    runAIStep();
  }

  function finishDraft() {
    stopDraftTimer();
    S.tab = "week";
    save();
    showHub();
  }

  // ------------------------------------------------------------------ hub

  function weekLabel(w) {
    var lg = S.league;
    if (w <= lg.regularWeeks) return "Week " + w;
    var m = lg.schedule[w] && lg.schedule[w][0];
    var label = m && m.label ? m.label : (w === FFP.TOTAL_WEEKS ? "Championship" : w === FFP.TOTAL_WEEKS - 1 ? "Semifinal" : "Wild card");
    return "Week " + w + " · " + label;
  }

  function standingsMap() {
    var st = FFP.standings(S.league);
    var m = {};
    st.forEach(function (r, i) { r.rank = i + 1; m[r.teamId] = r; });
    return { list: st, byId: m };
  }
  function recText(r) { return r ? r.w + "–" + r.l + (r.t ? "–" + r.t : "") : ""; }

  function showHub() {
    showScreen("hub");
    renderHub();
  }

  function renderHub() {
    var lg = S.league;
    if (!lg) return;
    var st = standingsMap();
    var me = st.byId[uid()];
    $("hub-league").textContent = lg.name + " · " + modeName(lg.mode) + (lg.mode === "historical" && lg.settings.historical.includeInterceptions ? " + interceptions" : "") + " · " + lg.numTeams + " teams";
    var title = $("hub-title");
    if (lg.stage === "complete") {
      title.textContent = "Season complete";
      title.dataset.week = "done";
    } else {
      title.textContent = weekLabel(lg.week);
      title.dataset.week = String(lg.week);
    }
    var phase = lg.stage === "complete" ? "Final standings are in." :
      lg.week <= lg.regularWeeks ? "Regular season: weeks 1–" + lg.regularWeeks + ". Playoffs (" + lg.playoffTeams + " teams): weeks " + (lg.regularWeeks + 1) + "–" + FFP.TOTAL_WEEKS + "." :
      "Playoffs: " + lg.playoffTeams + " teams, weeks " + (lg.regularWeeks + 1) + "–" + FFP.TOTAL_WEEKS + ".";
    $("hub-sub").textContent = phase;
    var revised = (lg.dataVersion || null) !== (S.db.dataVersion || null);
    $("hub-notice").hidden = !revised;
    $("hub-notice").textContent = revised ? "This league was saved with an earlier build of the game data. Weeks already played keep their stored scores, and a replay marks any game whose record has changed since. New weeks draw from the current data." : "";
    $("hub-record").innerHTML = "<dl><div><dt>" + esc(teamName(uid())) + "</dt><dd>" + recText(me) + "</dd></div><div><dt>Rank</dt><dd>" + me.rank + "/" + lg.numTeams +
      "</dd></div><div><dt>Points for</dt><dd>" + fmtPts(me.pf) + "</dd></div></dl>";
    ["week", "team", "schedule", "standings", "fa", "results", "rules"].forEach(function (t) {
      var on = S.tab === t;
      $("tab-" + t).setAttribute("aria-selected", on ? "true" : "false");
      $("tab-" + t).tabIndex = on ? 0 : -1;
      $("panel-" + t).hidden = !on;
      // Only the open page keeps its markup, so ids like watch-3-1 stay unique.
      if (!on) { if (t === "fa") $("fa-body").innerHTML = ""; else $("panel-" + t).innerHTML = ""; }
    });
    var fn = { week: renderWeekTab, team: renderTeamTab, schedule: renderScheduleTab, standings: renderStandingsTab, fa: renderFaTab, results: renderResultsTab, rules: renderRulesTab }[S.tab];
    fn(st);
  }

  function setTab(t) {
    S.tab = t;
    showHubError("");
    renderHub();
  }

  function userMatchupIndex(w) {
    var ms = S.league.schedule[w] || [];
    for (var i = 0; i < ms.length; i++) if (ms[i].home === uid() || ms[i].away === uid()) return i;
    return -1;
  }

  function noGameReason(w) {
    var lg = S.league;
    if (w <= lg.regularWeeks) return "Your team is idle this week: with an odd number of teams, one team sits out each week.";
    var seeds = lg.playoffs && lg.playoffs.seeds;
    if (!seeds || seeds.indexOf(uid()) < 0) return "Your team missed the playoffs. Play the remaining weeks to finish the season.";
    var seed = seeds.indexOf(uid()) + 1;
    if (lg.playoffTeams === 6 && w === lg.regularWeeks + 1 && seed <= 2) return "As the " + seed + " seed you rest this week and play in the semifinal.";
    return "Your team was knocked out of the playoffs. Play the remaining weeks to finish the season.";
  }

  // One result row (played) or pairing (not yet played).
  function scoreRow(m, opts) {
    opts = opts || {};
    var st = opts.st;
    var mine = m.home === uid() || m.away === uid();
    var played = m.homeScore !== undefined && m.homeScore !== null;
    function side(tid, score, seed) {
      var won = played && m.winner === tid;
      var meta = seed ? "#" + seed + " " : "";
      var rec = !played && st && st.byId[tid] ? ' <span class="tag">' + recText(st.byId[tid]) + "</span>" : "";
      return '<div class="sr-team' + (won ? " won" : "") + '"><span class="tn">' + (meta ? '<span class="tag">' + esc(meta) + "</span>" : "") +
        esc(teamName(tid)) + rec + "</span>" + (played ? '<span class="sc">' + fmtPts(score) + "</span>" : "") + "</div>";
    }
    var act = opts.watch ? '<div class="sr-act"><button type="button" class="btn btn-small" id="' + (opts.idPrefix || "watch-") + opts.watch.week + "-" + opts.watch.idx +
      '" data-watch="' + opts.watch.week + ":" + opts.watch.idx + '">' + esc(opts.watchLabel || "Replay") + "</button></div>" : '<div class="sr-act"></div>';
    return '<li class="score-row' + (mine ? " mine" : "") + '">' + side(m.home, m.homeScore, m.homeSeed) + side(m.away, m.awayScore, m.awaySeed) + act + "</li>";
  }

  function renderWeekTab(st) {
    var lg = S.league;
    var el = $("panel-week");
    var html = "";
    if (lg.stage === "complete") {
      var champ = lg.champion;
      var mine = champ === uid();
      var finalIdx = 0;
      html += '<div class="champion"><span class="eyebrow">' + FFP.TOTAL_WEEKS + " weeks played</span><h3 class=\"display\">" +
        (champ ? esc(teamName(champ)) + (mine ? " win the title. That's you." : " win the title.") : "No champion was decided.") + "</h3>" +
        '<p class="hub-sub">' + esc(teamName(uid())) + " finished " + recText(st.byId[uid()]) + " in the regular season, ranked " + st.byId[uid()].rank + " of " + lg.numTeams + ".</p>" +
        '<div class="btn-row"><button type="button" class="btn btn-primary" id="watch-' + FFP.TOTAL_WEEKS + "-" + finalIdx + '" data-watch="' + FFP.TOTAL_WEEKS + ":" + finalIdx + '">Replay the championship</button>' +
        '<button type="button" class="btn" id="week-new-league">Start a new league</button></div></div>';
      el.innerHTML = html;
      return;
    }
    var w = lg.week;
    var idx = userMatchupIndex(w);
    var matchups = lg.schedule[w] || [];
    if (idx >= 0) {
      var m = matchups[idx];
      var hs = m.homeSeed ? "#" + m.homeSeed + " seed · " : "";
      var as = m.awaySeed ? "#" + m.awaySeed + " seed · " : "";
      html += '<div class="matchup-card"><div class="side home"><span class="tmeta">Home · ' + esc(hs) + recText(st.byId[m.home]) + '</span><span class="tname">' + esc(teamName(m.home)) +
        '</span></div><span class="vs-mark" aria-hidden="true">vs</span><div class="side away"><span class="tmeta">Visitors · ' + esc(as) + recText(st.byId[m.away]) +
        '</span><span class="tname">' + esc(teamName(m.away)) + '</span></div><div class="matchup-actions"><button type="button" class="btn btn-primary btn-big" id="play-week" data-week="' + w + '">Play week ' + w +
        '</button><span class="fine">Draws one real game for every player on a team with a game this week, then opens the scoreboard.</span></div></div>';
    } else {
      html += '<div class="matchup-card"><div class="side"><span class="tmeta">' + esc(weekLabel(w)) + '</span><span class="tname">No game for ' + esc(teamName(uid())) + "</span>" +
        '<span class="hub-sub">' + esc(noGameReason(w)) + '</span></div><div class="matchup-actions"><button type="button" class="btn btn-primary btn-big" id="play-week" data-week="' + w + '">Play week ' + w +
        "</button></div></div>";
    }

    html += '<div class="two-col"><div class="panel">' + lineupEditorHtml(w) + "</div><div class=\"tabpanel\">";
    var others = matchups.map(function (mm, i) { return { m: mm, i: i }; }).filter(function (x) { return x.i !== idx; });
    html += '<div class="week-block"><h3 class="label-rule">Other games in ' + esc(weekLabel(w).toLowerCase()) + "</h3>";
    html += others.length ? '<ul class="score-list">' + others.map(function (x) { return scoreRow(x.m, { st: st }); }).join("") + "</ul>" :
      '<p class="fine">No other games this week.</p>';
    html += "</div>";
    var prev = lg.results[w - 1];
    if (prev) {
      html += '<div class="week-block"><h3 class="label-rule">Results from ' + esc(weekLabel(w - 1).toLowerCase()) + '</h3><ul class="score-list">' +
        prev.matchups.map(function (mm, i) { return scoreRow(mm, { watch: { week: w - 1, idx: i } }); }).join("") + "</ul></div>";
    }
    html += "</div></div>";
    el.innerHTML = html;
  }

  function lineupEditorHtml(w) {
    var lg = S.league;
    var lu = lg.lineups[uid()];
    var roster = lg.rosters[uid()];
    var pool = leaguePool();
    if (!lu) return "<h3>Lineup</h3><p>No lineup yet.</p>";
    var where = {};
    SLOTS.forEach(function (s) { where[lu[s]] = s; });
    lu.bench.forEach(function (p) { where[p] = "bench"; });
    function byeNote(pid) {
      var b = lg.byes[pid];
      if (b === w) return '<span class="bye-chip">BYE</span>';
      if (b === null || b === undefined) return "no bye";
      return b < w ? "bye done" : "bye wk " + b;
    }
    var warn = [];
    var rows = SLOTS.map(function (s) {
      var opts = roster.filter(function (pid) { return fits(pid, s); }).sort(function (a, b) {
        return ((pool.byId[b] || {}).avgPoints || 0) - ((pool.byId[a] || {}).avgPoints || 0);
      }).map(function (pid) {
        var p = player(pid);
        var tag = where[pid] && where[pid] !== s ? " · " + (where[pid] === "bench" ? "bench" : where[pid]) : "";
        var bye = lg.byes[pid] === w ? " · BYE" : "";
        return '<option value="' + esc(pid) + '"' + (lu[s] === pid ? " selected" : "") + ">" + esc(p.name) + " (" + esc(p.pos) + ")" + esc(bye + tag) + "</option>";
      }).join("");
      var onBye = lg.byes[lu[s]] === w;
      if (onBye) warn.push(player(lu[s]).name + " (" + s + ")");
      return '<li class="' + (onBye ? "warn" : "") + '"><label class="slot" for="lineup-' + s + '">' + s + '</label><select id="lineup-' + s + '" data-slot="' + s + '">' + opts +
        '</select><span class="meta">' + byeNote(lu[s]) + "</span></li>";
    }).join("");
    var bench = lu.bench.map(function (pid) {
      var p = player(pid);
      return "<li><span>" + posChip(p.pos) + " " + esc(p.name) + hofBadge(p) + '</span><span class="fine">' + byeNote(pid) + "</span></li>";
    }).join("");
    return "<h3>Lineup for " + esc(weekLabel(w).toLowerCase()) + '</h3><ul class="lineup">' + rows + "</ul>" +
      (warn.length ? '<p class="error">On bye this week, so they score 0: ' + esc(warn.join(", ")) + ". Swap in a bench player.</p>" : "") +
      '<h3>Bench (not counted)</h3><ul class="bench-list">' + bench + "</ul>" +
      '<div class="btn-row"><button type="button" class="btn btn-small" id="lineup-auto">Set best lineup</button><span class="fine">Picks the highest averages and avoids byes.</span></div>' +
      '<p class="error" id="lineup-error" role="alert"></p>';
  }

  function changeSlot(slot, pid) {
    var lg = S.league;
    var lu = clone(lg.lineups[uid()]);
    var prev = lu[slot];
    if (prev === pid) return;
    var from = null;
    SLOTS.forEach(function (s) { if (lu[s] === pid) from = s; });
    var bi = lu.bench.indexOf(pid);
    lu[slot] = pid;
    if (from) lu[from] = prev;
    else if (bi >= 0) lu.bench[bi] = prev;
    if (from && !fits(prev, from)) {
      // The swapped-out player can't play the vacated slot: bench him and fill it from the bench.
      var pool = leaguePool();
      var w = lg.week;
      var cands = lu.bench.filter(function (p) { return fits(p, from); }).sort(function (a, b) {
        var ba = lg.byes[a] === w ? 1 : 0, bb = lg.byes[b] === w ? 1 : 0;
        return (ba - bb) || (((pool.byId[b] || {}).avgPoints || 0) - ((pool.byId[a] || {}).avgPoints || 0));
      });
      if (!cands.length) throw new Error("No one on the bench can play " + from + ", so that move doesn't work.");
      lu[from] = cands[0];
      lu.bench[lu.bench.indexOf(cands[0])] = prev;
    }
    FFP.setLineup(lg, S.db, uid(), lu);
    save();
  }

  function renderTeamTab(st) {
    var lg = S.league;
    var me = uid();
    var pool = leaguePool();
    var lu = lg.lineups[me] || { bench: [] };
    var slotOf = {};
    SLOTS.forEach(function (s) { slotOf[lu[s]] = s; });
    var pts = {}, last = {};
    Object.keys(lg.results).map(Number).sort(function (a, b) { return a - b; }).forEach(function (w) {
      lg.results[w].matchups.forEach(function (m) {
        if (m.home !== me && m.away !== me) return;
        (m.lines[me] || []).forEach(function (l) { if (!l.bye) { pts[l.pid] = (pts[l.pid] || 0) + Math.round(l.points * 100); last[l.pid] = { w: w, pts: l.points, starter: true }; } });
        ((m.bench && m.bench[me]) || []).forEach(function (l) { if (!l.bye) last[l.pid] = { w: w, pts: l.points, starter: false }; });
      });
    });
    var order = SLOTS.map(function (s) { return lu[s]; }).concat(lu.bench).filter(Boolean);
    lg.rosters[me].forEach(function (p) { if (order.indexOf(p) < 0) order.push(p); });
    var rows = order.map(function (pid) {
      var p = player(pid);
      var e = pool.byId[pid];
      var used = (lg.consumed[pid] || []).length;
      var left = e ? e.eligibleCount - used : null;
      var bye = lg.byes[pid];
      var lst = last[pid];
      return "<tr><td class=\"num\">" + (slotOf[pid] || "BN") + '</td><td class="player"><span class="player-name">' + esc(p.name) + "</span>" + hofBadge(p) +
        '<span class="player-sub">' + esc(yearsOf(p)) + "</span></td><td>" + posChip(p.pos) + '</td><td class="n">' +
        (bye === null || bye === undefined ? "none" : (lg.stage !== "complete" && bye === lg.week ? '<span class="bye-chip">BYE</span> ' : "") + "wk " + bye) +
        '</td><td class="n">' + used + '</td><td class="n">' + (left === null ? "?" : left) + '</td><td class="n">' + fmtPts((pts[pid] || 0) / 100) +
        '</td><td class="n">' + (lst ? "wk " + lst.w + ": " + fmtPts(lst.pts) + (lst.starter ? "" : " (BN)") : "–") + "</td></tr>";
    }).join("");
    var html = '<div class="week-block"><h3 class="label-rule">Roster</h3><div class="table-wrap"><table class="stat-table"><thead><tr><th>Slot</th><th>Player</th><th>Pos</th>' +
      '<th class="n">Bye</th><th class="n">Games used</th><th class="n">Games left</th><th class="n">Pts as starter</th><th class="n">Last game</th></tr></thead><tbody>' + rows +
      '</tbody></table></div><p class="fine">Games used counts every real game this player has drawn in this league, on any team. Games left is how many eligible games he can still draw.</p></div>';

    var weeks = Object.keys(lg.results).map(Number).sort(function (a, b) { return b - a; });
    var mine = [];
    weeks.forEach(function (w) {
      lg.results[w].matchups.forEach(function (m, i) {
        if (m.home !== me && m.away !== me) return;
        var home = m.home === me;
        var opp = home ? m.away : m.home;
        var my = home ? m.homeScore : m.awayScore;
        var their = home ? m.awayScore : m.homeScore;
        var r = m.winner === me ? "W" : m.winner ? "L" : "T";
        mine.push("<tr><td>" + esc(weekLabel(w)) + "</td><td>" + (home ? "vs " : "at ") + esc(teamName(opp)) + '</td><td><span class="wl ' + r.toLowerCase() + '">' + r +
          '</span></td><td class="n">' + fmtPts(my) + "–" + fmtPts(their) + '</td><td><button type="button" class="btn btn-small" id="watch-' + w + "-" + i +
          '" data-watch="' + w + ":" + i + '">Replay</button></td></tr>');
      });
    });
    html += '<div class="week-block"><h3 class="label-rule">Your games</h3>' + (mine.length ? '<div class="table-wrap"><table class="stat-table"><thead><tr><th>Week</th><th>Opponent</th><th>Result</th><th class="n">Score</th><th><span class="sr">Replay</span></th></tr></thead><tbody>' +
      mine.join("") + "</tbody></table></div>" : '<p class="fine">No games played yet.</p>') + "</div>";
    var tx = (lg.transactions || []).filter(function (t) { return t.teamId === me; });
    if (tx.length) {
      html += '<div class="week-block"><h3 class="label-rule">Moves</h3><ul class="bench-list">' + tx.map(function (t) {
        return "<li><span>Before week " + t.week + ": added " + esc(player(t.add).name) + ", dropped " + esc(player(t.drop).name) + "</span></li>";
      }).join("") + "</ul></div>";
    }
    $("panel-team").innerHTML = html;
  }

  function renderScheduleTab(st) {
    var lg = S.league;
    var html = "";
    for (var w = 1; w <= FFP.TOTAL_WEEKS; w++) {
      var now = lg.stage !== "complete" && w === lg.week;
      var res = lg.results[w];
      var sched = lg.schedule[w];
      var body;
      if (res) {
        body = '<ul class="score-list">' + res.matchups.map(function (m, i) { return scoreRow(m, { watch: { week: w, idx: i } }); }).join("") + "</ul>";
      } else if (sched) {
        body = '<ul class="score-list">' + sched.map(function (m) { return scoreRow(m, { st: st }); }).join("") + "</ul>";
      } else {
        body = '<p class="fine">' + esc(playoffPlaceholder(w)) + "</p>";
      }
      html += '<div class="week-block"><h3>' + esc(weekLabel(w)) + (now ? '<span class="now">Up next</span>' : "") + "</h3>" + body + "</div>";
    }
    $("panel-schedule").innerHTML = '<div class="week-grid">' + html + "</div>";
  }

  function playoffPlaceholder(w) {
    var lg = S.league;
    var p = lg.playoffTeams;
    if (w === FFP.TOTAL_WEEKS && p !== 2) return "Championship: the semifinal winners. Set after week " + (w - 1) + ".";
    if (w === FFP.TOTAL_WEEKS) return "Championship: seeds 1 and 2. Set after week " + lg.regularWeeks + ".";
    if (p === 6 && w === lg.regularWeeks + 1) return "Wild cards: seeds 3 v 6 and 4 v 5. Seeds 1 and 2 rest. Set after week " + lg.regularWeeks + ".";
    if (p === 6) return "Semifinals: 1 v winner of 4/5 and 2 v winner of 3/6. Set after week " + (w - 1) + ".";
    return "Semifinals: seeds 1 v 4 and 2 v 3. Set after week " + lg.regularWeeks + ".";
  }

  function renderStandingsTab(st) {
    var lg = S.league;
    var rows = st.list.map(function (r, i) {
      var cut = i === lg.playoffTeams - 1 && i < st.list.length - 1;
      return '<tr class="' + (r.teamId === uid() ? "me " : "") + (cut ? "cut" : "") + '"><td class="n">' + (i + 1) + '</td><td class="player"><span class="player-name">' + esc(teamName(r.teamId)) +
        '</span></td><td class="n">' + r.w + '</td><td class="n">' + r.l + '</td><td class="n">' + r.t + '</td><td class="n">' + fmtPts(r.pf) + '</td><td class="n">' + fmtPts(r.pa) + "</td></tr>";
    }).join("");
    var html = '<div class="week-block"><h3 class="label-rule">Standings</h3><div class="table-wrap"><table class="stat-table"><thead><tr><th class="n">#</th><th>Team</th><th class="n">W</th><th class="n">L</th><th class="n">T</th><th class="n">PF</th><th class="n">PA</th></tr></thead><tbody>' +
      rows + '</tbody></table></div><p class="fine">Ranked by wins (a tie counts half), then points for. ' +
      (lg.playoffTeams >= lg.numTeams ? "All " + lg.numTeams + " teams make the playoffs; this order sets the seeds." :
        "The dashed line is the playoff cut: the top " + lg.playoffTeams + " make it.") + "</p></div>";
    html += bracketHtml(st);
    $("panel-standings").innerHTML = html;
  }

  function bracketHtml(st) {
    var lg = S.league;
    var seeds = lg.playoffs && lg.playoffs.seeds;
    var projected = !seeds;
    if (!seeds) seeds = st.list.slice(0, lg.playoffTeams).map(function (r) { return r.teamId; });
    function seedOf(tid) { return seeds.indexOf(tid) + 1; }
    function slotHtml(tid, score, win, text) {
      if (!tid) return '<div class="bt"><span class="seed"></span><span class="nm tbd">' + esc(text || "To be decided") + "</span><span></span></div>";
      return '<div class="bt' + (win ? " win" : "") + (tid === uid() ? " me" : "") + '"><span class="seed">' + seedOf(tid) + '</span><span class="nm">' + esc(teamName(tid)) +
        '</span><span class="sc">' + (score === undefined || score === null ? "" : fmtPts(score)) + "</span></div>";
    }
    var rounds = [];
    for (var w = lg.regularWeeks + 1; w <= FFP.TOTAL_WEEKS; w++) {
      var games = [];
      var res = lg.results[w];
      var sched = lg.schedule[w];
      if (res) {
        games = res.matchups.map(function (m) { return slotHtml(m.home, m.homeScore, m.winner === m.home) + slotHtml(m.away, m.awayScore, m.winner === m.away); });
      } else if (sched) {
        games = sched.map(function (m) { return slotHtml(m.home) + slotHtml(m.away); });
      } else {
        var s = function (n) { return seeds[n - 1]; };
        var p = lg.playoffTeams;
        if (w === FFP.TOTAL_WEEKS && p === 2) games = [slotHtml(s(1)) + slotHtml(s(2))];
        else if (w === FFP.TOTAL_WEEKS) games = [slotHtml(null, null, false, "Semifinal winner") + slotHtml(null, null, false, "Semifinal winner")];
        else if (p === 6 && w === lg.regularWeeks + 1) games = [slotHtml(s(3)) + slotHtml(s(6)), slotHtml(s(4)) + slotHtml(s(5))];
        else if (p === 6) games = [slotHtml(s(1)) + slotHtml(null, null, false, "Winner of 4 v 5"), slotHtml(s(2)) + slotHtml(null, null, false, "Winner of 3 v 6")];
        else games = [slotHtml(s(1)) + slotHtml(s(4)), slotHtml(s(2)) + slotHtml(s(3))];
      }
      rounds.push('<div class="bracket-round"><h4>' + esc(weekLabel(w)) + "</h4>" + games.map(function (g) { return '<div class="bracket-game">' + g + "</div>"; }).join("") + "</div>");
    }
    return '<div class="week-block"><h3 class="label-rule">Playoff bracket' + (projected ? ": if the season ended today" : "") + '</h3><div class="bracket">' + rounds.join("") + "</div>" +
      '<p class="fine">A tied playoff game goes to the higher seed.</p></div>';
  }

  function renderFaTab() {
    var lg = S.league;
    var el = $("fa-body");
    var open = lg.stage === "season";
    var html = "";
    if (!open) {
      html += '<p class="notice">Free agency is closed: the season is over.</p>';
    }
    if (S.fa.msg) html += '<p class="notice good" role="status">' + esc(S.fa.msg) + "</p>";
    if (open && S.fa.addPid) html += dropChooserHtml(S.fa.addPid);
    var q = S.fa.search.toLowerCase();
    var list = FFP.freeAgents(lg, S.db).filter(function (p) {
      if (S.fa.pos !== "ALL" && p.pos !== S.fa.pos) return false;
      if (q && p.name.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var shown = list.slice(0, S.fa.limit);
    var rows = shown.map(function (p) {
      return '<tr><td class="player"><span class="player-name">' + esc(p.name) + "</span>" + hofBadge(p) + '<span class="player-sub">' + esc(yearsOf(p)) + "</span></td><td>" + posChip(p.pos) +
        '</td><td class="n hide-sm">' + p.eligibleCount + '</td><td class="n">' + p.remaining + '</td><td class="n">' + p.avgPoints.toFixed(2) +
        '</td><td><button type="button" class="btn btn-small" id="add-' + esc(p.id) + '" data-add="' + esc(p.id) + '"' + (open ? "" : " disabled") + ">Add</button></td></tr>";
    });
    if (!rows.length) rows.push('<tr class="empty-row"><td colspan="6">No free agents match this search.</td></tr>');
    html += '<div class="table-wrap"><table class="stat-table"><thead><tr><th>Player</th><th>Pos</th><th class="n hide-sm">Games</th><th class="n">Left</th><th class="n">Avg</th><th><span class="sr">Add</span></th></tr></thead><tbody>' +
      rows.join("") + "</tbody></table></div>" +
      '<div class="btn-row">' + (list.length > S.fa.limit ? '<button type="button" class="btn btn-quiet" id="fa-more">Show more players</button>' : "") +
      '<p class="fine">Showing ' + shown.length + " of " + list.length + " free agents. Left = eligible games not yet drawn by anyone. A player you add gets a bye in a later regular-season week if any remain.</p></div>";
    el.innerHTML = html;
  }

  function dropChooserHtml(addPid) {
    var lg = S.league;
    var add = player(addPid);
    var rows = lg.rosters[uid()].map(function (pid) {
      var p = player(pid);
      var why = "";
      var test = clone(lg);
      try { FFP.addDrop(test, S.db, uid(), addPid, pid); } catch (e) { why = e.message; }
      return "<li><span>" + posChip(p.pos) + " " + esc(p.name) + (why ? '<span class="player-sub">' + esc(why) + "</span>" : "") +
        '</span><button type="button" class="btn btn-small" id="drop-' + esc(pid) + '" data-drop="' + esc(pid) + '"' + (why ? " disabled" : "") + ">Drop</button></li>";
    }).join("");
    return '<div class="panel drop-chooser"><h3>Add ' + esc(add.name) + " (" + esc(add.pos) + "): choose who to drop</h3>" +
      '<ul class="bench-list">' + rows + '</ul><div class="btn-row"><button type="button" class="btn btn-quiet" id="fa-cancel">Cancel</button></div><p class="error" id="fa-error" role="alert"></p></div>';
  }

  function renderResultsTab() {
    var lg = S.league;
    var weeks = Object.keys(lg.results).map(Number).sort(function (a, b) { return b - a; });
    if (!weeks.length) { $("panel-results").innerHTML = '<p class="fine">No weeks played yet. Results appear here after each week, with a replay of every game.</p>'; return; }
    $("panel-results").innerHTML = '<div class="week-grid">' + weeks.map(function (w) {
      return '<div class="week-block"><h3>' + esc(weekLabel(w)) + '</h3><ul class="score-list">' +
        lg.results[w].matchups.map(function (m, i) { return scoreRow(m, { watch: { week: w, idx: i } }); }).join("") + "</ul></div>";
    }).join("") + "</div>";
  }

  function renderRulesTab() {
    var lg = S.league;
    var r = lg.rules;
    var strict = lg.mode === "strict";
    var ints = !strict && lg.settings.historical.includeInterceptions;
    function li(a, b) { return "<li><span>" + esc(a) + "</span><span>" + esc(b) + "</span></li>"; }
    function per(rate, unit) { return fmtNum(rate) + " per " + unit + (rate > 0 && rate < 1 ? " (1 per " + fmtNum(Math.round(1 / rate)) + ")" : ""); }
    var o = r.offense, k = r.kicker, d = r.defense;
    var off = li("Passing yards", per(o.pass_yd, "yard")) + li("Passing TD", fmtNum(o.pass_td)) + li("Interception thrown", fmtNum(o.pass_int)) +
      li("Rushing yards", per(o.rush_yd, "yard")) + li("Rushing TD", fmtNum(o.rush_td)) + li("Reception", fmtNum(o.rec)) +
      li("Receiving yards", per(o.rec_yd, "yard")) + li("Receiving TD", fmtNum(o.rec_td)) + li("Return TD", fmtNum(o.ret_td)) +
      (strict ? li("Two-point conversion", fmtNum(o.two_pt)) + li("Fumble-recovery TD", fmtNum(o.fum_rec_td)) : "");
    var kick = strict ? li("Field goal 0–39 yd", fmtNum(k.fg_0_39)) + li("Field goal 40–49 yd", fmtNum(k.fg_40_49)) + li("Field goal 50+ yd", fmtNum(k.fg_50p)) +
      li("Extra point", fmtNum(k.xp)) + li("Missed field goal", fmtNum(k.fg_miss)) :
      li("Field goal, any distance", fmtNum(k.fg_flat)) + li("Extra point", fmtNum(k.xp)) + li("Missed field goal", fmtNum(k.fg_miss));
    var def = strict ? li("Sack", fmtNum(d.sack)) + li("Interception", fmtNum(d.int)) + li("Fumble recovery", fmtNum(d.fum_rec)) + li("Safety", fmtNum(d.safety)) +
      li("Blocked punt, FG or extra point", fmtNum(d.block)) + li("Interception or fumble return TD", fmtNum(d.def_td)) + li("Kick or punt return TD", fmtNum(d.ret_td)) :
      li("Kick or punt return TD", fmtNum(d.ret_td)) + (ints ? li("Interception (proposal)", fmtNum(d.int)) : "");
    var tiers = "";
    var lo = 0;
    d.pa_tiers.forEach(function (t, i) {
      var label = i === d.pa_tiers.length - 1 ? lo + "+" : (lo === t[0] ? String(lo) : lo + "–" + t[0]);
      tiers += li(label + " points allowed", fmtNum(t[1]));
      lo = t[0] + 1;
    });
    function req(pos) {
      return FFP.requiredFields(pos, lg.mode, lg.settings).map(function (f) { return FIELD_NAMES[f] || f; }).join(", ");
    }
    var sum = FFP.poolSummary(S.db, lg.mode, lg.settings, lg.rules);
    var skewed = strict ? (S.db.fgDistanceSkewedSeasons || []) : [];
    var kCov = skewed.length ? coverage("strict", lg.settings).K : null;
    var kSeasons = !kCov || kCov.seasonCount === 0 ? "no seasons" : kCov.seasonCount === 1 ? String(kCov.first) : kCov.first + "–" + kCov.last;
    var kickerRule = skewed.length ? "<p>Strict kickers: for " + (skewed.length === 1 ? skewed[0] : skewed[0] + "–" + skewed[skewed.length - 1]) +
      " the data knows field-goal distances only for games with no field goal made. Drawing from those would hand every kicker his worst games, so Strict draws kickers' games only from seasons where distances were recorded (" +
      esc(kSeasons) + ").</p>" : "";
    var html = '<div class="prose"><h3 class="label-rule">How scoring works in ' + modeName(lg.mode) + " mode</h3>" +
      "<p>" + (strict ?
        "Strict scores the full rule set. A game is eligible only when every stat it scores was recorded. In this data: " + esc(coverageText("strict", lg.settings)) :
        "Historical scores the stats recorded for every game since 1960. Stats that weren't kept for older games (two-point conversions, fumble-recovery TDs, field-goal distances, sacks before 1982, takeaways) aren't scored in this mode.") + "</p>" +
      (strict ? kickerRule : "") +
      "<p>Each week, every rostered player on a team with a game that week draws one of his eligible games at random, unless he's on his bye. That game is used up for the rest of the league. " +
      "Teams without a game draw nothing, so their players use up no games: the idle team in a league with an odd number of teams, the top two seeds in the wild-card week, and teams out of the playoffs. " +
      "Starters' points make the team score; bench games are drawn too but don't count. Average points only rank players for the draft and the computer teams.</p></div>" +
      '<div class="rules-grid"><div class="panel"><h3>Offense (QB, RB, WR, TE)</h3><ul class="rule-list">' + off + "</ul>" +
      '<p class="fine">Offense values are placeholders until the live site\'s scoring code is in hand.</p></div>' +
      '<div class="panel"><h3>Kicker</h3><ul class="rule-list">' + kick + "</ul></div>" +
      '<div class="panel"><h3>Defense</h3><ul class="rule-list">' + def + "</ul><h3>Points allowed</h3><ul class=\"rule-list\">" + tiers + "</ul></div></div>" +
      '<div class="prose"><h3 class="label-rule">What makes a game eligible</h3><ul>' +
      "<li><b>QB, RB, WR, TE:</b> " + esc(req("QB")) + ".</li>" +
      "<li><b>K:</b> " + esc(req("K")) + ".</li>" +
      "<li><b>DEF:</b> " + esc(req("DEF")) + (strict || ints ? ", and an interception count that matches a second source" : "") + ".</li>" +
      "<li>A player needs at least " + FFP.MIN_GAMES + " eligible games to be in the pool (17 weeks minus one bye). In this mode that is QB " + sum.counts.QB +
      ", RB " + sum.counts.RB + ", WR " + sum.counts.WR + ", TE " + sum.counts.TE + ", K " + sum.counts.K + ", DEF " + sum.counts.DEF + ".</li></ul>" +
      '<h3 class="label-rule">Data and caveats</h3><ul>' +
      "<li>Game logs come from Pro-Football-Reference, collected in a Kaggle scrape. Two-point conversions, fumble-recovery TDs, field-goal distances and defensive takeaways for 1999 come from nflverse.</li>" +
      "<li>Some zeros are proven rather than recorded. When a team's recorded touchdowns, extra points and field goals add up to its final score, nothing else scored for it, so that game's safeties, two-point conversions and defensive and fumble-recovery TDs are 0. The NFL had no two-point conversion before 1994, so those are 0 as well. Field-goal distances are 0 when no field goal was made.</li>" +
      "<li>Where a defense's interception count disagrees with the opposing passers' interceptions thrown, the count is left unknown.</li>" +
      "<li>Regular-season games only, 1960–1999: " + fmtInt(S.totalGames) + " player-games for " + fmtInt(S.db.players.length) + " players and franchises. A defense is a franchise across its cities.</li>" +
      "<li>Unknown stats are never filled in or counted as zero. A game missing a stat this mode needs is simply not eligible.</li>" +
      "<li>Quarters and highlights in the game center are made up to pace the reveal. The final stat lines are real.</li>" +
      "<li>This is a prototype. Rights to reuse this data are not settled.</li></ul></div>";
    $("panel-rules").innerHTML = html;
  }
  function fmtNum(n) {
    if (n < 0) return "−" + fmtNum(-n);
    return String(Math.round(n * 1000) / 1000);
  }

  function playCurrentWeek() {
    var lg = S.league;
    if (lg.stage !== "season") return;
    var w = lg.week;
    FFP.playWeek(lg, S.db);
    save();
    var idx = userMatchupIndex(w);
    openGame(w, idx >= 0 ? idx : 0);
  }

  // ------------------------------------------------------------------ game center

  function stopGcTimer() {
    if (S.gc && S.gc.timer) { clearTimeout(S.gc.timer); S.gc.timer = null; }
  }

  function openGame(week, idx) {
    stopGcTimer();
    var tl = FFP.revealTimeline(S.league, S.db, week, idx);
    S.gc = { week: week, idx: idx, tl: tl, step: -1, phase: "vs", paused: true, timer: null };
    showScreen("game");
    renderGcStatic();
    renderGc();
    window.scrollTo(0, 0);
  }

  function gcSpeed() { return Number($("gc-speed").value) || 1; }

  function bulbHtml(n) {
    var neg = n < 0;
    var s = Math.abs(n).toFixed(2).split(".");
    var ip = (neg ? "-" : "") + s[0];
    var ghost = ip.replace(/[0-9-]/g, "8");
    return '<span class="ghost" aria-hidden="true">' + ghost + '<span class="pt"></span><span class="dec">88</span></span><span class="lit">' + ip +
      '<span class="pt"></span><span class="dec">' + s[1] + "</span></span>";
  }

  function setBoardScore(id, n, flash) {
    var el = $(id);
    var prev = el.dataset.score;
    var next = n.toFixed(2);
    el.innerHTML = bulbHtml(n);
    el.dataset.score = next;
    el.setAttribute("aria-label", fmtPts(n) + " points");
    if (flash && prev !== undefined && prev !== next && !reducedMotion()) {
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    }
  }

  function renderGcStatic() {
    var g = S.gc;
    var tl = g.tl;
    var label = weekLabel(g.week);
    $("gc-title").textContent = S.league.name + " · " + label + (tl.playoff ? "" : " · regular season");
    $("gc-board-week").textContent = "Week " + pad2(g.week) + (tl.label ? " · " + tl.label : "");
    $("gc-home-name").textContent = teamName(tl.vs.home.teamId);
    $("gc-away-name").textContent = teamName(tl.vs.away.teamId);
    function vsList(side) {
      return '<div class="vs-team"><h3>' + esc(teamName(side.teamId)) + '</h3><ul class="vs-list">' + side.starters.map(function (s) {
        return '<li><span class="slot">' + s.slot + '</span><span class="nm">' + esc(s.name) + " " + posChip(s.pos) + '</span><span class="yr">' + (s.bye ? "Bye" : esc(val(s.season))) + "</span></li>";
      }).join("") + "</ul></div>";
    }
    $("gc-vs").innerHTML = vsList(tl.vs.home) + vsList(tl.vs.away);
    $("gc-feed").innerHTML = "";
    $("gc-final").innerHTML = "";
    $("gc-final").dataset.rendered = "";
    var res = S.league.results[g.week];
    var others = res.matchups.map(function (m, i) { return { m: m, i: i }; }).filter(function (x) { return x.i !== g.idx; });
    $("gc-others").innerHTML = others.length ? '<h3 class="label-rule">Other games in ' + esc(label.toLowerCase()) + '</h3><ul class="score-list">' +
      others.map(function (x) { return scoreRow(x.m, { watch: { week: g.week, idx: x.i }, watchLabel: "Watch", idPrefix: "gc-watch-" }); }).join("") + "</ul>" : "";
  }

  function hlText(h) {
    var p = player(h.pid);
    return { who: h.slot + " " + p.name, team: teamName(h.teamId) };
  }

  function renderGc() {
    var g = S.gc;
    var tl = g.tl;
    var hl = tl.highlights;
    var n = hl.length;
    var final = g.phase === "final";
    var cur = g.step >= 0 && g.step < n ? hl[g.step] : null;
    var hs = final ? tl.final.homeScore : cur ? cur.homeScore : 0;
    var as = final ? tl.final.awayScore : cur ? cur.awayScore : 0;
    setBoardScore("gc-home-score", hs, !final);
    setBoardScore("gc-away-score", as, !final);
    var q = final ? "F" : cur ? String(cur.quarter) : "";
    Array.prototype.forEach.call($("gc-lamps").children, function (li) { li.classList.toggle("on", li.dataset.q === q); });
    $("gc-board-count").textContent = final ? "Final" : "Highlight " + pad2(Math.max(0, g.step + 1)) + "/" + pad2(n);
    $("gc-board-count").className = final ? "lit" : "";
    $("gc-home").classList.toggle("winner", final && tl.final.winner === tl.vs.home.teamId);
    $("gc-away").classList.toggle("winner", final && tl.final.winner === tl.vs.away.teamId);

    var ticker;
    if (final) {
      var w = tl.final.winner;
      var margin = Math.abs(Math.round(tl.final.homeScore * 100) - Math.round(tl.final.awayScore * 100)) / 100;
      ticker = '<span class="q">FINAL</span>' + (w ? esc(teamName(w)) + " win by " + fmtPts(margin) +
        (margin === 0 ? " (tie goes to the higher seed)" : "") : "Tied at " + fmtPts(tl.final.homeScore));
    } else if (cur) {
      var t = hlText(cur);
      ticker = '<span class="q">Q' + cur.quarter + "</span>" + esc(t.who) + " · " + esc(t.team) + ' <span class="pts">' + fmtSigned(cur.points) + "</span>";
    } else {
      ticker = '<span class="q">PRE</span>' + plural(n, "starter highlight") + " to come. Press Kick off.";
    }
    $("gc-ticker").innerHTML = ticker;

    $("gc-vs").hidden = g.phase !== "vs";
    $("gc-feed-title").hidden = g.phase === "vs";
    $("gc-feed").hidden = g.phase === "vs";
    var shownCount = final ? n : g.step + 1;
    var items = [];
    for (var i = shownCount - 1; i >= 0; i--) {
      var h = hl[i];
      var tx = hlText(h);
      items.push('<li class="' + (i === g.step && !final ? "latest" : "") + '"><span class="q">Q' + h.quarter + '</span><span class="what">' + esc(tx.who) + " " + posChip(h.pos) +
        ' <b class="num">' + fmtSigned(h.points) + '</b><span class="team">' + esc(tx.team) + '</span></span><span class="run">' +
        (h.teamId === tl.vs.home.teamId ? "<b>" + fmtPts(h.homeScore) + "</b>–" + fmtPts(h.awayScore) : fmtPts(h.homeScore) + "–<b>" + fmtPts(h.awayScore) + "</b>") + "</span></li>");
    }
    $("gc-feed").innerHTML = items.join("");
    $("gc-feed-title").textContent = final ? "Highlights (made up), latest first" : "Highlights, latest first";

    var playBtn = $("gc-play");
    playBtn.textContent = g.phase === "vs" ? "Kick off" : final ? "Watch again" : g.paused ? "Resume" : "Pause";
    $("gc-next").disabled = final;
    $("gc-skip").disabled = final;

    var fin = $("gc-final");
    if (final) {
      if (!fin.dataset.rendered) renderFinal();
      fin.hidden = false;
    } else {
      fin.hidden = true;
    }
  }

  function gcSchedule() {
    stopGcTimer();
    var g = S.gc;
    if (!g || g.paused || g.phase !== "play") return;
    var delay = HIGHLIGHT_MS / gcSpeed();
    g.timer = setTimeout(function () { g.timer = null; gcAdvance(); }, delay);
  }

  function gcAdvance() {
    var g = S.gc;
    if (!g || g.phase === "final") return;
    if (g.phase === "vs") g.phase = "play";
    if (g.step + 1 >= g.tl.highlights.length) {
      gcFinal();
      return;
    }
    g.step++;
    renderGc();
    gcSchedule();
  }

  function gcFinal() {
    stopGcTimer();
    S.gc.phase = "final";
    S.gc.paused = true;
    renderGc();
  }

  function gcPlayPause() {
    var g = S.gc;
    if (!g) return;
    if (g.phase === "final") {
      g.phase = "vs"; g.step = -1; g.paused = true;
      $("gc-final").dataset.rendered = "";
      $("gc-final").innerHTML = "";
      renderGc();
      return;
    }
    if (g.phase === "vs") {
      g.paused = false;
      gcAdvance();
      return;
    }
    g.paused = !g.paused;
    renderGc();
    gcSchedule();
  }

  function gcNext() {
    var g = S.gc;
    if (!g || g.phase === "final") return;
    if (g.phase === "vs") g.paused = true;
    stopGcTimer();
    gcAdvance();
  }

  // ---- FINAL lines: the real games

  function resultText(gm) {
    return (gm.result || "?") + " " + val(gm.team_score) + "–" + val(gm.opp_score);
  }
  function gameLineText(gm) {
    var where = gm.home_away === "H" ? gm.team + " vs " + gm.opp : gm.team + " at " + gm.opp;
    return [String(gm.season), "team game " + val(gm.team_game), fmtDate(gm.date), where, resultText(gm)].join(" · ");
  }

  function statLine(gm, pos) {
    var bits = [];
    var unknown = [];
    function nz(x) { return x !== null && x !== undefined && x !== 0; }
    function miss(fields) { fields.forEach(function (f) { if (gm[f] === null || gm[f] === undefined) unknown.push(FIELD_NAMES[f] || f); }); }
    if (pos === "QB" || pos === "RB" || pos === "WR" || pos === "TE") {
      if (pos === "QB" || nz(gm.pass_att) || nz(gm.pass_yds) || nz(gm.pass_td)) {
        var pass = [];
        if (gm.pass_cmp !== null && gm.pass_att !== null && gm.pass_cmp !== undefined && gm.pass_att !== undefined) pass.push(gm.pass_cmp + "/" + gm.pass_att);
        pass.push(val(gm.pass_yds) + " pass yds", val(gm.pass_td) + " TD", val(gm.pass_int) + " INT");
        bits.push(pass.join(", "));
      }
      if (pos === "QB" || pos === "RB" || nz(gm.rush_att) || nz(gm.rush_yds) || nz(gm.rush_td)) {
        bits.push((gm.rush_att !== null && gm.rush_att !== undefined ? gm.rush_att + " rush, " : "") + val(gm.rush_yds) + " rush yds, " + val(gm.rush_td) + " TD");
      }
      if (pos === "WR" || pos === "TE" || pos === "RB" || nz(gm.rec) || nz(gm.rec_yds) || nz(gm.rec_td)) {
        bits.push(val(gm.rec) + " rec, " + val(gm.rec_yds) + " yds, " + val(gm.rec_td) + " TD");
      }
      if (nz(gm.ret_td)) bits.push(plural(gm.ret_td, "return TD"));
      if (nz(gm.two_pt)) bits.push(plural(gm.two_pt, "two-point conversion"));
      if (nz(gm.fum_rec_td)) bits.push(plural(gm.fum_rec_td, "fumble-recovery TD"));
      miss(pos === "QB" ? ["pass_cmp", "pass_att", "rush_att", "two_pt", "fum_rec_td"] : ["rush_att", "two_pt", "fum_rec_td"]);
    } else if (pos === "K") {
      bits.push("FG " + (gm.fga !== null && gm.fga !== undefined ? val(gm.fgm) + "/" + gm.fga : val(gm.fgm) + " made") + ", " + val(gm.fg_missed) + " missed");
      if ([gm.fgm_0_39, gm.fgm_40_49, gm.fgm_50p].every(function (x) { return x !== null && x !== undefined; })) {
        bits.push("made from 0–39: " + gm.fgm_0_39 + ", 40–49: " + gm.fgm_40_49 + ", 50+: " + gm.fgm_50p);
      } else {
        unknown.push("field-goal distances");
      }
      bits.push("XP " + (gm.xpa !== null && gm.xpa !== undefined ? val(gm.xpm) + "/" + gm.xpa : val(gm.xpm) + " made"));
      miss(["fga", "xpa"]);
    } else if (pos === "DEF") {
      bits.push("allowed " + val(gm.pts_allowed));
      var add = function (f, label) { if (gm[f] !== null && gm[f] !== undefined) bits.push(gm[f] + " " + label); else unknown.push(FIELD_NAMES[f]); };
      add("sacks", "sacks");
      // An interception count is shown only when it was verified against the opposing passers.
      if (gm.int_verified === true && gm.def_int !== null && gm.def_int !== undefined) bits.push(gm.def_int + " INT");
      else unknown.push("a verified interception count");
      add("fum_rec", "fumble rec");
      add("safeties", "safeties");
      var blk = ["blk_punt", "blk_fg", "blk_xp"];
      if (blk.every(function (f) { return gm[f] !== null && gm[f] !== undefined; })) bits.push((gm.blk_punt + gm.blk_fg + gm.blk_xp) + " blocked kicks");
      else unknown.push("blocked kicks");
      if (gm.def_int_td !== null && gm.def_int_td !== undefined && gm.def_fum_td !== null && gm.def_fum_td !== undefined) bits.push((gm.def_int_td + gm.def_fum_td) + " defensive TD");
      else unknown.push("defensive TDs");
      bits.push(val(gm.ret_td) + " return TD");
    }
    return { text: bits.join(" · "), unknown: unknown };
  }

  function partsText(parts) {
    return parts.map(function (p) {
      if (p.stat === "pts_allowed") return p.value + " points allowed = " + fmtPts(p.points);
      return p.label + " " + p.value + " = " + fmtPts(p.points);
    }).join(" · ");
  }

  // The data was revised after this week was played: the stored score stands (engine revealTimeline).
  function revisedNote(l) {
    if (!l.game) return "This game is no longer in the game data, so its stat line can't be shown. The score stored for this week stands.";
    if (l.currentPoints === null || l.currentPoints === undefined) {
      return "This game's record was revised after this week was played and no longer counts in this mode. The stat line above is the revised record; the score stored for this week stands.";
    }
    return "This game's record was revised after this week was played; the revised record above would score " + fmtPts(l.currentPoints) +
      ". The score stored for this week stands.";
  }

  function lineHtml(l) {
    var top = '<div class="line-top"><span class="slot">' + esc(l.slot) + '</span><span class="nm">' + esc(l.name) + " " + posChip(l.pos) + '</span><span class="pts num">' + fmtPts(l.points) + "</span></div>";
    if (l.bye) return '<li class="line">' + top + '<p class="game">Bye week. No game drawn, 0 points.</p></li>';
    var attrs = ' data-pid="' + esc(l.pid) + '" data-points="' + l.points.toFixed(2) + '"';
    if (!l.game) return '<li class="line"' + attrs + ">" + top + '<p class="revised">' + esc(revisedNote(l)) + "</p></li>";
    var st = statLine(l.game, l.pos);
    return '<li class="line"' + attrs + ">" + top + '<p class="game">' + esc(gameLineText(l.game)) + "</p>" +
      '<p class="stats">' + esc(st.text) + "</p>" +
      (l.dataChanged ? '<p class="revised">' + esc(revisedNote(l)) + "</p>" :
        '<p class="parts">' + (l.parts.length ? esc(partsText(l.parts)) : "No scoring plays") + "</p>") +
      (st.unknown.length ? '<p class="unknown">Not recorded for this game: ' + esc(st.unknown.join(", ")) + ". Not scored in this mode.</p>" : "") + "</li>";
  }

  function renderFinal() {
    var g = S.gc;
    var tl = g.tl;
    var f = tl.final;
    var fin = $("gc-final");
    function teamBlock(side, total) {
      var tid = side.teamId;
      var lines = f.lines[tid];
      var sumH = lines.reduce(function (a, l) { return a + Math.round(l.points * 100); }, 0);
      var res = f.winner === tid ? "W" : f.winner ? "L" : "T";
      return '<div class="final-team" data-team="' + esc(tid) + '"><div class="final-team-head"><h3>' + esc(teamName(tid)) + ' <span class="wl ' + res.toLowerCase() + '">' + res +
        '</span></h3><span class="tot" data-total="' + total.toFixed(2) + '">' + fmtPts(total) + '</span></div><ul class="lines">' + lines.map(lineHtml).join("") +
        '</ul><p class="final-check">Starters add up to ' + fmtPts(sumH / 100) + ".</p></div>";
    }
    function benchBlock(side) {
      var lines = (f.bench && f.bench[side.teamId]) || [];
      return '<div class="final-team"><div class="final-team-head"><h3>' + esc(teamName(side.teamId)) + " bench</h3></div><ul class=\"lines\">" + lines.map(lineHtml).join("") + "</ul></div>";
    }
    fin.innerHTML = '<h3 class="label-rule">Final · the real games</h3>' +
      '<div class="final-grid" id="gc-final-grid" data-home-score="' + f.homeScore.toFixed(2) + '" data-away-score="' + f.awayScore.toFixed(2) + '">' +
      teamBlock(tl.vs.home, f.homeScore) + teamBlock(tl.vs.away, f.awayScore) + "</div>" +
      '<div class="bench-section tabpanel"><h3 class="label-rule">Bench results (not in the team totals)</h3><p class="fine">These games were drawn and used up, but bench points never count.</p>' +
      '<div class="final-grid">' + benchBlock(tl.vs.home) + benchBlock(tl.vs.away) + "</div></div>" +
      '<div class="btn-row"><button type="button" class="btn btn-primary" id="gc-done">Back to the league</button></div>';
    fin.dataset.rendered = "1";
  }

  // ------------------------------------------------------------------ saves panel

  function toggleSaves(open) {
    var panel = $("save-panel");
    var show = open === undefined ? panel.hidden : open;
    panel.hidden = !show;
    $("btn-saves").setAttribute("aria-expanded", show ? "true" : "false");
    if (show) {
      $("save-export").value = S.league ? FFP.serialize(S.league) : "";
      $("save-export").placeholder = "No league yet. Start one, or paste a save into Import.";
      $("save-copy").disabled = !S.league;
      $("save-copy-status").textContent = "";
      $("import-error").textContent = "";
      renderSaveHint();
    }
  }

  function copySave() {
    var ta = $("save-export");
    var status = $("save-copy-status");
    function fallback() {
      ta.focus();
      ta.select();
      status.textContent = "Copy didn't work here. The text is selected: press Ctrl+C or Cmd+C.";
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(function () { status.textContent = "Copied."; }, fallback);
      } else {
        fallback();
      }
    } catch (e) { fallback(); }
  }

  function importSave(ev) {
    ev.preventDefault();
    var text = $("save-import").value.trim();
    var err = $("import-error");
    err.textContent = "";
    if (!text) { err.textContent = "Paste save text first."; return; }
    var lg;
    try {
      lg = FFP.deserialize(text);
      checkLeagueAgainstData(lg);
    } catch (e) {
      err.textContent = e.message;
      return;
    }
    function apply() {
      var prev = S.league, prevTab = S.tab;
      stopGcTimer();
      stopDraftTimer();
      S.league = lg;
      S.tab = "week";
      S.fa.addPid = null;
      S.fa.msg = "";
      try {
        route();
      } catch (e) {
        // Don't keep a league the page can't show: put the previous one back and say why.
        stopGcTimer();
        stopDraftTimer();
        S.league = prev;
        S.tab = prevTab;
        route();
        toggleSaves(true);
        $("import-error").textContent = "This save couldn't be opened: " + (e && e.message ? e.message : String(e)) + " Your current league is unchanged.";
        $("save-import").focus();
        return;
      }
      var ok = save();
      $("save-import").value = "";
      toggleSaves(false);
      setSaveStatus(ok ? "Loaded the imported save." : "Loaded the imported save. " + NO_STORAGE, !ok);
    }
    if (S.league) askConfirm("Load this save? It replaces the league in this browser.", "Load save", apply);
    else apply();
  }

  // ------------------------------------------------------------------ wiring

  function wire() {
    $("loading-retry").addEventListener("click", loadAll);

    // Masthead
    $("btn-saves").addEventListener("click", function () { toggleSaves(); });
    $("btn-new-league").addEventListener("click", function () {
      askConfirm("Start a new league? This replaces the league saved in this browser. Copy it from Saves first if you want to keep it.", "Start a new league", function () {
        stopGcTimer();
        stopDraftTimer();
        S.league = null;
        clearSave();
        setSaveStatus("");
        toggleSaves(false);
        showSetup();
      });
    });
    $("confirm-yes").addEventListener("click", function () {
      var fn = S.confirmAction;
      closeConfirm();
      if (fn) fn();
    });
    $("confirm-no").addEventListener("click", cancelConfirm);
    $("save-copy").addEventListener("click", copySave);
    $("import-form").addEventListener("submit", importSave);

    // Setup
    ["setup-mode-historical", "setup-mode-strict", "setup-int", "setup-playoffs", "setup-order-random", "setup-order-custom"].forEach(function (id) {
      $(id).addEventListener("change", function () { renderSetup(); });
    });
    $("setup-teams").addEventListener("change", function () { $("setup-teams").dataset.want = $("setup-teams").value; renderSetup(); });
    $("setup-reseed").addEventListener("click", function () { $("setup-seed").value = newSeed(); });
    $("setup-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      guard("setup-error", function () {
        var v = setupValues();
        startLeague({
          name: v.name, teamName: v.teamName, numTeams: v.numTeams, playoffTeams: v.playoffTeams, mode: v.mode,
          historical: { includeInterceptions: v.includeInterceptions }, draftOrder: v.draftOrder, userPick: v.userPick, seed: v.seed
        }, false);
      })();
    });
    $("quick-start").addEventListener("click", guard("quick-error", function () {
      var v = setupValues();
      startLeague({
        name: v.name, teamName: v.teamName, numTeams: 8, playoffTeams: 4, mode: "historical",
        historical: { includeInterceptions: false }, draftOrder: "random", seed: v.seed
      }, true);
    }));

    // Draft
    $("draft-search").addEventListener("input", function () { S.draft.search = this.value.trim(); S.draft.limit = DRAFT_PAGE; renderDraftTable(); });
    document.querySelectorAll('input[name="draft-pos"]').forEach(function (r) {
      r.addEventListener("change", function () { S.draft.pos = this.value; S.draft.limit = DRAFT_PAGE; renderDraftTable(); });
    });
    $("draft-hof").addEventListener("change", function () { S.draft.hof = this.checked; S.draft.limit = DRAFT_PAGE; renderDraftTable(); });
    $("draft-more").addEventListener("click", function () { S.draft.limit += DRAFT_PAGE; renderDraftTable(); });
    $("draft-tbody").addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-pick]");
      if (!b || b.disabled) return;
      guard("draft-error", function () { userPick(b.dataset.pick); })();
    });
    $("draft-autopick").addEventListener("click", guard("draft-error", function () {
      var cp = FFP.currentPick(S.league);
      if (!cp || !team(cp.teamId).isUser || S.draft.busy) return;
      userPick(FFP.aiPick(S.league, S.db, cp.teamId));
    }));
    $("draft-autodraft").addEventListener("click", guard("draft-error", function () {
      stopDraftTimer();
      autodraftAll();
      finishDraft();
    }));

    // Hub tabs
    var tabs = ["week", "team", "schedule", "standings", "fa", "results", "rules"];
    tabs.forEach(function (t, i) {
      var b = $("tab-" + t);
      b.addEventListener("click", function () { setTab(t); });
      b.addEventListener("keydown", function (ev) {
        var d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        ev.preventDefault();
        var nt = tabs[(i + d + tabs.length) % tabs.length];
        setTab(nt);
        $("tab-" + nt).focus();
      });
    });

    // Hub panels (delegated)
    $("screen-hub").addEventListener("click", function (ev) {
      var t = ev.target;
      var b = t.closest("button");
      if (!b || b.disabled) return;
      if (b.id === "play-week") { guard("hub-error", playCurrentWeek)(); return; }
      if (b.id === "lineup-auto") {
        guard("lineup-error", function () { FFP.autoLineup(S.league, S.db, uid(), S.league.week); save(); renderHub(); })();
        return;
      }
      if (b.id === "week-new-league") { $("btn-new-league").click(); return; }
      if (b.dataset.watch) {
        var parts = b.dataset.watch.split(":");
        guard("hub-error", function () { openGame(Number(parts[0]), Number(parts[1])); })();
        return;
      }
      if (b.dataset.add) {
        S.fa.addPid = b.dataset.add; S.fa.msg = ""; renderFaTab();
        var c = document.querySelector(".drop-chooser");
        if (c) c.scrollIntoView({ block: "nearest" });
        if (!focusFirst(".drop-chooser button[data-drop]")) focusFirst("#fa-cancel");
        return;
      }
      if (b.id === "fa-cancel") {
        var was = S.fa.addPid;
        S.fa.addPid = null; renderFaTab();
        if (!(was && focusFirst('#fa-body button[data-add="' + was + '"]'))) $("fa-search").focus();
        return;
      }
      if (b.id === "fa-more") { S.fa.limit += PAGE; renderFaTab(); return; }
      if (b.dataset.drop) {
        guard("fa-error", function () {
          var add = S.fa.addPid, drop = b.dataset.drop;
          FFP.addDrop(S.league, S.db, uid(), add, drop);
          save();
          var bye = S.league.byes[add];
          S.fa.msg = "Added " + player(add).name + " and dropped " + player(drop).name + ". " +
            (bye === null || bye === undefined ? "No regular-season weeks are left, so he has no bye." : player(add).name + "'s bye is week " + bye + ".");
          S.fa.addPid = null;
          renderHub();
          var done = document.querySelector("#fa-body .notice.good");
          if (done) { done.tabIndex = -1; done.focus(); }
        })();
      }
    });
    $("screen-hub").addEventListener("change", function (ev) {
      var sel = ev.target;
      if (!sel.dataset || !sel.dataset.slot) return;
      var id = sel.id;
      var msg = "";
      try { changeSlot(sel.dataset.slot, sel.value); } catch (e) { msg = e.message; }
      renderHub();
      if (msg && $("lineup-error")) $("lineup-error").textContent = msg;
      if ($(id)) $(id).focus();
    });
    $("fa-search").addEventListener("input", function () { S.fa.search = this.value.trim(); S.fa.limit = PAGE; renderFaTab(); });
    document.querySelectorAll('input[name="fa-pos"]').forEach(function (r) {
      r.addEventListener("change", function () { S.fa.pos = this.value; S.fa.limit = PAGE; renderFaTab(); });
    });

    // Game center
    $("gc-back").addEventListener("click", function () { showHub(); });
    $("gc-play").addEventListener("click", gcPlayPause);
    $("gc-next").addEventListener("click", gcNext);
    $("gc-skip").addEventListener("click", gcFinal);
    $("gc-speed").addEventListener("change", function () { if (S.gc && !S.gc.paused) gcSchedule(); });
    $("screen-game").addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (!b) return;
      if (b.id === "gc-done") { showHub(); return; }
      if (b.dataset.watch) {
        var parts = b.dataset.watch.split(":");
        openGame(Number(parts[0]), Number(parts[1]));
      }
    });
  }

  function start() {
    if (!FFP) {
      document.getElementById("loading-msg").textContent = "The game engine didn't load, so the page can't start.";
      return;
    }
    wire();
    loadAll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
