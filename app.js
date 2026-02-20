// ================================================================
//  COPY TO CLIPBOARD
//  Copies the text content of a given element to the clipboard
//  and briefly shows a checkmark on the button for feedback.
// ================================================================

async function copyToClipboard(button, elementId) {
  const text = document.getElementById(elementId).textContent;
  await navigator.clipboard.writeText(text);

  // Show brief "copied" feedback
  const originalText = button.textContent;
  button.textContent = '✓';
  setTimeout(() => {
    button.textContent = originalText;
  }, 700);
}


// ================================================================
//  INITIALIZATION
// ================================================================

// Apply default states to UI
ipcRenderer.send('set-aot', true);
document.getElementById('always-on-top-button').classList.add('active');

// Restore saved state (colors, history, ICC profile, lighting panel)
restoreState();
updateWorkingCSDisplay();

renderAll();


// ================================================================
//  COLOR SELECTION HISTORY
//  Independent history stacks for main picker, albedo, and light.
//  Ctrl+Z navigates backward, Ctrl+Shift+Z forward.
//  New selections always append to the top; forward history is
//  preserved (this is navigation, not undo/redo).
// ================================================================

/**
 * Get the active history stack based on the current mode.
 */
function getActiveHistory() {
  if (!isLightingOpen) return historyMain;
  return editTarget === 'albedo' ? historyAlbedo : historyLight;
}

/**
 * Push the current color onto the active history stack.
 * Moves position to the new top entry.
 */
function pushColorToHistory() {
  const h = getActiveHistory();
  const last = h.entries[h.entries.length - 1];
  // Skip duplicate if color hasn't actually changed
  if (last &&
      Math.abs(last[0] - currentL) < 1e-6 &&
      Math.abs(last[1] - currentA) < 1e-6 &&
      Math.abs(last[2] - currentB) < 1e-6) {
    return;
  }
  h.entries.push([currentL, currentA, currentB]);
  if (h.entries.length > MAX_HISTORY) h.entries.shift();
  h.pos = h.entries.length - 1;
  scheduleSave();
}

/**
 * Navigate to a history entry and apply its color.
 */
function applyHistoryEntry(h) {
  const [L, a, b] = h.entries[h.pos];
  currentL = L;
  currentA = a;
  currentB = b;
  writePickerToEditTarget();
  renderAll();
  scheduleSave();
}

/**
 * Step backward in the active history (Ctrl+Z).
 */
function historyBack() {
  const h = getActiveHistory();
  if (h.pos > 0) {
    h.pos--;
    applyHistoryEntry(h);
  }
}

/**
 * Step forward in the active history (Ctrl+Shift+Z).
 */
function historyForward() {
  const h = getActiveHistory();
  if (h.pos < h.entries.length - 1) {
    h.pos++;
    applyHistoryEntry(h);
  }
}

// ── Keyboard shortcuts ──
// (Ctrl+Z / Ctrl+Shift+Z are intercepted only when NOT editing a field)
window.addEventListener('keydown', (event) => {
  // Don't intercept undo/redo while user is typing in an editable field
  const ae = document.activeElement;
  if (ae && ae.getAttribute('contenteditable') === 'true') return;

  if (event.key === 'z' && event.ctrlKey && !event.shiftKey) {
    event.preventDefault();
    historyBack();
  } else if (event.key === 'Z' && event.ctrlKey && event.shiftKey) {
    event.preventDefault();
    historyForward();
  }
});


// ================================================================
//  EDITABLE FIELD HANDLERS
//  All numeric/hex fields are contenteditable. On Enter or blur,
//  the value is parsed and applied to the picker state.
// ================================================================

/**
 * Commit a new OKLab color from an editable field and re-render.
 * Skips the field that was just edited so it doesn't get overwritten.
 */
function commitEditedColor(newL, newA, newB) {
  currentL = clamp01(newL);
  currentA = newA;
  currentB = newB;
  // Save to edit target BEFORE renderAll, so syncPickerToEditTarget
  // reads back the new values instead of overwriting them.
  writePickerToEditTarget();
  renderABPickerColors();
  renderAllSliderColors();
  drawABPicker();
  drawAllSliders();
  updateInfoPanel();
  updateLightingPanel();
  pushColorToHistory();
  scheduleSave();
}

/**
 * Generic handler for committing an editable field on Enter key
 * (and preventing the newline) or on blur.
 */
function setupEditableCommit(elementId, commitFn) {
  const el = document.getElementById(elementId);
  if (!el) return;

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.blur(); // blur triggers the commit via the blur handler
    }
    if (e.key === 'Escape') {
      // Revert: clear user text so blur handler's parse fails (no-op)
      el.textContent = '';
      el.blur();
    }
  });

  el.addEventListener('blur', () => {
    commitFn(el);
  });
}

// ── OKLab L, a, b fields ──
setupEditableCommit('val-L', (el) => {
  const v = parseFloat(el.textContent);
  if (!isNaN(v)) commitEditedColor(v, currentA, currentB);
});
setupEditableCommit('val-a', (el) => {
  const v = parseFloat(el.textContent);
  if (!isNaN(v)) commitEditedColor(currentL, v, currentB);
});
setupEditableCommit('val-b', (el) => {
  const v = parseFloat(el.textContent);
  if (!isNaN(v)) commitEditedColor(currentL, currentA, v);
});

// ── OKLCH C, h fields ──
setupEditableCommit('val-C', (el) => {
  const c = parseFloat(el.textContent);
  if (isNaN(c)) return;
  // Use current hue
  const [, currentHue] = oklabToOklch(currentA, currentB);
  const [newA, newB] = oklchToOklab(c, currentHue);
  commitEditedColor(currentL, newA, newB);
});
setupEditableCommit('val-h', (el) => {
  const h = parseFloat(el.textContent);
  if (isNaN(h)) return;
  // Use current chroma
  const [currentChroma] = oklabToOklch(currentA, currentB);
  const [newA, newB] = oklchToOklab(currentChroma, h);
  commitEditedColor(currentL, newA, newB);
});

// ── sRGB hex field ──
setupEditableCommit('srgb-hex', (el) => {
  const rgb = parseHex(el.textContent);
  if (!rgb) return;
  const linR = gammaToLinear(rgb[0]);
  const linG = gammaToLinear(rgb[1]);
  const linB = gammaToLinear(rgb[2]);
  const [L, a, b] = linearSRGBToOKLab(linR, linG, linB);
  commitEditedColor(L, a, b);
});

// ── Display P3 hex field ──
setupEditableCommit('display-p3-hex', (el) => {
  const rgb = parseHex(el.textContent);
  if (!rgb) return;
  // Decode gamma, convert P3→linear sRGB, then to OKLab
  const linP3R = gammaToLinear(rgb[0]);
  const linP3G = gammaToLinear(rgb[1]);
  const linP3B = gammaToLinear(rgb[2]);
  const [linR, linG, linB] = linearP3ToLinearSRGB(linP3R, linP3G, linP3B);
  const [L, a, b] = linearSRGBToOKLab(linR, linG, linB);
  commitEditedColor(L, a, b);
});

// ── Working CS hex field ──
setupEditableCommit('working-hex', (el) => {
  const rgb = parseHex(el.textContent);
  if (!rgb) return;
  // Decode through working CS TRC, then convert to linear sRGB
  let linR, linG, linB;
  if (workingCS.perChannelTRC) {
    linR = workingCS.decode(rgb[0], 0);
    linG = workingCS.decode(rgb[1], 1);
    linB = workingCS.decode(rgb[2], 2);
  } else {
    linR = workingCS.decode(rgb[0]);
    linG = workingCS.decode(rgb[1]);
    linB = workingCS.decode(rgb[2]);
  }
  const [sR, sG, sB] = workingCS.toLinearSRGB(linR, linG, linB);
  const [L, a, b] = linearSRGBToOKLab(sR, sG, sB);
  commitEditedColor(L, a, b);
});

// ── CSS oklab() value field ──
setupEditableCommit('css-oklab-value', (el) => {
  const text = el.textContent.trim();
  // Match oklab(L a b) with optional commas
  const match = text.match(/oklab\(\s*([\d.eE+-]+)\s+[,]?\s*([\d.eE+-]+)\s+[,]?\s*([\d.eE+-]+)\s*\)/i);
  if (!match) return;
  const L = parseFloat(match[1]);
  const a = parseFloat(match[2]);
  const b = parseFloat(match[3]);
  if (isNaN(L) || isNaN(a) || isNaN(b)) return;
  commitEditedColor(L, a, b);
});

// ── Intensity value field ──
setupEditableCommit('intensity-value', (el) => {
  const v = parseFloat(el.textContent);
  if (isNaN(v) || v < 0) return;
  lightIntensity = Math.min(v, INTENSITY_MAX);
  updateLightingPanel();
  scheduleSave();
});
