// ================================================================
//  AUTO-SAVE / RESTORE
//  Persists application state to localStorage with a debounced
//  save (500 ms), so rapid interactions don't cause lag.
//  Restores state on next launch before the first render.
// ================================================================

const STORAGE_KEY = 'oklab-color-picker-state';
const SAVE_HISTORY_CAP = 50; // Keep last N entries per stack when saving
let saveTimer = null;

/** Schedule a debounced save (coalesces rapid changes). */
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 500);
}

/** Serialize current state to localStorage. */
function saveState() {
  saveTimer = null;
  try {
    const capHistory = (h) => {
      const start = Math.max(0, h.entries.length - SAVE_HISTORY_CAP);
      const entries = h.entries.slice(start);
      const pos = Math.max(0, h.pos - start);
      return { entries, pos };
    };
    const state = {
      // Current picker color
      currentL, currentA, currentB,
      // Lighting Lab
      albedoL, albedoA, albedoB,
      lightL, lightA, lightB,
      lightIntensity,
      editTarget,
      isLightingOpen,
      // History (capped)
      historyMain:   capHistory(historyMain),
      historyAlbedo: capHistory(historyAlbedo),
      historyLight:  capHistory(historyLight),
      // Working color space
      iccProfileBase64,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) { /* quota exceeded or other — silently skip */ }
}

/**
 * Restore saved state from localStorage.
 * Returns true if state was restored, false otherwise.
 */
function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);

    // Picker color
    if (typeof s.currentL === 'number') currentL = s.currentL;
    if (typeof s.currentA === 'number') currentA = s.currentA;
    if (typeof s.currentB === 'number') currentB = s.currentB;

    // Lighting Lab colors
    if (typeof s.albedoL === 'number') { albedoL = s.albedoL; albedoA = s.albedoA; albedoB = s.albedoB; }
    if (typeof s.lightL  === 'number') { lightL  = s.lightL;  lightA  = s.lightA;  lightB  = s.lightB;  }
    if (typeof s.lightIntensity === 'number') lightIntensity = s.lightIntensity;
    if (typeof s.editTarget === 'string') editTarget = s.editTarget;

    // History stacks
    const loadHistory = (target, src) => {
      if (src && Array.isArray(src.entries) && src.entries.length > 0) {
        target.entries = src.entries;
        target.pos = Math.min(src.pos || 0, src.entries.length - 1);
      }
    };
    loadHistory(historyMain,   s.historyMain);
    loadHistory(historyAlbedo, s.historyAlbedo);
    loadHistory(historyLight,  s.historyLight);

    // ICC profile
    if (s.iccProfileBase64) {
      try {
        const binary = atob(s.iccProfileBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        workingCS = parseICCProfile(bytes.buffer);
        iccProfileBase64 = s.iccProfileBase64;
      } catch (_) { /* profile failed to parse — keep default CS */ }
    }

    // Lighting Lab open state
    if (s.isLightingOpen) {
      isLightingOpen = true;
      document.getElementById('lighting-panel').classList.add('open');
      document.getElementById('lighting-toggle-button').classList.add('active');
      // Restore tab selection UI directly (avoid triggering scheduleSave)
      document.getElementById('tab-albedo').classList.toggle('tab-active', editTarget === 'albedo');
      document.getElementById('tab-light').classList.toggle('tab-active', editTarget === 'light');
      document.getElementById('swatch-albedo').classList.toggle('selected', editTarget === 'albedo');
      document.getElementById('swatch-light').classList.toggle('selected', editTarget === 'light');
      syncPickerToEditTarget();
    }

    return true;
  } catch (_) { return false; }
}
