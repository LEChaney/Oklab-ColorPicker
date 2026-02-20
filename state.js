// ================================================================
//  APPLICATION STATE
// ================================================================

const { ipcRenderer } = require('electron');

/** Current OKLab color components */
let currentL = 0.7;   // Lightness: 0 (black) to 1 (white)
let currentA = 0.0;   // Green–Red axis: roughly −0.4 to +0.4
let currentB = 0.0;   // Blue–Yellow axis: roughly −0.4 to +0.4

/** Whether the window is set to always-on-top */
let isAlwaysOnTop = true;

/** Lighting Lab state */
let isLightingOpen = false;
let editTarget = 'albedo';  // 'albedo' or 'light'

// Albedo color (OKLab) — initialized to current picker color
let albedoL = 0.7, albedoA = 0.0, albedoB = 0.0;
// Light color (OKLab) — initialized to white (neutral)
let lightL = 1.0, lightA = 0.0, lightB = 0.0;
// Physical linear intensity multiplier for the light (default 1.0)
let lightIntensity = 1.0;
const INTENSITY_MAX = 10.0;

// ── Color Selection History ──
// Three independent history stacks: main picker, albedo, and light.
// Each entry is [L, a, b]. Position tracks where we are in the list.
const historyMain   = { entries: [[0.7, 0.0, 0.0]], pos: 0 };
const historyAlbedo = { entries: [[0.7, 0.0, 0.0]], pos: 0 };
const historyLight  = { entries: [[1.0, 0.0, 0.0]], pos: 0 };
const MAX_HISTORY = 200;

// ── Persistence ──
// Stores the raw ICC profile bytes so the custom working CS survives restarts.
let iccProfileBase64 = null;

/** Canvas dimensions & OKLab axis range */
const PICKER_SIZE = 300;         // Width & height of the a,b picker (px)
const AB_RANGE = 0.4;            // a,b axis extends from -0.4 to +0.4
const SLIDER_HEIGHT = 28;        // Height of each slider (px)
const CHROMA_MAX = 0.4;          // Maximum chroma value for the slider


// ================================================================
//  CANVAS SETUP
//  If the browser supports Display P3 canvases (wide gamut), we use
//  that color space so colors outside sRGB can be shown accurately
//  on a wide-gamut monitor. Otherwise we fall back to sRGB.
// ================================================================

const abPickerCanvas = document.getElementById('ab-picker');
const lightnessSliderCanvas = document.getElementById('lightness-slider');
const chromaSliderCanvas = document.getElementById('chroma-slider');
const hueSliderCanvas = document.getElementById('hue-slider');

// Detect whether the display supports the P3 wide color gamut.
// If it does, we use a 'display-p3' canvas so colors outside sRGB render accurately.
const isDisplayP3Supported = window.matchMedia('(color-gamut: p3)').matches;
const canvasColorSpace = isDisplayP3Supported ? 'display-p3' : 'srgb';
const canvasOptions = { colorSpace: canvasColorSpace };
const abPickerContext = abPickerCanvas.getContext('2d', canvasOptions);
const lightnessContext = lightnessSliderCanvas.getContext('2d', canvasOptions);
const chromaContext = chromaSliderCanvas.getContext('2d', canvasOptions);
const hueContext = hueSliderCanvas.getContext('2d', canvasOptions);

// Result mini a,b map canvas (150×150)
const RESULT_MAP_SIZE = 150;
const resultABCanvas = document.getElementById('result-ab-map');
const resultABContext = resultABCanvas.getContext('2d', canvasOptions);

/** Active working color space (default: P3 if supported, else sRGB) */
let workingCS = isDisplayP3Supported ? createP3WorkingCS() : createSRGBWorkingCS();
