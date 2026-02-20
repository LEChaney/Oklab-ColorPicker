// ================================================================
//  RENDER ORCHESTRATION
//  Different interactions require recomputing different parts:
//  - renderAll: recompute everything (initial load, color pick)
//  - onABChanged: a or b changed → recompute L slider, redraw both
//  - onLightnessChanged: L changed → recompute a,b field, redraw both
// ================================================================

/** Helper: redraw all slider indicators + info (no pixel recomputation) */
function drawAllSliders() {
  drawLightnessSlider();
  drawChromaSlider();
  drawHueSlider();
}

/** Helper: recompute all slider gradients */
function renderAllSliderColors() {
  renderLightnessSliderColors();
  renderChromaSliderColors();
  renderHueSliderColors();
}

function renderAll() {
  syncPickerToEditTarget();
  renderABPickerColors();
  renderAllSliderColors();
  drawABPicker();
  drawAllSliders();
  updateInfoPanel();
  updateLightingPanel();
}

function onABChanged() {
  renderAllSliderColors();
  drawABPicker();
  drawAllSliders();
  updateInfoPanel();
  writePickerToEditTarget();
  updateLightingPanel();
}

function onLightnessChanged() {
  renderABPickerColors();
  renderAllSliderColors();
  drawABPicker();
  drawAllSliders();
  updateInfoPanel();
  writePickerToEditTarget();
  updateLightingPanel();
}

function onChromaChanged() {
  renderABPickerColors();
  renderAllSliderColors();
  drawABPicker();
  drawAllSliders();
  updateInfoPanel();
  writePickerToEditTarget();
  updateLightingPanel();
}

function onHueChanged() {
  renderABPickerColors();
  renderAllSliderColors();
  drawABPicker();
  drawAllSliders();
  updateInfoPanel();
  writePickerToEditTarget();
  updateLightingPanel();
}

/**
 * Write the current picker state (currentL/A/B) into the active
 * edit target (albedo or light). Only acts when Lighting Lab is open.
 */
function writePickerToEditTarget() {
  if (!isLightingOpen) return;
  if (editTarget === 'albedo') {
    albedoL = currentL;
    albedoA = currentA;
    albedoB = currentB;
  } else {
    lightL = currentL;
    lightA = currentA;
    lightB = currentB;
  }
}

/**
 * Load the active edit target's color into the picker state
 * and re-render.
 */
function syncPickerToEditTarget() {
  if (!isLightingOpen) return;
  if (editTarget === 'albedo') {
    currentL = albedoL;
    currentA = albedoA;
    currentB = albedoB;
  } else {
    currentL = lightL;
    currentA = lightA;
    currentB = lightB;
  }
}

/**
 * Switch the main picker to edit albedo or light color.
 */
function setEditTarget(target) {
  editTarget = target;
  document.getElementById('tab-albedo').classList.toggle('tab-active', target === 'albedo');
  document.getElementById('tab-light').classList.toggle('tab-active', target === 'light');
  document.getElementById('swatch-albedo').classList.toggle('selected', target === 'albedo');
  document.getElementById('swatch-light').classList.toggle('selected', target === 'light');
  syncPickerToEditTarget();
  renderAll();
  scheduleSave();
}

function toggleLightingPanel() {
  isLightingOpen = !isLightingOpen;
  document.getElementById('lighting-panel').classList.toggle('open', isLightingOpen);
  document.getElementById('lighting-toggle-button').classList.toggle('active', isLightingOpen);
  if (isLightingOpen) {
    // Snapshot current picker color as albedo
    albedoL = currentL;
    albedoA = currentA;
    albedoB = currentB;
    editTarget = 'albedo';
    document.getElementById('tab-albedo').classList.add('tab-active');
    document.getElementById('tab-light').classList.remove('tab-active');
    document.getElementById('swatch-albedo').classList.add('selected');
    document.getElementById('swatch-light').classList.remove('selected');
    updateLightingPanel();
  }
  scheduleSave();
}


// ================================================================
//  POINTER INTERACTION
//  Handles click-and-drag on both the a,b picker and the L slider.
//  Uses requestAnimationFrame to throttle redraws during drag.
// ================================================================

let isDraggingAB = false;
let isDraggingLightness = false;
let isDraggingChroma = false;
let isDraggingHue = false;
let isDraggingIntensity = false;
let isAnimationFramePending = false;

/**
 * Read pointer position over the a,b picker canvas and update
 * currentA and currentB accordingly.
 */
function updateABFromPointer(event) {
  const rect = abPickerCanvas.getBoundingClientRect();
  const normalizedX = clamp01((event.clientX - rect.left) / rect.width);
  const normalizedY = clamp01((event.clientY - rect.top) / rect.height);

  // Map normalized coordinates to OKLab a,b range
  const targetA = normalizedX * 2 * AB_RANGE - AB_RANGE;  // left=-0.4, right=+0.4
  const targetB = AB_RANGE - normalizedY * 2 * AB_RANGE;  // top=+0.4, bottom=-0.4

  // Clamp to working gamut by reducing chroma (preserving hue)
  [currentA, currentB] = clampToWorkingGamut(currentL, targetA, targetB);
}

/**
 * Read pointer position over the lightness slider and update
 * currentL accordingly.
 */
function updateLightnessFromPointer(event) {
  const rect = lightnessSliderCanvas.getBoundingClientRect();
  currentL = clamp01((event.clientX - rect.left) / rect.width);  // left=0, right=1
  // Clamp a,b to stay in gamut at the new lightness
  [currentA, currentB] = clampToWorkingGamut(currentL, currentA, currentB);
}

/**
 * Read pointer position over the chroma slider and update
 * currentA and currentB (keeping hue constant).
 */
function updateChromaFromPointer(event) {
  const rect = chromaSliderCanvas.getBoundingClientRect();
  const newChroma = clamp01((event.clientX - rect.left) / rect.width) * CHROMA_MAX;
  const [, currentHue] = oklabToOklch(currentA, currentB);
  const [targetA, targetB] = oklchToOklab(newChroma, currentHue);
  // Clamp chroma to gamut boundary
  [currentA, currentB] = clampToWorkingGamut(currentL, targetA, targetB);
}

/**
 * Read pointer position over the hue slider and update
 * currentA and currentB (keeping chroma constant).
 */
function updateHueFromPointer(event) {
  const rect = hueSliderCanvas.getBoundingClientRect();
  const newHue = clamp01((event.clientX - rect.left) / rect.width) * 360;
  const [currentChroma] = oklabToOklch(currentA, currentB);
  const [targetA, targetB] = oklchToOklab(currentChroma, newHue);
  // Clamp to gamut at new hue by reducing chroma if needed
  [currentA, currentB] = clampToWorkingGamut(currentL, targetA, targetB);
}

/**
 * Read pointer position over the intensity track and update
 * lightIntensity accordingly (0 to INTENSITY_MAX).
 */
function updateIntensityFromPointer(event) {
  const track = document.getElementById('intensity-track');
  const rect = track.getBoundingClientRect();
  lightIntensity = Math.max(0, Math.min(INTENSITY_MAX,
    ((event.clientX - rect.left) / rect.width) * INTENSITY_MAX
  ));
}

// ── Pointer Down: begin drag ──
abPickerCanvas.addEventListener('pointerdown', (event) => {
  isDraggingAB = true;
  abPickerCanvas.setPointerCapture(event.pointerId);
  updateABFromPointer(event);
  onABChanged();
});

lightnessSliderCanvas.addEventListener('pointerdown', (event) => {
  isDraggingLightness = true;
  lightnessSliderCanvas.setPointerCapture(event.pointerId);
  updateLightnessFromPointer(event);
  onLightnessChanged();
});

chromaSliderCanvas.addEventListener('pointerdown', (event) => {
  isDraggingChroma = true;
  chromaSliderCanvas.setPointerCapture(event.pointerId);
  updateChromaFromPointer(event);
  onChromaChanged();
});

hueSliderCanvas.addEventListener('pointerdown', (event) => {
  isDraggingHue = true;
  hueSliderCanvas.setPointerCapture(event.pointerId);
  updateHueFromPointer(event);
  onHueChanged();
});

document.getElementById('intensity-track').addEventListener('pointerdown', (event) => {
  isDraggingIntensity = true;
  event.target.setPointerCapture(event.pointerId);
  updateIntensityFromPointer(event);
  updateLightingPanel();
  renderResultABMap();
});

// ── Pointer Move: update during drag (throttled) ──
window.addEventListener('pointermove', (event) => {
  if (!isDraggingAB && !isDraggingLightness && !isDraggingChroma && !isDraggingHue && !isDraggingIntensity) return;

  // Throttle to one update per animation frame to avoid jank
  if (isAnimationFramePending) return;
  isAnimationFramePending = true;

  requestAnimationFrame(() => {
    isAnimationFramePending = false;

    if (isDraggingAB) {
      updateABFromPointer(event);
      onABChanged();
    }
    if (isDraggingLightness) {
      updateLightnessFromPointer(event);
      onLightnessChanged();
    }
    if (isDraggingChroma) {
      updateChromaFromPointer(event);
      onChromaChanged();
    }
    if (isDraggingHue) {
      updateHueFromPointer(event);
      onHueChanged();
    }
    if (isDraggingIntensity) {
      updateIntensityFromPointer(event);
      updateLightingPanel();
      renderResultABMap();
    }
  });
});

// ── Pointer Up: end drag → commit to history ──
window.addEventListener('pointerup', () => {
  const wasDragging = isDraggingAB || isDraggingLightness || isDraggingChroma || isDraggingHue;
  const wasIntensity = isDraggingIntensity;
  isDraggingAB = false;
  isDraggingLightness = false;
  isDraggingChroma = false;
  isDraggingHue = false;
  isDraggingIntensity = false;
  if (wasDragging) {
    pushColorToHistory();
  }
  if (wasIntensity) {
    scheduleSave();
  }
});


// ================================================================
//  ALWAYS ON TOP
//  Toggles the Electron window's always-on-top state via IPC.
// ================================================================

function toggleAlwaysOnTop() {
  isAlwaysOnTop = !isAlwaysOnTop;
  ipcRenderer.send('set-aot', isAlwaysOnTop);
  document.getElementById('always-on-top-button').classList.toggle('active', isAlwaysOnTop);
}


// ================================================================
//  EYEDROPPER COLOR PICKER
//  Uses the EyeDropper API to sample a color from anywhere on screen.
//  The sampled sRGB hex is converted back to OKLab to update the UI.
// ================================================================

async function pickColor() {
  try {
    const result = await new EyeDropper().open();
    const hex = result.sRGBHex; // e.g. "#ff8040"

    // Parse hex → gamma-encoded channel values [0, 1]
    const gammaR = parseInt(hex.slice(1, 3), 16) / 255;
    const gammaG = parseInt(hex.slice(3, 5), 16) / 255;
    const gammaB = parseInt(hex.slice(5, 7), 16) / 255;

    // Decode gamma using working color space transfer curves.
    // The EyeDropper API returns raw framebuffer values — these are in
    // the display's color space (the working CS) before any conversion.
    let linearR, linearG, linearB;
    if (workingCS.perChannelTRC) {
      linearR = workingCS.decode(gammaR, 0);
      linearG = workingCS.decode(gammaG, 1);
      linearB = workingCS.decode(gammaB, 2);
    } else {
      linearR = workingCS.decode(gammaR);
      linearG = workingCS.decode(gammaG);
      linearB = workingCS.decode(gammaB);
    }

    // Convert from linear working CS → linear sRGB → OKLab
    [linearR, linearG, linearB] = workingCS.toLinearSRGB(linearR, linearG, linearB);

    // Convert linear sRGB → OKLab
    const [L, a, b] = linearSRGBToOKLab(linearR, linearG, linearB);

    currentL = L;
    currentA = a;
    currentB = b;
    writePickerToEditTarget();
    pushColorToHistory();
    renderAll();
  } catch (error) {
    // User cancelled the eyedropper — no action needed
  }
}
