/* ═══════════════════════════════════════════════════════════
   WHO WORE IT BETTER — APP LOGIC
═══════════════════════════════════════════════════════════ */

/* ── EPISODE DATA ────────────────────────────────────────────
   Replace `leftImg`, `rightImg`, `cartoonImg` with real URLs.
   `votes` is the seed count already cast before this session.
────────────────────────────────────────────────────────────── */
const EPISODES = [
  {
    id: 28,
    character: "DEMOLITOR",
    epLabel: "EPISODE 28",
    epName: "Construction Showdown",
    voteEnds: new Date("2026-06-22T23:59:59"),
    statVotes: 3842,
    statComments: 1276,

    cartoon: {
      img: "assets/placeholders/demolitor-cartoon.png",
      alt: "G1 Demolitor cartoon reference",
    },

    left: {
      name: "FANS TOYS FT-32E HADID",
      maker: "MIXMASTER",
      img: "assets/placeholders/ft32e-hadid.png",
      voteLabel: "VOTE FT-32E HADID",
      voteMaker: "FANS TOYS",
      votes: 1541,
      specs: [
        { label: "Scale", value: "1:32 (MP scale)" },
        { label: "Material", value: "Die-cast & ABS" },
        { label: "Transformation", value: "Concrete mixer" },
        { label: "Year Released", value: "2024" },
      ],
    },

    right: {
      name: "28 DEMOLITOR",
      maker: "MIXMASTER",
      img: "assets/placeholders/28-demolitor.png",
      voteLabel: "VOTE 28 DEMOLITOR",
      voteMaker: "28 DEFORMATION SPACE",
      votes: 1876,
      specs: [
        { label: "Scale", value: "1:28 (MP scale)" },
        { label: "Material", value: "ABS & POM" },
        { label: "Transformation", value: "Concrete mixer" },
        { label: "Year Released", value: "2025" },
      ],
    },

    cartoonOnlyVotes: 425,
  },

  {
    id: 29,
    character: "INSECTICONS",
    epLabel: "EPISODE 29",
    epName: "Swarm of the Insecticons",
    voteEnds: new Date("2026-07-15T23:59:59"),
    statVotes: 2967,
    statComments: 884,
    cartoon: { img: "assets/placeholders/insecticons-cartoon.png", alt: "G1 Insecticons cartoon reference" },
    left: {
      name: "FANS TOYS FT-12 GRENADIER SET",
      maker: "INSECTICONS",
      img: "assets/placeholders/ft12-insecticons.png",
      voteLabel: "VOTE GRENADIER SET",
      voteMaker: "FANS TOYS",
      votes: 1322,
      specs: [
        { label: "Scale", value: "1:25 (MP scale)" },
        { label: "Material", value: "ABS & die-cast" },
        { label: "Transformation", value: "Stag beetle / locust" },
        { label: "Year Released", value: "2017" },
      ],
    },
    right: {
      name: "MAKETOYS DEVIL STINGER",
      maker: "INSECTICONS",
      img: "assets/placeholders/maketoys-insecticons.png",
      voteLabel: "VOTE DEVIL STINGER",
      voteMaker: "MAKETOYS",
      votes: 1188,
      specs: [
        { label: "Scale", value: "1:24 (MP scale)" },
        { label: "Material", value: "ABS & POM" },
        { label: "Transformation", value: "Beetle trio" },
        { label: "Year Released", value: "2016" },
      ],
    },
    cartoonOnlyVotes: 457,
  },

  {
    id: 30,
    character: "OCTANE",
    epLabel: "EPISODE 30",
    epName: "Triple-Threat Tanker",
    voteEnds: new Date("2026-07-22T23:59:59"),
    statVotes: 2105,
    statComments: 612,
    cartoon: { img: "assets/placeholders/octane-cartoon.png", alt: "G1 Octane cartoon reference" },
    left: {
      name: "FANS TOYS FT-44 THOMAS",
      maker: "OCTANE",
      img: "assets/placeholders/ft44-octane.png",
      voteLabel: "VOTE FT-44 THOMAS",
      voteMaker: "FANS TOYS",
      votes: 1043,
      specs: [
        { label: "Scale", value: "1:32 (MP scale)" },
        { label: "Material", value: "ABS & die-cast" },
        { label: "Transformation", value: "Jet / fuel tanker" },
        { label: "Year Released", value: "2021" },
      ],
    },
    right: {
      name: "X-TRANSBOTS MX-V SOSTER",
      maker: "OCTANE",
      img: "assets/placeholders/xtb-octane.png",
      voteLabel: "VOTE MX-V SOSTER",
      voteMaker: "X-TRANSBOTS",
      votes: 802,
      specs: [
        { label: "Scale", value: "1:32 (MP scale)" },
        { label: "Material", value: "ABS & POM" },
        { label: "Transformation", value: "Jet / fuel tanker" },
        { label: "Year Released", value: "2022" },
      ],
    },
    cartoonOnlyVotes: 260,
  },

  {
    id: 31,
    character: "DEVASTATOR",
    epLabel: "EPISODE 31",
    epName: "Constructicon Combination",
    voteEnds: new Date("2026-07-29T23:59:59"),
    statVotes: 5218,
    statComments: 1604,
    cartoon: { img: "assets/placeholders/devastator-cartoon.png", alt: "G1 Devastator cartoon reference" },
    left: {
      name: "GENERATION TOY GT-88 GORILLA",
      maker: "DEVASTATOR",
      img: "assets/placeholders/gt-devastator.png",
      voteLabel: "VOTE GT-88 GORILLA",
      voteMaker: "GENERATION TOY",
      votes: 2614,
      specs: [
        { label: "Scale", value: "1:30 (MP scale)" },
        { label: "Material", value: "ABS & die-cast" },
        { label: "Combiner", value: "6 Constructicons" },
        { label: "Year Released", value: "2018" },
      ],
    },
    right: {
      name: "JINBAO DEVY OVERSIZED",
      maker: "DEVASTATOR",
      img: "assets/placeholders/jinbao-devastator.png",
      voteLabel: "VOTE JINBAO DEVY",
      voteMaker: "JINBAO",
      votes: 1987,
      specs: [
        { label: "Scale", value: "Oversized" },
        { label: "Material", value: "ABS" },
        { label: "Combiner", value: "6 Constructicons" },
        { label: "Year Released", value: "2016" },
      ],
    },
    cartoonOnlyVotes: 617,
  },

  {
    id: 32,
    character: "CYCLONUS",
    epLabel: "EPISODE 32",
    epName: "Galvatron's Right Hand",
    voteEnds: new Date("2026-08-05T23:59:59"),
    statVotes: 2740,
    statComments: 731,
    cartoon: { img: "assets/placeholders/cyclonus-cartoon.png", alt: "G1 Cyclonus cartoon reference" },
    left: {
      name: "FANS TOYS FT-29 QUIETUS",
      maker: "CYCLONUS",
      img: "assets/placeholders/ft29-cyclonus.png",
      voteLabel: "VOTE FT-29 QUIETUS",
      voteMaker: "FANS TOYS",
      votes: 1498,
      specs: [
        { label: "Scale", value: "1:32 (MP scale)" },
        { label: "Material", value: "ABS & die-cast" },
        { label: "Transformation", value: "Cybertronic jet" },
        { label: "Year Released", value: "2019" },
      ],
    },
    right: {
      name: "DX9 D14 CAPONE",
      maker: "CYCLONUS",
      img: "assets/placeholders/dx9-cyclonus.png",
      voteLabel: "VOTE D14 CAPONE",
      voteMaker: "DX9 TOYS",
      votes: 1006,
      specs: [
        { label: "Scale", value: "1:32 (MP scale)" },
        { label: "Material", value: "ABS & POM" },
        { label: "Transformation", value: "Cybertronic jet" },
        { label: "Year Released", value: "2018" },
      ],
    },
    cartoonOnlyVotes: 236,
  },

  {
    id: 33,
    character: "MOTOR MASTER",
    epLabel: "EPISODE 33",
    epName: "Lord of the Stunticons",
    voteEnds: new Date("2026-08-12T23:59:59"),
    statVotes: 3185,
    statComments: 905,
    cartoon: { img: "assets/placeholders/motormaster-cartoon.png", alt: "G1 Motor Master cartoon reference" },
    left: {
      name: "FANS TOYS FT-43 MEISTER",
      maker: "MOTOR MASTER",
      img: "assets/placeholders/ft-motormaster.png",
      voteLabel: "VOTE FT MEISTER",
      voteMaker: "FANS TOYS",
      votes: 1620,
      specs: [
        { label: "Scale", value: "1:32 (MP scale)" },
        { label: "Material", value: "ABS & die-cast" },
        { label: "Transformation", value: "Semi truck" },
        { label: "Year Released", value: "2023" },
      ],
    },
    right: {
      name: "MAKETOYS DOWNBEAT",
      maker: "MOTOR MASTER",
      img: "assets/placeholders/maketoys-motormaster.png",
      voteLabel: "VOTE DOWNBEAT",
      voteMaker: "MAKETOYS",
      votes: 1289,
      specs: [
        { label: "Scale", value: "1:32 (MP scale)" },
        { label: "Material", value: "ABS & POM" },
        { label: "Transformation", value: "Semi truck" },
        { label: "Year Released", value: "2022" },
      ],
    },
    cartoonOnlyVotes: 276,
  },

  {
    id: 34,
    character: "ABOMINUS",
    epLabel: "EPISODE 34",
    epName: "Terror of the Terrorcons",
    voteEnds: new Date("2026-08-19T23:59:59"),
    statVotes: 3902,
    statComments: 1118,
    cartoon: { img: "assets/placeholders/abominus-cartoon.png", alt: "G1 Abominus cartoon reference" },
    left: {
      name: "TFC TOYS HERCULES HADES",
      maker: "ABOMINUS",
      img: "assets/placeholders/tfc-abominus.png",
      voteLabel: "VOTE TFC HADES",
      voteMaker: "TFC TOYS",
      votes: 1742,
      specs: [
        { label: "Scale", value: "Oversized" },
        { label: "Material", value: "ABS & die-cast" },
        { label: "Combiner", value: "5 Terrorcons" },
        { label: "Year Released", value: "2015" },
      ],
    },
    right: {
      name: "UNIQUE TOYS PROVENANCE",
      maker: "ABOMINUS",
      img: "assets/placeholders/ut-abominus.png",
      voteLabel: "VOTE UT PROVENANCE",
      voteMaker: "UNIQUE TOYS",
      votes: 1611,
      specs: [
        { label: "Scale", value: "Oversized" },
        { label: "Material", value: "ABS & POM" },
        { label: "Combiner", value: "5 Terrorcons" },
        { label: "Year Released", value: "2019" },
      ],
    },
    cartoonOnlyVotes: 549,
  },
];

/* ─── CONFIG ─────────────────────────────────────────────── */
let CURRENT_EPISODE_INDEX = 0;

/* ─── STATE ──────────────────────────────────────────────── */
let resultsVisible = false;
let countdownInterval = null;
const votedByEp = {};      // { [episodeId]: 'left' | 'center' | 'right' }

/* ─── DOM REFS ───────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const dom = {
  episodeSelector:  $("episodeSelector"),
  epCharacter:      $("epCharacter"),
  epNumber:         $("epNumber"),
  leftName:         $("leftName"),
  leftMaker:        $("leftMaker"),
  leftImg:          $("leftImg"),
  rightName:        $("rightName"),
  rightMaker:       $("rightMaker"),
  rightImg:         $("rightImg"),
  cartoonImg:       $("cartoonImg"),
  cardLeft:         $("cardLeft"),
  cardRight:        $("cardRight"),
  voteLeft:         $("voteLeft"),
  voteCenter:       $("voteCenter"),
  voteRight:        $("voteRight"),
  voteLeftLabel:    $("voteLeftLabel"),
  voteLeftMaker:    $("voteLeftMaker"),
  voteRightLabel:   $("voteRightLabel"),
  voteRightMaker:   $("voteRightMaker"),
  toggleResults:    $("toggleResults"),
  resultsPanel:     $("resultsPanel"),
  resultBarLeft:    $("resultBarLeft"),
  resultBarCenter:  $("resultBarCenter"),
  resultBarRight:   $("resultBarRight"),
  resultLeftPct:    $("resultLeftPct"),
  resultCenterPct:  $("resultCenterPct"),
  resultRightPct:   $("resultRightPct"),
  resultLeftName:   $("resultLeftName"),
  resultRightName:  $("resultRightName"),
  totalVotes:       $("totalVotes"),
  leftDetailsBtn:   $("leftDetailsBtn"),
  rightDetailsBtn:  $("rightDetailsBtn"),
  modalOverlay:     $("modalOverlay"),
  modalClose:       $("modalClose"),
  modalImg:         $("modalImg"),
  modalName:        $("modalName"),
  modalMaker:       $("modalMaker"),
  modalSpecs:       $("modalSpecs"),
  toast:            $("toast"),
  statEpLabel:      $("statEpLabel"),
  statEpName:       $("statEpName"),
  statVotes:        $("statVotes"),
  statComments:     $("statComments"),
  statVoteEnd:      $("statVoteEnd"),
  cdDays:           $("cdDays"),
  cdHrs:            $("cdHrs"),
  cdMin:            $("cdMin"),
  cdSec:            $("cdSec"),
};

/* ─── EPISODE SELECTOR ───────────────────────────────────── */
function renderSelector() {
  dom.episodeSelector.innerHTML = EPISODES.map((ep, i) =>
    `<button class="ep-chip${i === CURRENT_EPISODE_INDEX ? " active" : ""}" type="button" data-index="${i}">
       <span class="ep-chip-num">${ep.epLabel}</span>
       <span class="ep-chip-name">${ep.character}</span>
     </button>`
  ).join("");

  dom.episodeSelector.querySelectorAll(".ep-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      if (idx === CURRENT_EPISODE_INDEX) return;
      CURRENT_EPISODE_INDEX = idx;
      renderSelector();
      loadEpisode(EPISODES[idx]);
      document.getElementById("arena").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

/* Reset all per-episode vote UI back to its pre-vote state */
function resetVoteUI() {
  dom.cardLeft.classList.remove("selected-left");
  dom.cardRight.classList.remove("selected-right");
  dom.voteLeft.classList.remove("voted");
  dom.voteCenter.classList.remove("voted");
  dom.voteRight.classList.remove("voted");
  dom.voteLeft.disabled = dom.voteCenter.disabled = dom.voteRight.disabled = false;
  dom.resultsPanel.hidden = true;
  dom.resultBarLeft.style.width = dom.resultBarCenter.style.width = dom.resultBarRight.style.width = "0%";
  resultsVisible = false;
}

/* ─── LOAD EPISODE ───────────────────────────────────────── */
function loadEpisode(ep) {
  resetVoteUI();
  dom.epCharacter.textContent  = ep.character;
  dom.epNumber.textContent     = ep.epLabel;
  dom.leftName.textContent     = ep.left.name;
  dom.leftMaker.textContent    = ep.left.maker;
  dom.rightName.textContent    = ep.right.name;
  dom.rightMaker.textContent   = ep.right.maker;
  dom.voteLeftLabel.textContent  = ep.left.voteLabel;
  dom.voteLeftMaker.textContent  = ep.left.voteMaker;
  dom.voteRightLabel.textContent = ep.right.voteLabel;
  dom.voteRightMaker.textContent = ep.right.voteMaker;
  dom.resultLeftName.textContent  = ep.left.name.split(" ").slice(-2).join(" ");
  dom.resultRightName.textContent = ep.right.name.split(" ").slice(-2).join(" ");

  setImg(dom.leftImg,    ep.left.img,    ep.left.name);
  setImg(dom.rightImg,   ep.right.img,   ep.right.name);
  setImg(dom.cartoonImg, ep.cartoon.img, ep.cartoon.alt);

  dom.statEpLabel.textContent   = ep.epLabel;
  dom.statEpName.textContent    = ep.epName;
  dom.statVotes.textContent     = fmtNum(ep.statVotes);
  dom.statComments.textContent  = fmtNum(ep.statComments);
  dom.statVoteEnd.textContent   = fmtDate(ep.voteEnds);

  startCountdown(ep.voteEnds);

  // Restore a vote the user already cast for this episode
  const prior = votedByEp[ep.id];
  if (prior) {
    if (prior === "left")  dom.cardLeft.classList.add("selected-left");
    if (prior === "right") dom.cardRight.classList.add("selected-right");
    dom.voteLeft.classList.toggle("voted", prior === "left");
    dom.voteCenter.classList.toggle("voted", prior === "center");
    dom.voteRight.classList.toggle("voted", prior === "right");
    dom.voteLeft.disabled = dom.voteCenter.disabled = dom.voteRight.disabled = true;
    showResults(ep, false);
  }
}

/* Set img src, silently fall back to placeholder SVG if 404 */
function setImg(el, src, alt) {
  el.alt = alt;
  el.src = src;
  el.onerror = () => {
    el.onerror = null;
    el.src = makePlaceholderSvg(alt);
  };
}

function makePlaceholderSvg(label) {
  const txt = encodeURIComponent(label.slice(0, 20));
  return `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'><rect width='300' height='300' fill='%231a0a2e'/><text x='150' y='140' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%23a855f7'>${txt}</text><text x='150' y='165' text-anchor='middle' font-family='sans-serif' font-size='11' fill='%23475569'>Image coming soon</text></svg>`;
}

/* ─── COUNTDOWN ──────────────────────────────────────────── */
function startCountdown(endDate) {
  if (countdownInterval) clearInterval(countdownInterval);

  function tick() {
    const diff = endDate - Date.now();
    if (diff <= 0) {
      dom.cdDays.textContent = dom.cdHrs.textContent =
      dom.cdMin.textContent  = dom.cdSec.textContent = "00";
      clearInterval(countdownInterval);
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000)  / 60000);
    const s = Math.floor((diff % 60000)    / 1000);
    dom.cdDays.textContent = pad(d);
    dom.cdHrs.textContent  = pad(h);
    dom.cdMin.textContent  = pad(m);
    dom.cdSec.textContent  = pad(s);
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

/* ─── VOTING ─────────────────────────────────────────────── */
function castVote(side) {
  const ep = EPISODES[CURRENT_EPISODE_INDEX];
  if (votedByEp[ep.id]) return;
  votedByEp[ep.id] = side;
  // Optimistically add the user's vote to local tallies
  if (side === "left")   ep.left.votes++;
  if (side === "right")  ep.right.votes++;
  if (side === "center") ep.cartoonOnlyVotes++;
  ep.statVotes++;
  dom.statVotes.textContent = fmtNum(ep.statVotes);

  // Highlight voted card
  if (side === "left")  dom.cardLeft.classList.add("selected-left");
  if (side === "right") dom.cardRight.classList.add("selected-right");

  // Mark buttons
  dom.voteLeft.classList.toggle("voted", side === "left");
  dom.voteCenter.classList.toggle("voted", side === "center");
  dom.voteRight.classList.toggle("voted", side === "right");
  dom.voteLeft.disabled   = true;
  dom.voteCenter.disabled = true;
  dom.voteRight.disabled  = true;

  // Show results automatically after voting
  showResults(ep, true);

  const labels = { left: ep.left.voteLabel, center: "CARTOON ONLY", right: ep.right.voteLabel };
  showToast(`Voted: ${labels[side]}!`);
}

function showResults(ep, animate = true) {
  const total = ep.left.votes + ep.right.votes + ep.cartoonOnlyVotes;
  const pL = total ? Math.round((ep.left.votes / total) * 100) : 0;
  const pC = total ? Math.round((ep.cartoonOnlyVotes / total) * 100) : 0;
  const pR = total ? 100 - pL - pC : 0;

  dom.resultsPanel.hidden = false;
  dom.totalVotes.textContent = fmtNum(total);

  if (animate) {
    // Brief delay so the CSS transition plays
    requestAnimationFrame(() => {
      dom.resultBarLeft.style.width   = pL + "%";
      dom.resultBarCenter.style.width = pC + "%";
      dom.resultBarRight.style.width  = pR + "%";
    });
  } else {
    dom.resultBarLeft.style.width   = pL + "%";
    dom.resultBarCenter.style.width = pC + "%";
    dom.resultBarRight.style.width  = pR + "%";
  }

  dom.resultLeftPct.textContent   = pL + "%";
  dom.resultCenterPct.textContent = pC + "%";
  dom.resultRightPct.textContent  = pR + "%";
  resultsVisible = true;
}

/* ─── MODAL ──────────────────────────────────────────────── */
function openModal(side) {
  const ep = EPISODES[CURRENT_EPISODE_INDEX];
  const fig = side === "left" ? ep.left : ep.right;

  dom.modalImg.src = fig.img;
  dom.modalImg.alt = fig.name;
  dom.modalImg.onerror = () => { dom.modalImg.src = makePlaceholderSvg(fig.name); dom.modalImg.onerror = null; };
  dom.modalName.textContent  = fig.name;
  dom.modalMaker.textContent = fig.maker;

  dom.modalSpecs.innerHTML = (fig.specs || []).map(s =>
    `<div class="spec-row"><span class="spec-label">${s.label}</span><span class="spec-value">${s.value}</span></div>`
  ).join("");

  dom.modalOverlay.hidden = false;
  document.body.style.overflow = "hidden";
  dom.modalClose.focus();
}

function closeModal() {
  dom.modalOverlay.hidden = true;
  document.body.style.overflow = "";
}

/* ─── TOAST ──────────────────────────────────────────────── */
let toastTimer;
function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 2800);
}

/* ─── UTILS ──────────────────────────────────────────────── */
function pad(n) { return String(n).padStart(2, "0"); }
function fmtNum(n) { return n.toLocaleString(); }
function fmtDate(d) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase();
}

/* ─── EVENT LISTENERS ────────────────────────────────────── */
dom.voteLeft.addEventListener("click",   () => castVote("left"));
dom.voteCenter.addEventListener("click", () => castVote("center"));
dom.voteRight.addEventListener("click",  () => castVote("right"));

// Clicking a figure card also votes for it
dom.cardLeft.addEventListener("click",  (e) => {
  if (e.target.closest(".view-details-btn")) return;
  if (!votedByEp[EPISODES[CURRENT_EPISODE_INDEX].id]) castVote("left");
});
dom.cardRight.addEventListener("click", (e) => {
  if (e.target.closest(".view-details-btn")) return;
  if (!votedByEp[EPISODES[CURRENT_EPISODE_INDEX].id]) castVote("right");
});

dom.leftDetailsBtn.addEventListener("click",  (e) => { e.stopPropagation(); openModal("left");  });
dom.rightDetailsBtn.addEventListener("click", (e) => { e.stopPropagation(); openModal("right"); });

dom.toggleResults.addEventListener("click", () => {
  const ep = EPISODES[CURRENT_EPISODE_INDEX];
  if (resultsVisible) {
    dom.resultsPanel.hidden = true;
    resultsVisible = false;
  } else {
    showResults(ep, true);
  }
});

dom.modalClose.addEventListener("click", closeModal);
dom.modalOverlay.addEventListener("click", (e) => { if (e.target === dom.modalOverlay) closeModal(); });

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !dom.modalOverlay.hidden) closeModal();
});

/* ─── INIT ───────────────────────────────────────────────── */
renderSelector();
loadEpisode(EPISODES[CURRENT_EPISODE_INDEX]);
