const STORAGE_KEY = "optimus-rushmore:v2";
const MAX_IMAGE_SIZE = 1200;

// Cybertron Aurora neon and gold slot colors - 10 Spots
const SLOTS = [
  { id: "face-1", label: "01", defaultName: "Founding Prime", color: "#00f0ff" }, // Energon Cyan
  { id: "face-2", label: "02", defaultName: "Engineering Icon", color: "#ffa500" }, // Copper Gold
  { id: "face-3", label: "03", defaultName: "Shelf Presence", color: "#ff007f" }, // Hot Energon Pink
  { id: "face-4", label: "04", defaultName: "Personal Grail", color: "#a13dff" }, // Electric Violet
  { id: "face-5", label: "05", defaultName: "Masterpiece Class", color: "#39ff14" }, // Matrix Green
  { id: "face-6", label: "06", defaultName: "Paint Detail", color: "#ffd700" }, // Gold
  { id: "face-7", label: "07", defaultName: "Posability King", color: "#00bfff" }, // Deep Sky Blue
  { id: "face-8", label: "08", defaultName: "G1 Tribute", color: "#ff3333" }, // Crimson Red
  { id: "face-9", label: "09", defaultName: "Giant Titan", color: "#ffff00" }, // Neon Yellow
  { id: "face-10", label: "10", defaultName: "Wallet Destroyer", color: "#e0115f" } // Ruby Red
];

// Load initial state
const state = loadState();

const els = {
  uploadBay: document.querySelector("#uploadBay"),
  uploadInput: document.querySelector("#figureUpload"),
  uploadButton: document.querySelector("#uploadButton"),
  faceRow: document.querySelector("#faceRow"),
  stagingZone: document.querySelector("#stagingZone"),
  figureCount: document.querySelector("#figureCount"),
  unrankedCount: document.querySelector("#unrankedCount"),
  captureButton: document.querySelector("#captureButton"),
  saveButton: document.querySelector("#saveButton"),
  clearButton: document.querySelector("#clearButton"),
  status: document.querySelector("#status"),
  exportCanvas: document.querySelector("#exportCanvas"),
  muteToggle: document.querySelector("#muteToggle"),
  poolSearch: document.querySelector("#poolSearch"),
  clearSearch: document.querySelector("#clearSearch"),
  poolSort: document.querySelector("#poolSort"),
  tunerDialog: document.querySelector("#tunerDialog"),
  closeTuner: document.querySelector("#closeTuner"),
  applyTuner: document.querySelector("#applyTuner"),
  resetTuner: document.querySelector("#resetTuner"),
  tunerPreviewImg: document.querySelector("#tunerPreviewImg"),
  previewContainer: document.querySelector("#previewContainer"),
  
  // Dialog slider elements
  tuneScale: document.querySelector("#tuneScale"),
  tuneX: document.querySelector("#tuneX"),
  tuneY: document.querySelector("#tuneY"),
  tuneBrightness: document.querySelector("#tuneBrightness"),
  tuneContrast: document.querySelector("#tuneContrast"),
  tuneSaturation: document.querySelector("#tuneSaturation"),
  tuneStone: document.querySelector("#tuneStone"),
  
  // Slider values text elements
  scaleVal: document.querySelector("#scaleVal"),
  xVal: document.querySelector("#xVal"),
  yVal: document.querySelector("#yVal"),
  brightnessVal: document.querySelector("#brightnessVal"),
  contrastVal: document.querySelector("#contrastVal"),
  saturationVal: document.querySelector("#saturationVal"),
};

let statusTimer = null;

// --- AUDIO SYNTH ENGINE (WEB AUDIO API) ---
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playClickSound() {
  if (!state.audioEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.06);
    
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  } catch (e) {}
}

function playPlaceSound() {
  if (!state.audioEnabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = 0.28;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    osc.type = "triangle";
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.linearRampToValueAtTime(50, now + duration);
    
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(120, now);
    
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(now + duration);
  } catch (e) {}
}

function playRemoveSound() {
  if (!state.audioEnabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.16);
    
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(now + 0.16);
  } catch (e) {}
}

function playUploadSound() {
  if (!state.audioEnabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Quick focus click
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(1600, now);
    gain1.gain.setValueAtTime(0.04, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(now + 0.03);
    
    // Secondary charging shutter
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(700, now + 0.04);
    osc2.frequency.exponentialRampToValueAtTime(100, now + 0.18);
    gain2.gain.setValueAtTime(0.08, now + 0.04);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start();
    osc2.stop(now + 0.18);
  } catch (e) {}
}

// Update audio toggle icon state
function updateMuteIcon() {
  if (state.audioEnabled) {
    els.muteToggle.classList.remove("active");
    els.muteToggle.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" width="20" height="20">
        <path fill="currentColor" d="M12 4L6 9H2v6h4l6 5V4zm3.5 8c0-1.8-1-3.3-2.5-4v8c1.5-.7 2.5-2.2 2.5-4z"/>
      </svg>
    `;
  } else {
    els.muteToggle.classList.add("active");
    els.muteToggle.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" width="20" height="20">
        <path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
      </svg>
    `;
  }
}

// --- BOOTSTRAP APP ---
buildSlots();
bindEvents();
updateMuteIcon();
render();
showStatus("Monolith primed.");

// Build Slots Dynamically in grid
function buildSlots() {
  els.faceRow.innerHTML = SLOTS.map((slot) => {
    const slotName = state.slotNames[slot.id] || slot.defaultName;
    return `
      <section class="mount-slot drop-zone" data-zone="${slot.id}" style="--slot-color: ${slot.color}">
        <div class="spotlight-glow" aria-hidden="true"></div>
        <div class="chisel-mark">${slot.label}</div>
        <div class="figure-perch" data-empty="${slotName}"></div>
        <div class="slot-plaque-wrap">
          <div class="slot-plaque" data-plaque-id="${slot.id}" title="Double click to rename category">${slotName}</div>
        </div>
      </section>
    `;
  }).join("");
}

// Bind event listeners
function bindEvents() {
  // Audio mute
  els.muteToggle.addEventListener("click", () => {
    state.audioEnabled = !state.audioEnabled;
    updateMuteIcon();
    playClickSound();
    persistState();
  });

  // Upload buttons
  els.uploadButton.addEventListener("click", () => els.uploadInput.click());
  els.uploadInput.addEventListener("change", (event) => {
    addFiles(event.target.files);
    event.target.value = "";
  });

  // Staging rack drop upload zone
  ["dragover", "dragleave", "drop"].forEach((eventName) => {
    els.uploadBay.addEventListener(eventName, handleUploadBayDrop);
  });

  // Actions
  els.saveButton.addEventListener("click", () => {
    playClickSound();
    persistState();
    showStatus("Monolith saved.");
  });

  els.clearButton.addEventListener("click", () => {
    playClickSound();
    if (!state.figures.length) return;
    const shouldClear = confirm("Clear all figures and reset categories?");
    if (!shouldClear) return;
    
    state.figures = [];
    state.staging = [];
    state.slots = createEmptySlots();
    state.slotNames = {
      "face-1": "Founding Prime",
      "face-2": "Engineering Icon",
      "face-3": "Shelf Presence",
      "face-4": "Personal Grail",
      "face-5": "Masterpiece Class",
      "face-6": "Paint Detail",
      "face-7": "Posability King",
      "face-8": "G1 Tribute",
      "face-9": "Giant Titan",
      "face-10": "Wallet Destroyer"
    };
    
    persistState();
    buildSlots(); // rebuild with original names
    bindPlaqueEditEvents();
    render();
    playRemoveSound();
    showStatus("Monolith reset.");
  });

  els.captureButton.addEventListener("click", () => {
    playClickSound();
    captureRushmore();
  });

  // Filters and search
  els.poolSearch.addEventListener("input", () => {
    if (els.poolSearch.value.trim() !== "") {
      els.clearSearch.style.display = "block";
    } else {
      els.clearSearch.style.display = "none";
    }
    renderStagingOnly();
  });

  els.clearSearch.addEventListener("click", () => {
    els.poolSearch.value = "";
    els.clearSearch.style.display = "none";
    playClickSound();
    renderStagingOnly();
  });

  els.poolSort.addEventListener("change", () => {
    playClickSound();
    renderStagingOnly();
  });

  // Plaque renaming events
  bindPlaqueEditEvents();

  // Pointer drag & drop listeners
  setupPointerDragAndDrop();

  // Dialog actions
  els.closeTuner.addEventListener("click", () => {
    playClickSound();
    els.tunerDialog.close();
  });
  
  els.resetTuner.addEventListener("click", () => {
    playClickSound();
    resetTunerSliders();
    updateTunerPreview();
  });

  els.applyTuner.addEventListener("click", () => {
    playClickSound();
    saveFigureTuning();
  });

  // Slider adjustments in real-time
  [els.tuneScale, els.tuneX, els.tuneY, els.tuneBrightness, els.tuneContrast, els.tuneSaturation, els.tuneStone].forEach(input => {
    input.addEventListener("input", () => {
      updateTunerLabels();
      updateTunerPreview();
    });
  });
}

// Bind Double Click renaming handlers to Plaques
function bindPlaqueEditEvents() {
  document.querySelectorAll(".slot-plaque").forEach(plaque => {
    plaque.addEventListener("dblclick", (e) => {
      enterPlaqueEditMode(e.target);
    });
    // Add single click touch friendly support or help text trigger
    plaque.addEventListener("click", (e) => {
      if (window.innerWidth <= 768) {
        enterPlaqueEditMode(e.target);
      }
    });
  });
}

function enterPlaqueEditMode(plaqueEl) {
  if (plaqueEl.querySelector("input")) return; // already editing
  
  const slotId = plaqueEl.dataset.plaqueId;
  const currentVal = plaqueEl.textContent;
  
  const input = document.createElement("input");
  input.type = "text";
  input.className = "plaque-input";
  input.value = currentVal;
  input.maxLength = 22;
  
  plaqueEl.innerHTML = "";
  plaqueEl.appendChild(input);
  input.focus();
  input.select();
  
  const commitChange = () => {
    const newVal = input.value.trim() || SLOTS.find(s => s.id === slotId).defaultName;
    state.slotNames[slotId] = newVal;
    plaqueEl.textContent = newVal;
    
    // Update perch empty placeholder attribute
    const perch = getSlotZone(slotId).querySelector(".figure-perch");
    perch.setAttribute("data-empty", newVal);
    
    playClickSound();
    persistState();
  };
  
  input.addEventListener("blur", commitChange);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      commitChange();
    } else if (e.key === "Escape") {
      input.removeEventListener("blur", commitChange); // ignore blur trigger
      plaqueEl.textContent = currentVal; // cancel
      playClickSound();
    }
  });
}

// --- DRAG & DROP POINTER EVENTS IMPLEMENTATION ---
function setupPointerDragAndDrop() {
  let dragData = null;

  // Prevent browser native image dragging from interrupting custom PointerEvents
  document.addEventListener("dragstart", (event) => {
    if (event.target.closest(".figure-card")) {
      event.preventDefault();
    }
  });

  // Handle pointer down on cards to begin dragging
  document.addEventListener("pointerdown", (event) => {
    const card = event.target.closest(".figure-card");
    if (!card || event.target.closest("button") || event.target.closest("input")) return;

    // Left click only
    if (event.button !== 0 && event.pointerType === "mouse") return;

    event.preventDefault();
    const figureId = card.dataset.id;
    const rect = card.getBoundingClientRect();

    dragData = {
      figureId,
      pointerId: event.pointerId,
      sourceEl: card,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      triggered: false,
      ghost: null,
    };

    card.setPointerCapture(event.pointerId);
  });

  // Handle dragging movements
  document.addEventListener("pointermove", (event) => {
    if (!dragData || dragData.pointerId !== event.pointerId) return;

    const currentX = event.clientX;
    const currentY = event.clientY;

    // Trigger threshold
    if (!dragData.triggered) {
      const distance = Math.hypot(currentX - dragData.startX, currentY - dragData.startY);
      if (distance > 6) {
        dragData.triggered = true;
        dragData.sourceEl.classList.add("is-dragging");

        // Clone element as visual floating ghost
        const ghost = dragData.sourceEl.cloneNode(true);
        ghost.classList.add("ghost-dragging");
        
        // Remove tools and text
        const tools = ghost.querySelector(".figure-tools");
        if (tools) tools.remove();
        
        // Apply absolute drag styles
        Object.assign(ghost.style, {
          position: "fixed",
          width: `${dragData.width}px`,
          height: `${dragData.height}px`,
          left: "0",
          top: "0",
          transform: `translate3d(${currentX - dragData.offsetX}px, ${currentY - dragData.offsetY}px, 0)`,
          pointerEvents: "none",
          zIndex: "1000",
          opacity: "0.85",
          transition: "none",
        });

        document.body.appendChild(ghost);
        dragData.ghost = ghost;
        playClickSound();
      }
    }

    if (dragData.triggered && dragData.ghost) {
      // Update ghost coordinates
      dragData.ghost.style.transform = `translate3d(${currentX - dragData.offsetX}px, ${currentY - dragData.offsetY}px, 0)`;

      const elemBelow = document.elementFromPoint(currentX, currentY);
      const zone = elemBelow ? elemBelow.closest(".drop-zone") : null;

      clearDropHighlights(zone);

      if (zone) {
        zone.classList.add("is-over");
      }
    }
  });

  // End dragging
  const handlePointerUp = (event) => {
    if (!dragData || dragData.pointerId !== event.pointerId) return;

    dragData.sourceEl.releasePointerCapture(event.pointerId);
    dragData.sourceEl.classList.remove("is-dragging");

    if (dragData.triggered) {
      if (dragData.ghost) dragData.ghost.remove();

      const currentX = event.clientX;
      const currentY = event.clientY;

      const elemBelow = document.elementFromPoint(currentX, currentY);
      const zone = elemBelow ? elemBelow.closest(".drop-zone") : null;

      clearDropHighlights();

      if (zone) {
        const zoneId = zone.dataset.zone;
        if (zoneId === "staging") {
          moveToStaging(dragData.figureId);
          playPlaceSound();
          showStatus("Figure unplaced.");
        } else {
          moveToSlot(dragData.figureId, zoneId);
          playPlaceSound();
          showStatus("Monolith updated.");
        }
        persistState();
        render();
      } else {
        render();
        playClickSound();
      }
    }

    dragData = null;
  };

  document.addEventListener("pointerup", handlePointerUp);
  document.addEventListener("pointercancel", handlePointerUp);
}

// --- CORE REORDER MECHANICS ---
function moveToSlot(figureId, slotId) {
  const sourceSlot = slotContaining(figureId);
  const replacedId = state.slots[slotId];

  removeFromEverywhere(figureId);
  state.slots[slotId] = figureId;

  // Swap intelligently
  if (replacedId && replacedId !== figureId) {
    if (sourceSlot) {
      state.slots[sourceSlot] = replacedId;
    } else {
      addToStaging(replacedId);
    }
  }
}

function moveToStaging(figureId) {
  removeFromEverywhere(figureId);
  addToStaging(figureId);
}

function removeFromEverywhere(figureId) {
  state.staging = state.staging.filter((id) => id !== figureId);
  Object.keys(state.slots).forEach((slotId) => {
    if (state.slots[slotId] === figureId) state.slots[slotId] = null;
  });
}

function addToStaging(figureId) {
  if (!state.staging.includes(figureId)) {
    state.staging.push(figureId);
  }
}

function slotContaining(figureId) {
  return Object.keys(state.slots).find((slotId) => state.slots[slotId] === figureId);
}

// Return mount slot DOM element
function getSlotZone(slotId) {
  return document.querySelector(`.mount-slot[data-zone="${slotId}"]`);
}

function clearDropHighlights(except = null) {
  document.querySelectorAll(".drop-zone.is-over").forEach((zone) => {
    if (zone !== except) zone.classList.remove("is-over");
  });
}

// --- FILE LOADER AND UTILITIES ---
function handleUploadBayDrop(event) {
  if (event.type === "dragover") {
    event.preventDefault();
    els.uploadBay.classList.add("is-over");
    return;
  }

  if (event.type === "dragleave") {
    els.uploadBay.classList.remove("is-over");
    return;
  }

  event.preventDefault();
  els.uploadBay.classList.remove("is-over");
  addFiles(event.dataTransfer.files);
}

async function addFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;

  showStatus(`Loading ${files.length} figures...`);
  playUploadSound();

  for (const file of files) {
    const id = crypto.randomUUID();
    const figure = {
      id,
      name: nameFromFile(file.name),
      src: "",
      tuning: {
        scale: 100,
        x: 0,
        y: 0,
        brightness: 100,
        contrast: 100,
        saturation: 100,
        stone: false
      }
    };

    state.figures.push(figure);
    state.staging.push(id);
    render();

    try {
      figure.src = await fileToFittedDataUrl(file);
      render();
    } catch {
      removeFigure(id);
      showStatus(`Could not load ${file.name}.`);
    }
  }

  persistState();
  render();
  showStatus(`${files.length} figures added.`);
}

function removeFigure(id) {
  state.figures = state.figures.filter((figure) => figure.id !== id);
  state.staging = state.staging.filter((figureId) => figureId !== id);
  Object.keys(state.slots).forEach((slotId) => {
    if (state.slots[slotId] === id) state.slots[slotId] = null;
  });
}

function findFigure(id) {
  return state.figures.find((figure) => figure.id === id);
}

function createEmptySlots() {
  return Object.fromEntries(SLOTS.map((slot) => [slot.id, null]));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.figures)) throw new Error("No saved monolith");
    return {
      figures: saved.figures.map((figure) => ({
        ...figure,
        tuning: figure.tuning || { scale: 100, x: 0, y: 0, brightness: 100, contrast: 100, saturation: 100, stone: false },
        eliminated: typeof figure.eliminated === "boolean" ? figure.eliminated : false
      })),
      staging: Array.isArray(saved.staging) ? saved.staging : [],
      slots: { ...createEmptySlots(), ...saved.slots },
      slotNames: Object.assign({
        "face-1": "Founding Prime",
        "face-2": "Engineering Icon",
        "face-3": "Shelf Presence",
        "face-4": "Personal Grail",
        "face-5": "Masterpiece Class",
        "face-6": "Paint Detail",
        "face-7": "Posability King",
        "face-8": "G1 Tribute",
        "face-9": "Giant Titan",
        "face-10": "Wallet Destroyer"
      }, saved.slotNames),
      audioEnabled: typeof saved.audioEnabled === "boolean" ? saved.audioEnabled : true
    };
  } catch {
    return {
      figures: [],
      staging: [],
      slots: createEmptySlots(),
      slotNames: {
        "face-1": "Founding Prime",
        "face-2": "Engineering Icon",
        "face-3": "Shelf Presence",
        "face-4": "Personal Grail",
        "face-5": "Masterpiece Class",
        "face-6": "Paint Detail",
        "face-7": "Posability King",
        "face-8": "G1 Tribute",
        "face-9": "Giant Titan",
        "face-10": "Wallet Destroyer"
      },
      audioEnabled: true
    };
  }
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      figures: state.figures,
      staging: state.staging,
      slots: state.slots,
      slotNames: state.slotNames,
      audioEnabled: state.audioEnabled
    }));
  } catch {
    showStatus("Save failed: images are too large.");
  }
}

// Show flash user status feedback
function showStatus(message) {
  els.status.textContent = message;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    if (els.status.textContent === message) els.status.textContent = "";
  }, 2600);
}

function nameFromFile(fileName) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Optimus Prime";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fileToFittedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const outputType = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
    reader.onload = () => fitImageToDataUrl(reader.result, outputType, 0.9).then(resolve, reject);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fitImageToDataUrl(src, type = "image/png", quality = 0.92) {
  return loadImage(src).then((image) => {
    const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL(type, quality);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

// --- RENDER BOARDS ---
function render() {
  renderStagingOnly();

  // Render Slots
  SLOTS.forEach((slot) => {
    const zone = getSlotZone(slot.id);
    const perch = zone.querySelector(".figure-perch");
    perch.innerHTML = "";

    const figure = findFigure(state.slots[slot.id]);
    if (figure) {
      perch.appendChild(renderFigure(figure, true));
    }
  });

  const count = state.figures.length;
  els.figureCount.textContent = `${count} ${count === 1 ? "figure" : "figures"}`;
}

// Render Staging area only (supports live search & sort filter)
function renderStagingOnly() {
  els.stagingZone.innerHTML = "";
  
  const query = els.poolSearch.value.trim().toLowerCase();
  
  // Filter staging candidates
  let stagingFigures = state.staging
    .map(id => findFigure(id))
    .filter(fig => fig !== undefined);
    
  if (query !== "") {
    stagingFigures = stagingFigures.filter(fig => fig.name.toLowerCase().includes(query));
  }
  
  // Sort staging candidates
  const sortBy = els.poolSort.value;
  if (sortBy === "az") {
    stagingFigures.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === "za") {
    stagingFigures.sort((a, b) => b.name.localeCompare(a.name));
  } else if (sortBy === "oldest") {
    // Keep insertion order
  } else if (sortBy === "newest") {
    stagingFigures.reverse();
  }

  stagingFigures.forEach((figure) => {
    els.stagingZone.appendChild(renderFigure(figure, false));
  });

  els.unrankedCount.textContent = stagingFigures.length.toString();
}

function renderFigure(figure, isPlacedOnMonument = false) {
  const card = document.createElement("article");
  card.className = "figure-card";
  card.draggable = false; // block HTML5 drag
  card.dataset.id = figure.id;
  
  if (figure.eliminated) {
    card.classList.add("is-eliminated");
  }
  
  const tuning = figure.tuning || { scale: 100, x: 0, y: 0, brightness: 100, contrast: 100, saturation: 100, stone: false };
  
  // Build transform and filter strings
  const transformStyle = `transform: scale(${tuning.scale / 100}) translate(${tuning.x}px, ${tuning.y}px);`;
  
  let filterStr = `brightness(${tuning.brightness}%) contrast(${tuning.contrast}%) saturate(${tuning.saturation}%)`;
  if (tuning.stone) {
    card.classList.add("stone-carved");
    // Cobalt Bronze/Copper Metallic Alloy filter
    filterStr += " grayscale(100%) sepia(100%) hue-rotate(10deg) saturate(200%) contrast(1.3) brightness(0.9)";
  }
  const filterStyle = `filter: drop-shadow(0 12px 14px rgba(0,0,0,0.65)) ${filterStr};`;
  
  card.innerHTML = `
    ${figure.eliminated ? `
    <div class="card-restore-container">
      <button class="btn-restore-figure" data-action="restore" type="button" title="Restore figure to color">↺</button>
    </div>
    ` : `
    <div class="card-balloon-container">
      <button class="btn-pop-balloon" data-action="pop-balloon" type="button" title="Eliminate figure (Balloon Pop!)">🎈</button>
    </div>
    `}
    <div class="figure-tools">
      <button class="btn-tune-figure" data-action="tune" type="button" title="Fine tune alignment & light">
        <svg viewBox="0 0 24 24" width="12" height="12">
          <path fill="currentColor" d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>
        </svg>
      </button>
      <button class="remove-figure" data-action="remove" type="button" title="Delete figure completely">&times;</button>
    </div>
    <div class="figure-media">
      ${figure.src ? `<img src="${figure.src}" alt="${escapeHtml(figure.name)}" style="${transformStyle} ${filterStyle}" draggable="false" />` : ""}
    </div>
    <span class="figure-name" title="${escapeHtml(figure.name)}">${escapeHtml(figure.name)}</span>
  `;
  return card;
}

// Bind direct clicks on card action tools (remove, tune)
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const card = button.closest(".figure-card");
  if (!card) return;

  const action = button.dataset.action;
  const figureId = card.dataset.id;

  if (action === "remove") {
    playRemoveSound();
    removeFigure(figureId);
    persistState();
    render();
    showStatus("Figure deleted.");
  } else if (action === "tune") {
    playClickSound();
    openTuner(figureId);
  } else if (action === "pop-balloon") {
    const balloonWrapper = card.querySelector(".card-balloon-container");
    floatAndPopBalloon(card, balloonWrapper, figureId);
  } else if (action === "restore") {
    restoreFigure(figureId);
  }
});

// --- DIALOG FINE-TUNING CONTROLS ---
let tuningFigureId = null;

function openTuner(figureId) {
  tuningFigureId = figureId;
  const figure = findFigure(figureId);
  if (!figure) return;

  const tuning = figure.tuning || {
    scale: 100,
    x: 0,
    y: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    stone: false
  };

  // Populate dialog controls
  els.tuneScale.value = tuning.scale;
  els.tuneX.value = tuning.x;
  els.tuneY.value = tuning.y;
  els.tuneBrightness.value = tuning.brightness;
  els.tuneContrast.value = tuning.contrast;
  els.tuneSaturation.value = tuning.saturation;
  els.tuneStone.checked = tuning.stone;

  // Set image source for live preview
  els.tunerPreviewImg.src = figure.src;

  updateTunerLabels();
  updateTunerPreview();

  // Show modal
  els.tunerDialog.showModal();
}

function updateTunerLabels() {
  els.scaleVal.textContent = els.tuneScale.value;
  els.xVal.textContent = els.tuneX.value;
  els.yVal.textContent = els.tuneY.value;
  els.brightnessVal.textContent = els.tuneBrightness.value;
  els.contrastVal.textContent = els.tuneContrast.value;
  els.saturationVal.textContent = els.tuneSaturation.value;
}

function updateTunerPreview() {
  const scale = els.tuneScale.value;
  const x = els.tuneX.value;
  const y = els.tuneY.value;
  const brightness = els.tuneBrightness.value;
  const contrast = els.tuneContrast.value;
  const saturation = els.tuneSaturation.value;
  const stone = els.tuneStone.checked;

  const transform = `scale(${scale / 100}) translate(${x}px, ${y}px)`;
  
  let filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
  if (stone) {
    // Cobalt Bronze Metallic Alloy filter preview
    filter += " grayscale(100%) sepia(100%) hue-rotate(10deg) saturate(200%) contrast(1.3) brightness(0.9)";
  }

  els.tunerPreviewImg.style.transform = transform;
  els.tunerPreviewImg.style.filter = filter;
}

function resetTunerSliders() {
  els.tuneScale.value = 100;
  els.tuneX.value = 0;
  els.tuneY.value = 0;
  els.tuneBrightness.value = 100;
  els.tuneContrast.value = 100;
  els.tuneSaturation.value = 100;
  els.tuneStone.checked = false;
  updateTunerLabels();
}

function saveFigureTuning() {
  if (!tuningFigureId) return;
  const figure = findFigure(tuningFigureId);
  if (!figure) return;

  figure.tuning = {
    scale: parseInt(els.tuneScale.value, 10),
    x: parseInt(els.tuneX.value, 10),
    y: parseInt(els.tuneY.value, 10),
    brightness: parseInt(els.tuneBrightness.value, 10),
    contrast: parseInt(els.tuneContrast.value, 10),
    saturation: parseInt(els.tuneSaturation.value, 10),
    stone: els.tuneStone.checked
  };

  persistState();
  render();
  els.tunerDialog.close();
  showStatus("Fine-tuning saved.");
  tuningFigureId = null;
}

// --- HIGH RESOLUTION CANVAS EXPORT (CYBERTRON AURORA) ---
async function captureRushmore() {
  const placedFigures = Object.values(state.slots).filter(id => id !== null);
  if (!placedFigures.length) {
    showStatus("Place figures in pods first.");
    return;
  }

  showStatus("Creating PNG...");

  const canvas = els.exportCanvas;
  const ctx = canvas.getContext;
  const width = 1920;
  const height = 1920; // 1:1 format to fit background aspect ratio
  canvas.width = width;
  canvas.height = height;

  // Load Cybertron aurora background
  let bgImage = null;
  try {
    bgImage = await loadImage("assets/cybertron_aurora.png");
  } catch (e) {
    console.error("Backdrop load failed", e);
  }

  // 1. Draw backdrop image
  drawExportScene(ctx, width, height, bgImage);
  
  // 2. Draw mechanical pods, badges, and figures
  await drawExportFaces(ctx, width, height);

  // Trigger download
  const link = document.createElement("a");
  link.download = "prime-cybertron-aurora.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
  showStatus("PNG exported!");
}

function drawExportScene(ctx, width, height, bgImage) {
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, width, height);
  } else {
    // Fallback space sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#050403");
    sky.addColorStop(0.5, "#0b0c10");
    sky.addColorStop(1, "#010101");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
  }

  // Draw natural energon mist at the bottom
  const fog = ctx.createLinearGradient(0, height - 320, 0, height);
  fog.addColorStop(0, "rgba(0, 240, 255, 0)");
  fog.addColorStop(0.6, "rgba(0, 240, 255, 0.08)");
  fog.addColorStop(1, "rgba(8, 6, 5, 0.6)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, height - 320, width, 320);
}

async function drawExportFaces(ctx, width, height) {
  const positions = [
    // Row 1 (top)
    { x: 160, y: 520, w: 280, h: 500 },
    { x: 490, y: 520, w: 280, h: 500 },
    { x: 820, y: 520, w: 280, h: 500 },
    { x: 1150, y: 520, w: 280, h: 500 },
    { x: 1480, y: 520, w: 280, h: 500 },
    // Row 2 (bottom)
    { x: 160, y: 1100, w: 280, h: 500 },
    { x: 490, y: 1100, w: 280, h: 500 },
    { x: 820, y: 1100, w: 280, h: 500 },
    { x: 1150, y: 1100, w: 280, h: 500 },
    { x: 1480, y: 1100, w: 280, h: 500 }
  ];

  for (let i = 0; i < SLOTS.length; i += 1) {
    const slot = SLOTS[i];
    const pos = positions[i];
    const slotName = state.slotNames[slot.id] || slot.defaultName;

    // A. Draw Recessed Charging Pod
    drawStoneFace(ctx, pos, slot);

    // B. Draw Placed Figure
    const figure = findFigure(state.slots[slot.id]);
    if (figure?.src) {
      const image = await loadImage(figure.src);
      const tuning = figure.tuning || { scale: 100, x: 0, y: 0, brightness: 100, contrast: 100, saturation: 100, stone: false };

      // Base scaling inside slot
      const fitScale = Math.min((pos.w - 30) / image.width, (pos.h - 90) / image.height);
      const customScale = tuning.scale / 100;
      const finalScale = fitScale * customScale;

      const drawW = image.width * finalScale;
      const drawH = image.height * finalScale;

      // Base center calculations
      const baseX = pos.x + (pos.w - drawW) / 2;
      const baseY = pos.y + pos.h - drawH - 52; // perch clearance

      // Add slider pixel translations
      const finalX = baseX + tuning.x;
      const finalY = baseY + tuning.y;

      ctx.save();
      
      // Heavy pod shadow
      ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 18;

      // Apply tuning filter settings in Export Canvas!
      let filterStr = `brightness(${tuning.brightness}%) contrast(${tuning.contrast}%) saturate(${tuning.saturation}%)`;
      if (figure.eliminated) {
        filterStr += " grayscale(100%) contrast(0.9) brightness(0.7)";
      } else if (tuning.stone) {
        // Bronze/Copper Alloy Metallic Filter
        filterStr += " grayscale(100%) sepia(100%) hue-rotate(10deg) saturate(200%) contrast(1.3) brightness(0.9)";
      }
      
      if (typeof ctx.filter !== "undefined") {
        ctx.filter = filterStr;
      }

      ctx.drawImage(image, finalX, finalY, drawW, drawH);
      ctx.restore();
      
      if (typeof ctx.filter !== "undefined") {
        ctx.filter = "none";
      }
    }

    // C. Draw Slate Plaque
    drawExportPlaque(ctx, pos, slot, slotName);
  }
}

function drawStoneFace(ctx, pos, slot) {
  // Draw recessed pod interior space
  ctx.save();
  // Warm copper-bronze gradient for charging pod depth
  const alloy = ctx.createLinearGradient(pos.x, pos.y, pos.x + pos.w, pos.y + pos.h);
  alloy.addColorStop(0, "#48362b");
  alloy.addColorStop(0.5, "#251b14");
  alloy.addColorStop(1, "#0c0a08");
  ctx.fillStyle = alloy;
  
  // Geometric pod path
  ctx.beginPath();
  ctx.moveTo(pos.x + pos.w * 0.15, pos.y + pos.h);
  ctx.lineTo(pos.x + pos.w * 0.05, pos.y + pos.h * 0.35);
  ctx.quadraticCurveTo(pos.x + pos.w * 0.5, pos.y - 25, pos.x + pos.w * 0.95, pos.y + pos.h * 0.35);
  ctx.lineTo(pos.x + pos.w * 0.85, pos.y + pos.h);
  ctx.closePath();
  ctx.fill();

  // Inset shadow simulation
  ctx.strokeStyle = "rgba(0, 0, 0, 0.95)";
  ctx.lineWidth = 14;
  ctx.stroke();

  // Draw cyber glowing rim highlight
  ctx.strokeStyle = slot.color;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.6;
  ctx.shadowColor = slot.color;
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.restore();
  
  // Plinth outline guide dashes
  ctx.save();
  ctx.strokeStyle = "rgba(255, 165, 0, 0.08)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 8]);
  ctx.beginPath();
  ctx.moveTo(pos.x + pos.w * 0.18, pos.y + pos.h - 20);
  ctx.lineTo(pos.x + pos.w * 0.09, pos.y + pos.h * 0.38);
  ctx.quadraticCurveTo(pos.x + pos.w * 0.5, pos.y - 2, pos.x + pos.w * 0.91, pos.y + pos.h * 0.38);
  ctx.lineTo(pos.x + pos.w * 0.82, pos.y + pos.h - 20);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  
  // Draw laser etched glowing number
  ctx.save();
  ctx.font = "bold 20px 'Outfit', sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = slot.color;
  ctx.shadowColor = slot.color;
  ctx.shadowBlur = 8;
  ctx.fillText(slot.label, pos.x + pos.w * 0.18, pos.y + 46);
  ctx.restore();
}

function drawExportPlaque(ctx, pos, slot, nameText) {
  const pW = pos.w * 0.85;
  const pH = 44;
  const pX = pos.x + (pos.w - pW) / 2;
  const pY = pos.y + pos.h - 40;

  ctx.save();
  
  // Plaque drop shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 6;

  // Dark alloy badge background
  ctx.fillStyle = "#130d0a";
  ctx.strokeStyle = "rgba(255, 165, 0, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(pX, pY, pW, pH, 5);
  ctx.fill();
  ctx.stroke();
  
  // Metal rivet details
  ctx.fillStyle = "rgba(255, 165, 0, 0.35)";
  ctx.beginPath();
  ctx.arc(pX + 8, pY + pH/2, 2.5, 0, Math.PI * 2);
  ctx.arc(pX + pW - 8, pY + pH/2, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Glowing cyber rim outline
  ctx.strokeStyle = slot.color;
  ctx.globalAlpha = 0.45;
  ctx.shadowColor = slot.color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.roundRect(pX, pY, pW, pH, 5);
  ctx.stroke();

  // Technical white text details
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px 'Outfit', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(nameText.toUpperCase(), pX + pW / 2, pY + pH / 2 + 1);

  ctx.restore();
}


function floatAndPopBalloon(cardEl, balloonEl, figureId) {
  playPopSound();
  
  if (balloonEl) {
    balloonEl.classList.add("floating-off");
  }
  
  setTimeout(() => {
    createBalloonPopAnimation(cardEl);
    
    const figure = findFigure(figureId);
    if (figure) {
      figure.eliminated = true;
    }
    persistState();
    render();
  }, 240);
}

function restoreFigure(figureId) {
  playClickSound();
  const figure = findFigure(figureId);
  if (figure) {
    figure.eliminated = false;
  }
  persistState();
  render();
  showStatus("Figure restored.");
}


function playPopSound() {
  if (!state.audioEnabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Create white noise buffer for balloon rubber burst
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = ctx.createBufferSource();
    noiseNode.buffer = buffer;
    
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(350, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 0.08);
    filter.Q.setValueAtTime(6, now);
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    
    noiseNode.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    noiseNode.start();
    noiseNode.stop(now + 0.08);
    
    // Low frequency thump for explosion force
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.14);
    
    oscGain.gain.setValueAtTime(0.24, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    
    osc.start();
    osc.stop(now + 0.14);
  } catch (e) {
    console.error("Pop sound failed", e);
  }
}

function createBalloonPopAnimation(parent) {
  const container = document.createElement("div");
  container.className = "balloon-pop-container";
  
  // Pick a random neon color matching Cybertron theme
  const colors = ["#00f0ff", "#ff007f", "#ffa500", "#a13dff", "#39ff14", "#ffd700", "#ff3333", "#ffff00"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  container.style.setProperty("--balloon-color", color);
  
  const balloon = document.createElement("div");
  balloon.className = "pop-balloon";
  
  const string = document.createElement("div");
  string.className = "pop-balloon-string";
  balloon.appendChild(string);
  
  container.appendChild(balloon);
  parent.appendChild(container);
  
  // After balloon growth animation finishes (170ms), burst it
  setTimeout(() => {
    balloon.style.display = "none";
    
    // Generate flying balloon fragments
    const particleCount = 18;
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement("div");
      p.className = "pop-particle";
      
      const angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.4;
      const distance = 40 + Math.random() * 95;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 55; // burst at the top of the card!
      
      const size = 6 + Math.random() * 11;
      const duration = 400 + Math.random() * 300;
      
      p.style.setProperty("--color", color);
      p.style.setProperty("--dx", `${dx}px`);
      p.style.setProperty("--dy", `${dy}px`);
      p.style.setProperty("--size", `${size}px`);
      p.style.setProperty("--duration", `${duration}ms`);
      
      container.appendChild(p);
    }
  }, 170);
  
  // Remove container element after animation complete
  setTimeout(() => {
    container.remove();
  }, 950);
}
