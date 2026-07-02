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

  {
    id: 35,
    character: "ULTRA MAGNUS",
    epLabel: "EPISODE 35",
    epName: "City Commander Clash",
    voteEnds: new Date("2026-08-26T23:59:59"),
    statVotes: 3120, statComments: 940,
    cartoon: { img: "assets/placeholders/um-cartoon.png", alt: "G1 Ultra Magnus cartoon reference" },
    left: {
      name: "X-TRANSBOTS MX-22M STACK", maker: "ULTRA MAGNUS",
      img: "assets/placeholders/xtb-mx22m-magnus.png",
      voteLabel: "VOTE MX-22M STACK", voteMaker: "X-TRANSBOTS", votes: 1602,
      specs: [
        { label: "Version", value: "Metallic" },
        { label: "Scale", value: "1:32 (MP scale)" },
        { label: "Material", value: "ABS & die-cast" },
        { label: "Transformation", value: "Car carrier" },
      ],
    },
    right: {
      name: "FANTASTIC MODEL FM-02 MARGH", maker: "ULTRA MAGNUS",
      img: "assets/placeholders/fm02-magnus.png",
      voteLabel: "VOTE FM-02 MARGH", voteMaker: "FANTASTIC MODEL", votes: 1284,
      specs: [
        { label: "Scale", value: "1:32 (MP scale)" },
        { label: "Material", value: "ABS & POM" },
        { label: "Transformation", value: "Car carrier" },
      ],
    },
    cartoonOnlyVotes: 234,
  },

  {
    id: 36,
    character: "SUPERION",
    epLabel: "EPISODE 36",
    epName: "Aerialbots Assemble",
    voteEnds: new Date("2026-09-02T23:59:59"),
    statVotes: 4870, statComments: 1502,
    cartoon: { img: "assets/placeholders/superion-cartoon.png", alt: "G1 Superion cartoon reference" },
    left: {
      name: "ZETA TOYS ZB-06 SUPERITRON", maker: "SUPERION",
      img: "assets/placeholders/zeta-superitron.png",
      voteLabel: "VOTE SUPERITRON", voteMaker: "ZETA TOYS", votes: 2210,
      specs: [
        { label: "Combiner", value: "Set of 5 Aerialbots" },
        { label: "Scale", value: "Oversized" },
        { label: "Material", value: "ABS & die-cast" },
      ],
    },
    right: {
      name: "FANS TOYS ETHEREAON", maker: "SUPERION",
      img: "assets/placeholders/ft-ethereaon.png",
      voteLabel: "VOTE ETHEREAON", voteMaker: "FANS TOYS", votes: 2189,
      specs: [
        { label: "Combiner", value: "Set of 5 Aerialbots" },
        { label: "Scale", value: "1:32 (MP scale)" },
        { label: "Material", value: "ABS & die-cast" },
      ],
    },
    cartoonOnlyVotes: 471,
  },

  {
    id: 37,
    character: "OCTANE",
    epLabel: "EPISODE 37",
    epName: "Triple-Changer Rematch",
    voteEnds: new Date("2026-09-09T23:59:59"),
    statVotes: 2540, statComments: 705,
    cartoon: { img: "assets/placeholders/octane2-cartoon.png", alt: "G1 Octane cartoon reference" },
    left: {
      name: "KFC STRATOTANKER", maker: "OCTANE",
      img: "assets/placeholders/kfc-stratotanker.png",
      voteLabel: "VOTE STRATOTANKER", voteMaker: "KFC TOYS", votes: 1298,
      specs: [
        { label: "Line", value: "Eavi Metal Phase 11A" },
        { label: "Version", value: "Metallic" },
        { label: "Transformation", value: "Jet / fuel tanker" },
      ],
    },
    right: {
      name: "UNIQUE TOYS UT-Y-01", maker: "OCTANE",
      img: "assets/placeholders/ut-y01-octane.png",
      voteLabel: "VOTE UT-Y-01", voteMaker: "UNIQUE TOYS", votes: 1015,
      specs: [
        { label: "Name", value: "Fuel Supply Provider" },
        { label: "Material", value: "ABS & POM" },
        { label: "Transformation", value: "Jet / fuel tanker" },
      ],
    },
    cartoonOnlyVotes: 227,
  },

  {
    id: 38,
    character: "CLIFFJUMPER",
    epLabel: "EPISODE 38",
    epName: "Minibot Bravado",
    voteEnds: new Date("2026-09-16T23:59:59"),
    statVotes: 2980, statComments: 812,
    cartoon: { img: "assets/placeholders/cliffjumper-cartoon.png", alt: "G1 Cliffjumper cartoon reference" },
    left: {
      name: "MMC PS-09A HELLION", maker: "CLIFFJUMPER",
      img: "assets/placeholders/mmc-cliffjumper.png",
      voteLabel: "VOTE PS-09A HELLION", voteMaker: "MASTERMIND CREATIONS", votes: 1544,
      specs: [
        { label: "Line", value: "Reformatted" },
        { label: "Scale", value: "1:32 (MP scale)" },
        { label: "Material", value: "ABS & die-cast" },
      ],
    },
    right: {
      name: "X-TRANSBOTS MM-X TORO", maker: "CLIFFJUMPER",
      img: "assets/placeholders/xtb-cliffjumper.png",
      voteLabel: "VOTE MM-X TORO", voteMaker: "X-TRANSBOTS", votes: 1210,
      specs: [
        { label: "Scale", value: "1:32 (MP scale)" },
        { label: "Material", value: "ABS & die-cast" },
        { label: "Transformation", value: "Sports car" },
      ],
    },
    cartoonOnlyVotes: 226,
  },

  {
    id: 39,
    character: "REFLECTOR",
    epLabel: "EPISODE 39",
    epName: "Three-in-One Focus",
    voteEnds: new Date("2026-09-23T23:59:59"),
    statVotes: 2115, statComments: 566,
    cartoon: { img: "assets/placeholders/reflector-cartoon.png", alt: "G1 Reflector cartoon reference" },
    left: {
      name: "KFC OPTICLONES", maker: "REFLECTOR",
      img: "assets/placeholders/kfc-opticlones.png",
      voteLabel: "VOTE OPTICLONES", voteMaker: "KFC TOYS", votes: 1102,
      specs: [
        { label: "Line", value: "Eavi Metal Phase 5A" },
        { label: "Set", value: "Set of 3" },
        { label: "Transformation", value: "Camera" },
      ],
    },
    right: {
      name: "FANS TOYS FT-11 SPOTTER", maker: "REFLECTOR",
      img: "assets/placeholders/ft11-spotter.png",
      voteLabel: "VOTE FT-11 SPOTTER", voteMaker: "FANS TOYS", votes: 842,
      specs: [
        { label: "Set", value: "Set of 3" },
        { label: "Material", value: "ABS & die-cast" },
        { label: "Transformation", value: "Camera" },
      ],
    },
    cartoonOnlyVotes: 171,
  },

  {
    id: 40,
    character: "THUNDERCRACKER",
    epLabel: "EPISODE 40",
    epName: "Seeker Sonic Boom",
    voteEnds: new Date("2026-09-30T23:59:59"),
    statVotes: 3760, statComments: 1041,
    cartoon: { img: "assets/placeholders/thundercracker-cartoon.png", alt: "G1 Thundercracker cartoon reference" },
    left: {
      name: "DEFORMATION SPACE DS-01R", maker: "THUNDERCRACKER",
      img: "assets/placeholders/ds01r-thundercracker.png",
      voteLabel: "VOTE DS-01R", voteMaker: "DEFORMATION SPACE", votes: 1789,
      specs: [
        { label: "Scale", value: "1:60 (MP scale)" },
        { label: "Material", value: "ABS & die-cast" },
        { label: "Transformation", value: "F-15 jet" },
      ],
    },
    right: {
      name: "TAKARA TOMY MP-52", maker: "THUNDERCRACKER",
      img: "assets/placeholders/mp52-thundercracker.png",
      voteLabel: "VOTE MP-52", voteMaker: "TAKARA TOMY", votes: 1748,
      specs: [
        { label: "Version", value: "2.0" },
        { label: "Line", value: "Masterpiece" },
        { label: "Transformation", value: "F-15 jet" },
      ],
    },
    cartoonOnlyVotes: 223,
  },

  {
    id: 41,
    character: "SKYFIRE",
    epLabel: "EPISODE 41",
    epName: "Valiant Defector",
    voteEnds: new Date("2026-10-07T23:59:59"),
    statVotes: 4405, statComments: 1330,
    cartoon: { img: "assets/placeholders/skyfire-cartoon.png", alt: "G1 Skyfire (Jetfire) cartoon reference" },
    left: {
      name: "TAKARA TOMY MP-57 SKYFIRE", maker: "SKYFIRE",
      img: "assets/placeholders/mp57-skyfire.png",
      voteLabel: "VOTE MP-57 SKYFIRE", voteMaker: "TAKARA TOMY", votes: 2380,
      specs: [
        { label: "Line", value: "Masterpiece" },
        { label: "Size", value: "Massive" },
        { label: "Transformation", value: "VF-1 style jet" },
      ],
    },
    right: {
      name: "FANS TOYS FT-10 PHOENIX", maker: "SKYFIRE",
      img: "assets/placeholders/ft10-phoenix.png",
      voteLabel: "VOTE FT-10 PHOENIX", voteMaker: "FANS TOYS", votes: 1798,
      specs: [
        { label: "Scale", value: "1:32 (MP scale)" },
        { label: "Material", value: "ABS & die-cast" },
        { label: "Transformation", value: "VF-1 style jet" },
      ],
    },
    cartoonOnlyVotes: 227,
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

      // Crossfade the arena content during the swap
      const arena = document.getElementById("arena");
      arena.classList.add("switching");
      setTimeout(() => {
        loadEpisode(EPISODES[idx]);
        arena.classList.remove("switching");
      }, 220);
      arena.scrollIntoView({ behavior: "smooth", block: "start" });
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

/* ─── ANIMATED COUNT-UP ──────────────────────────────────── */
function countUp(el, target, duration = 900) {
  const start = performance.now();
  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    el.textContent = fmtNum(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
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
  countUp(dom.statVotes, ep.statVotes);
  countUp(dom.statComments, ep.statComments);
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

/* ─── 3D TILT ON FIGURE CARDS ────────────────────────────── */
function attachTilt(card) {
  const strength = 7; // max degrees
  card.addEventListener("mousemove", (e) => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform =
      `perspective(900px) rotateY(${x * strength}deg) rotateX(${-y * strength}deg) translateY(-6px) scale(1.01)`;
  });
  card.addEventListener("mouseleave", () => {
    card.style.transform = "";
  });
}

attachTilt(dom.cardLeft);
attachTilt(dom.cardRight);

/* ─── INIT ───────────────────────────────────────────────── */
renderSelector();
loadEpisode(EPISODES[CURRENT_EPISODE_INDEX]);
