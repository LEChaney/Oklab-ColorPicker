// ================================================================
//  COLOR MATH
//  Conversion functions between OKLab, linear sRGB, and Display P3.
//  All use linear-light (pre-gamma) values unless noted otherwise.
//  Matrix coefficients from https://bottosson.github.io/posts/oklab/
// ================================================================

/**
 * Convert OKLab (L, a, b) → linear sRGB (r, g, b).
 *
 * Steps:
 *   1. OKLab → LMS (cone response, cubed-root space)
 *   2. Undo cube root to get linear LMS
 *   3. Linear LMS → linear sRGB via 3×3 matrix
 */
function oklabToLinearSRGB(L, a, b) {
  // Step 1: OKLab → LMS (cube-root encoded)
  const lCubeRoot = L + 0.3963377774 * a + 0.2158037573 * b;
  const mCubeRoot = L - 0.1055613458 * a - 0.0638541728 * b;
  const sCubeRoot = L - 0.0894841775 * a - 1.2914855480 * b;

  // Step 2: Undo the cube root → linear LMS
  const lLinear = lCubeRoot ** 3;
  const mLinear = mCubeRoot ** 3;
  const sLinear = sCubeRoot ** 3;

  // Step 3: LMS → linear sRGB (3×3 matrix multiply)
  const red   =  4.0767416621 * lLinear - 3.3077115913 * mLinear + 0.2309699292 * sLinear;
  const green = -1.2684380046 * lLinear + 2.6097574011 * mLinear - 0.3413193965 * sLinear;
  const blue  = -0.0041960863 * lLinear - 0.7034186147 * mLinear + 1.7076147010 * sLinear;

  return [red, green, blue];
}

/**
 * Convert linear sRGB (r, g, b) → linear Display P3 (r, g, b).
 *
 * This is a direct 3×3 matrix transform between the two RGB spaces.
 * Both share the same whitepoint (D65) but have different primaries.
 */
function linearSRGBToLinearP3(r, g, b) {
  return [
    0.8224621209 * r + 0.1775378791 * g,
    0.0331941826 * r + 0.9668058174 * g,
    0.0170826307 * r + 0.0723974407 * g + 0.9105199286 * b
  ];
}

/**
 * Convert linear Display P3 (r, g, b) → linear sRGB (r, g, b).
 *
 * This is the inverse of linearSRGBToLinearP3.
 * Used when interpreting eyedropper-picked colors as display-native P3.
 */
function linearP3ToLinearSRGB(r, g, b) {
  return [
     1.2249401762 * r - 0.2249401762 * g,
    -0.0420569549 * r + 1.0420569549 * g,
    -0.0196375546 * r - 0.0786360236 * g + 1.0982735782 * b
  ];
}

// ================================================================
//  OKLab ↔ OKLCH CONVERSION
//  OKLCH is the cylindrical (polar) form of OKLab:
//    C = chroma = sqrt(a² + b²)
//    h = hue    = atan2(b, a)  (in degrees, 0–360)
// ================================================================

/**
 * Convert OKLab (a, b) → OKLCH (C, h).
 * Returns [chroma, hueDegrees].
 */
function oklabToOklch(a, b) {
  const chroma = Math.sqrt(a * a + b * b);
  let hueDegrees = Math.atan2(b, a) * (180 / Math.PI);
  if (hueDegrees < 0) hueDegrees += 360;
  return [chroma, hueDegrees];
}

/**
 * Convert OKLCH (C, h) → OKLab (a, b).
 * hue is in degrees.
 */
function oklchToOklab(chroma, hueDegrees) {
  const hueRadians = hueDegrees * (Math.PI / 180);
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  return [a, b];
}


/**
 * Convert linear sRGB (r, g, b) → OKLab (L, a, b).
 *
 * Steps:
 *   1. Linear sRGB → linear LMS via 3×3 matrix
 *   2. Cube root of LMS (perceptual compression)
 *   3. Cube-root LMS → OKLab via 3×3 matrix
 */
function linearSRGBToOKLab(r, g, b) {
  // Step 1: Linear sRGB → linear LMS
  const lLinear = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const mLinear = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const sLinear = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  // Step 2: Cube root (perceptual non-linearity)
  const lRoot = Math.cbrt(lLinear);
  const mRoot = Math.cbrt(mLinear);
  const sRoot = Math.cbrt(sLinear);

  // Step 3: Cube-root LMS → OKLab
  const L =  0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot;
  const a =  1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot;
  const ob = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot;

  return [L, a, ob];
}


// ================================================================
//  GAMMA / UTILITY FUNCTIONS
// ================================================================

/**
 * Apply sRGB gamma encoding (linear → gamma-encoded).
 * Input is clamped to [0, 1] before encoding.
 * The sRGB transfer function has a linear segment near zero
 * and a power curve for the rest.
 */
function linearToGamma(linearValue) {
  const clamped = Math.max(0, Math.min(1, linearValue));
  if (clamped >= 0.0031308) {
    return 1.055 * (clamped ** (1 / 2.4)) - 0.055;
  }
  return 12.92 * clamped;
}

/**
 * Remove sRGB gamma encoding (gamma-encoded → linear).
 * Inverse of linearToGamma().
 */
function gammaToLinear(gammaValue) {
  if (gammaValue >= 0.04045) {
    return ((gammaValue + 0.055) / 1.055) ** 2.4;
  }
  return gammaValue / 12.92;
}

/** Clamp a value to the [0, 1] range. */
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Check whether (r, g, b) values fall within the [0, 1] gamut.
 * A small tolerance (±0.0005) is used to avoid false negatives
 * from floating-point rounding in the matrix conversions.
 */
function isInGamut(r, g, b) {
  const TOLERANCE = 5e-4;
  return (
    r >= -TOLERANCE && r <= 1 + TOLERANCE &&
    g >= -TOLERANCE && g <= 1 + TOLERANCE &&
    b >= -TOLERANCE && b <= 1 + TOLERANCE
  );
}

/**
 * Convert gamma-encoded (r, g, b) in [0,1] to a hex color string.
 * Example: (1, 0.5, 0) → "#ff8000"
 */
function rgbToHex(r, g, b) {
  const toByteHex = (value) =>
    Math.round(clamp01(value) * 255)
      .toString(16)
      .padStart(2, '0');
  return '#' + toByteHex(r) + toByteHex(g) + toByteHex(b);
}

/** Convert a linear channel value to a 0–255 byte for ImageData. */
function linearToColorByte(linearValue) {
  return Math.round(linearToGamma(linearValue) * 255);
}

/**
 * Parse a hex string like "#ff8800" or "ff8800" to [r, g, b]
 * where each channel is gamma-encoded 0–1. Returns null on failure.
 */
function parseHex(str) {
  str = str.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(str)) return null;
  const r = parseInt(str.slice(0, 2), 16) / 255;
  const g = parseInt(str.slice(2, 4), 16) / 255;
  const b = parseInt(str.slice(4, 6), 16) / 255;
  return [r, g, b];
}


// ================================================================
//  GAMUT HELPERS
//  Functions for checking and clamping colors to the working gamut.
//  Uses the active working color space for gamut detection.
// ================================================================

/**
 * Check whether an OKLab color falls within the working color space gamut.
 */
function isInWorkingGamut(L, a, b) {
  const [linearR, linearG, linearB] = oklabToLinearSRGB(L, a, b);
  const [wr, wg, wb] = workingCS.fromLinearSRGB(linearR, linearG, linearB);
  return isInGamut(wr, wg, wb);
}

/**
 * Binary-search for the maximum chroma that keeps the color in the
 * working gamut at a given lightness and hue angle.
 * @returns {number} Maximum in-gamut chroma
 */
function findMaxInGamutChroma(L, hueDegrees, maxSearch = CHROMA_MAX) {
  const [aHi, bHi] = oklchToOklab(maxSearch, hueDegrees);
  if (isInWorkingGamut(L, aHi, bHi)) return maxSearch;
  let lo = 0, hi = maxSearch;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const [a, b] = oklchToOklab(mid, hueDegrees);
    if (isInWorkingGamut(L, a, b)) { lo = mid; } else { hi = mid; }
  }
  return lo;
}

/**
 * Clamp an OKLab color to the working gamut by reducing chroma
 * while preserving lightness and hue.
 * @returns {[number, number]} Clamped [a, b] values
 */
function clampToWorkingGamut(L, a, b) {
  if (isInWorkingGamut(L, a, b)) return [a, b];
  const [chroma, hue] = oklabToOklch(a, b);
  const maxChroma = findMaxInGamutChroma(L, hue, chroma);
  return oklchToOklab(maxChroma, hue);
}
