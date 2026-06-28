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
];

/* ─── CONFIG ─────────────────────────────────────────────── */
const CURRENT_EPISODE_INDEX = 0;

/* ─── STATE ──────────────────────────────────────────────── */
let voted = null;          // 'left' | 'center' | 'right' | null
let resultsVisible = false;
let countdownInterval = null;

/* ─── DOM REFS ───────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const dom = {
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

/* ─── LOAD EPISODE ───────────────────────────────────────── */
function loadEpisode(ep) {
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
  if (voted) return;
  voted = side;

  const ep = EPISODES[CURRENT_EPISODE_INDEX];
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
  if (!voted) castVote("left");
});
dom.cardRight.addEventListener("click", (e) => {
  if (e.target.closest(".view-details-btn")) return;
  if (!voted) castVote("right");
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
loadEpisode(EPISODES[CURRENT_EPISODE_INDEX]);
