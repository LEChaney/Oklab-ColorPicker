// ================================================================
//  RENDERING: a,b PICKER
//  Draws a 300×300 image where each pixel represents an OKLab color
//  at the current lightness (L). The x-axis maps to 'a' (green→red),
//  and the y-axis maps to 'b' (blue→yellow, top = +b).
// ================================================================

/** Cached ImageData for the a,b picker background */
let abPickerImageData = null;

/**
 * Compute the pixel colors for every (a, b) combination at the
 * current lightness value and store them in abPickerImageData.
 */
function renderABPickerColors() {
  abPickerImageData = abPickerContext.createImageData(PICKER_SIZE, PICKER_SIZE);
  const pixels = abPickerImageData.data;
  const step = (2 * AB_RANGE) / (PICKER_SIZE - 1);

  for (let y = 0; y < PICKER_SIZE; y++) {
    // Top of canvas = +AB_RANGE (positive b), bottom = -AB_RANGE
    const bValue = AB_RANGE - y * step;

    for (let x = 0; x < PICKER_SIZE; x++) {
      // Left of canvas = -AB_RANGE (negative a), right = +AB_RANGE
      const aValue = -AB_RANGE + x * step;

      // Convert this OKLab color to linear sRGB
      const [linearR, linearG, linearB] = oklabToLinearSRGB(currentL, aValue, bValue);

      // Calculate the pixel offset in the ImageData buffer (4 bytes per pixel: RGBA)
      const pixelIndex = (y * PICKER_SIZE + x) * 4;

      let byteR, byteG, byteB, inGamut;
      inGamut = isInWorkingGamut(currentL, aValue, bValue);
      if (isDisplayP3Supported) {
        const [p3R, p3G, p3B] = linearSRGBToLinearP3(linearR, linearG, linearB);
        byteR = linearToColorByte(p3R);
        byteG = linearToColorByte(p3G);
        byteB = linearToColorByte(p3B);
      } else {
        byteR = linearToColorByte(linearR);
        byteG = linearToColorByte(linearG);
        byteB = linearToColorByte(linearB);
      }

      // Darken out-of-gamut pixels with diagonal stripe pattern
      if (!inGamut) {
        byteR = Math.round(byteR * 0.15);
        byteG = Math.round(byteG * 0.15);
        byteB = Math.round(byteB * 0.15);
        if ((x + y) % 6 < 1) {
          byteR = Math.min(255, byteR + 35);
          byteG = Math.min(255, byteG + 35);
          byteB = Math.min(255, byteB + 35);
        }
      }

      pixels[pixelIndex]     = byteR;
      pixels[pixelIndex + 1] = byteG;
      pixels[pixelIndex + 2] = byteB;
      pixels[pixelIndex + 3] = 255; // Fully opaque
    }
  }
}

/**
 * Draw the a,b picker: blit the cached color image, then draw
 * a crosshair circle at the currently selected (a, b) position.
 */
function drawABPicker() {
  if (!abPickerImageData) return;

  // Draw the pre-computed color field
  abPickerContext.putImageData(abPickerImageData, 0, 0);

  // Convert current (a, b) values to canvas pixel coordinates
  const cursorX = ((currentA + AB_RANGE) / (2 * AB_RANGE)) * (PICKER_SIZE - 1);
  const cursorY = ((AB_RANGE - currentB) / (2 * AB_RANGE)) * (PICKER_SIZE - 1);

  // Use contrasting colors for the crosshair depending on lightness
  const isDark = currentL > 0.5;

  // Inner ring (strong contrast)
  abPickerContext.strokeStyle = isDark ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.85)';
  abPickerContext.lineWidth = 2.5;
  abPickerContext.beginPath();
  abPickerContext.arc(cursorX, cursorY, 7, 0, 2 * Math.PI);
  abPickerContext.stroke();

  // Outer ring (subtle halo for visibility)
  abPickerContext.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)';
  abPickerContext.lineWidth = 1;
  abPickerContext.beginPath();
  abPickerContext.arc(cursorX, cursorY, 9, 0, 2 * Math.PI);
  abPickerContext.stroke();
}


// ================================================================
//  RENDERING: LIGHTNESS SLIDER
//  A horizontal bar where each pixel column represents a different
//  lightness (L) value at the current (a, b). Left = 0, right = 1.
// ================================================================

/** Cached ImageData for the lightness slider background */
let lightnessImageData = null;

/**
 * Compute the pixel colors for the lightness slider at the
 * current (a, b) values.
 */
function renderLightnessSliderColors() {
  lightnessImageData = lightnessContext.createImageData(PICKER_SIZE, SLIDER_HEIGHT);
  const pixels = lightnessImageData.data;

  for (let x = 0; x < PICKER_SIZE; x++) {
    // Map x position to lightness value [0, 1]
    const lightnessValue = x / (PICKER_SIZE - 1);

    // Convert this OKLab color to linear sRGB
    const [linearR, linearG, linearB] = oklabToLinearSRGB(lightnessValue, currentA, currentB);

    // Determine the display byte values and check gamut
    let byteR, byteG, byteB, inGamut;
    inGamut = isInWorkingGamut(lightnessValue, currentA, currentB);
    if (isDisplayP3Supported) {
      const [p3R, p3G, p3B] = linearSRGBToLinearP3(linearR, linearG, linearB);
      byteR = linearToColorByte(p3R);
      byteG = linearToColorByte(p3G);
      byteB = linearToColorByte(p3B);
    } else {
      byteR = linearToColorByte(linearR);
      byteG = linearToColorByte(linearG);
      byteB = linearToColorByte(linearB);
    }

    // Darken out-of-gamut columns
    if (!inGamut) {
      byteR = Math.round(byteR * 0.15);
      byteG = Math.round(byteG * 0.15);
      byteB = Math.round(byteB * 0.15);
    }

    // Fill column (with diagonal stripe for out-of-gamut)
    for (let y = 0; y < SLIDER_HEIGHT; y++) {
      const pixelIndex = (y * PICKER_SIZE + x) * 4;
      if (!inGamut && (x + y) % 6 < 1) {
        pixels[pixelIndex]     = Math.min(255, byteR + 35);
        pixels[pixelIndex + 1] = Math.min(255, byteG + 35);
        pixels[pixelIndex + 2] = Math.min(255, byteB + 35);
      } else {
        pixels[pixelIndex]     = byteR;
        pixels[pixelIndex + 1] = byteG;
        pixels[pixelIndex + 2] = byteB;
      }
      pixels[pixelIndex + 3] = 255;
    }
  }
}

/**
 * Draw the lightness slider: blit the cached gradient, then draw
 * a vertical line indicator at the currently selected L value.
 */
function drawLightnessSlider() {
  if (!lightnessImageData) return;

  // Draw the pre-computed gradient
  lightnessContext.putImageData(lightnessImageData, 0, 0);

  // Convert current L to a pixel x-coordinate
  const indicatorX = currentL * (PICKER_SIZE - 1);
  const isDark = currentL > 0.5;

  // Main indicator line
  lightnessContext.strokeStyle = isDark ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.85)';
  lightnessContext.lineWidth = 3;
  lightnessContext.beginPath();
  lightnessContext.moveTo(indicatorX, 0);
  lightnessContext.lineTo(indicatorX, SLIDER_HEIGHT);
  lightnessContext.stroke();

  // Flanking lines for contrast
  lightnessContext.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)';
  lightnessContext.lineWidth = 1;
  lightnessContext.beginPath();
  lightnessContext.moveTo(indicatorX - 2, 0);
  lightnessContext.lineTo(indicatorX - 2, SLIDER_HEIGHT);
  lightnessContext.moveTo(indicatorX + 2, 0);
  lightnessContext.lineTo(indicatorX + 2, SLIDER_HEIGHT);
  lightnessContext.stroke();
}


// ================================================================
//  RENDERING: CHROMA SLIDER
//  Horizontal bar where each column shows the color at a different
//  chroma (C) value, keeping the current L and hue constant.
//  Left = 0, right = CHROMA_MAX.
// ================================================================

/** Cached ImageData for the chroma slider background */
let chromaImageData = null;

/**
 * Compute the pixel colors for the chroma slider at the
 * current lightness and hue.
 */
function renderChromaSliderColors() {
  chromaImageData = chromaContext.createImageData(PICKER_SIZE, SLIDER_HEIGHT);
  const pixels = chromaImageData.data;
  const [, currentHue] = oklabToOklch(currentA, currentB);

  for (let x = 0; x < PICKER_SIZE; x++) {
    // Map x position to chroma value [0, CHROMA_MAX]
    const chromaValue = (x / (PICKER_SIZE - 1)) * CHROMA_MAX;

    // Convert OKLCH → OKLab → linear sRGB
    const [a, b] = oklchToOklab(chromaValue, currentHue);
    const [linearR, linearG, linearB] = oklabToLinearSRGB(currentL, a, b);

    // Determine the display byte values and check gamut
    let byteR, byteG, byteB, inGamut;
    inGamut = isInWorkingGamut(currentL, a, b);
    if (isDisplayP3Supported) {
      const [p3R, p3G, p3B] = linearSRGBToLinearP3(linearR, linearG, linearB);
      byteR = linearToColorByte(p3R);
      byteG = linearToColorByte(p3G);
      byteB = linearToColorByte(p3B);
    } else {
      byteR = linearToColorByte(linearR);
      byteG = linearToColorByte(linearG);
      byteB = linearToColorByte(linearB);
    }

    // Darken out-of-gamut columns
    if (!inGamut) {
      byteR = Math.round(byteR * 0.15);
      byteG = Math.round(byteG * 0.15);
      byteB = Math.round(byteB * 0.15);
    }

    // Fill column (with diagonal stripe for out-of-gamut)
    for (let y = 0; y < SLIDER_HEIGHT; y++) {
      const pixelIndex = (y * PICKER_SIZE + x) * 4;
      if (!inGamut && (x + y) % 6 < 1) {
        pixels[pixelIndex]     = Math.min(255, byteR + 35);
        pixels[pixelIndex + 1] = Math.min(255, byteG + 35);
        pixels[pixelIndex + 2] = Math.min(255, byteB + 35);
      } else {
        pixels[pixelIndex]     = byteR;
        pixels[pixelIndex + 1] = byteG;
        pixels[pixelIndex + 2] = byteB;
      }
      pixels[pixelIndex + 3] = 255;
    }
  }
}

/**
 * Draw the chroma slider: blit the cached gradient, then draw
 * a vertical line indicator at the currently selected chroma.
 */
function drawChromaSlider() {
  if (!chromaImageData) return;

  chromaContext.putImageData(chromaImageData, 0, 0);

  // Compute current chroma and map to pixel position
  const [currentChroma] = oklabToOklch(currentA, currentB);
  const indicatorX = (currentChroma / CHROMA_MAX) * (PICKER_SIZE - 1);
  const isDark = currentL > 0.5;

  // Main indicator line
  chromaContext.strokeStyle = isDark ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.85)';
  chromaContext.lineWidth = 3;
  chromaContext.beginPath();
  chromaContext.moveTo(indicatorX, 0);
  chromaContext.lineTo(indicatorX, SLIDER_HEIGHT);
  chromaContext.stroke();

  // Flanking lines for contrast
  chromaContext.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)';
  chromaContext.lineWidth = 1;
  chromaContext.beginPath();
  chromaContext.moveTo(indicatorX - 2, 0);
  chromaContext.lineTo(indicatorX - 2, SLIDER_HEIGHT);
  chromaContext.moveTo(indicatorX + 2, 0);
  chromaContext.lineTo(indicatorX + 2, SLIDER_HEIGHT);
  chromaContext.stroke();
}


// ================================================================
//  RENDERING: HUE SLIDER
//  Horizontal bar where each column shows the color at a different
//  hue angle, keeping the current L and chroma constant.
//  Left = 0°, right = 360°.
// ================================================================

/** Cached ImageData for the hue slider background */
let hueImageData = null;

/**
 * Compute the pixel colors for the hue slider at the
 * current lightness and chroma.
 */
function renderHueSliderColors() {
  hueImageData = hueContext.createImageData(PICKER_SIZE, SLIDER_HEIGHT);
  const pixels = hueImageData.data;
  const [currentChroma] = oklabToOklch(currentA, currentB);

  for (let x = 0; x < PICKER_SIZE; x++) {
    // Map x position to hue value [0, 360)
    const hueValue = (x / (PICKER_SIZE - 1)) * 360;

    // Convert OKLCH → OKLab → linear sRGB
    const [a, b] = oklchToOklab(currentChroma, hueValue);
    const [linearR, linearG, linearB] = oklabToLinearSRGB(currentL, a, b);

    // Determine the display byte values and check gamut
    let byteR, byteG, byteB, inGamut;
    inGamut = isInWorkingGamut(currentL, a, b);
    if (isDisplayP3Supported) {
      const [p3R, p3G, p3B] = linearSRGBToLinearP3(linearR, linearG, linearB);
      byteR = linearToColorByte(p3R);
      byteG = linearToColorByte(p3G);
      byteB = linearToColorByte(p3B);
    } else {
      byteR = linearToColorByte(linearR);
      byteG = linearToColorByte(linearG);
      byteB = linearToColorByte(linearB);
    }

    // Darken out-of-gamut columns
    if (!inGamut) {
      byteR = Math.round(byteR * 0.15);
      byteG = Math.round(byteG * 0.15);
      byteB = Math.round(byteB * 0.15);
    }

    // Fill column (with diagonal stripe for out-of-gamut)
    for (let y = 0; y < SLIDER_HEIGHT; y++) {
      const pixelIndex = (y * PICKER_SIZE + x) * 4;
      if (!inGamut && (x + y) % 6 < 1) {
        pixels[pixelIndex]     = Math.min(255, byteR + 35);
        pixels[pixelIndex + 1] = Math.min(255, byteG + 35);
        pixels[pixelIndex + 2] = Math.min(255, byteB + 35);
      } else {
        pixels[pixelIndex]     = byteR;
        pixels[pixelIndex + 1] = byteG;
        pixels[pixelIndex + 2] = byteB;
      }
      pixels[pixelIndex + 3] = 255;
    }
  }
}

/**
 * Draw the hue slider: blit the cached gradient, then draw
 * a vertical line indicator at the currently selected hue.
 */
function drawHueSlider() {
  if (!hueImageData) return;

  hueContext.putImageData(hueImageData, 0, 0);

  // Compute current hue and map to pixel position
  const [, currentHue] = oklabToOklch(currentA, currentB);
  const indicatorX = (currentHue / 360) * (PICKER_SIZE - 1);
  const isDark = currentL > 0.5;

  // Main indicator line
  hueContext.strokeStyle = isDark ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.85)';
  hueContext.lineWidth = 3;
  hueContext.beginPath();
  hueContext.moveTo(indicatorX, 0);
  hueContext.lineTo(indicatorX, SLIDER_HEIGHT);
  hueContext.stroke();

  // Flanking lines for contrast
  hueContext.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)';
  hueContext.lineWidth = 1;
  hueContext.beginPath();
  hueContext.moveTo(indicatorX - 2, 0);
  hueContext.lineTo(indicatorX - 2, SLIDER_HEIGHT);
  hueContext.moveTo(indicatorX + 2, 0);
  hueContext.lineTo(indicatorX + 2, SLIDER_HEIGHT);
  hueContext.stroke();
}


// ================================================================
//  INFO PANEL
//  Updates the color preview swatch, OKLab/OKLCH readout, hex codes,
//  and gamut indicators.
// ================================================================

function updateInfoPanel() {
  // Convert current OKLab → linear sRGB
  const [linearR, linearG, linearB] = oklabToLinearSRGB(currentL, currentA, currentB);

  // Check sRGB gamut and compute hex
  const srgbInGamut = isInGamut(linearR, linearG, linearB);
  const srgbHex = rgbToHex(
    linearToGamma(linearR),
    linearToGamma(linearG),
    linearToGamma(linearB)
  );

  // Convert to Display P3, check gamut, compute hex
  const [p3R, p3G, p3B] = linearSRGBToLinearP3(linearR, linearG, linearB);
  const p3InGamut = isInGamut(p3R, p3G, p3B);
  const p3Hex = rgbToHex(
    linearToGamma(p3R),
    linearToGamma(p3G),
    linearToGamma(p3B)
  );

  // Convert to working CS, check gamut, compute hex
  const [wcR, wcG, wcB] = workingCS.fromLinearSRGB(linearR, linearG, linearB);
  const workingInGamut = isInGamut(wcR, wcG, wcB);
  let workingHex;
  if (workingCS.perChannelTRC) {
    workingHex = rgbToHex(
      workingCS.encode(wcR, 0),
      workingCS.encode(wcG, 1),
      workingCS.encode(wcB, 2)
    );
  } else {
    workingHex = rgbToHex(
      workingCS.encode(wcR),
      workingCS.encode(wcG),
      workingCS.encode(wcB)
    );
  }

  // Compute OKLCH values for display
  const [currentChroma, currentHue] = oklabToOklch(currentA, currentB);

  // Update the OKLab + OKLCH numeric readout (skip focused fields)
  const active = document.activeElement;
  if (active !== document.getElementById('val-L'))
    document.getElementById('val-L').textContent = currentL.toFixed(3);
  if (active !== document.getElementById('val-a'))
    document.getElementById('val-a').textContent = currentA.toFixed(3);
  if (active !== document.getElementById('val-b'))
    document.getElementById('val-b').textContent = currentB.toFixed(3);
  if (active !== document.getElementById('val-C'))
    document.getElementById('val-C').textContent = currentChroma.toFixed(3);
  if (active !== document.getElementById('val-h'))
    document.getElementById('val-h').textContent = currentHue.toFixed(1);

  // Update the preview swatch using native CSS oklab() for correct rendering
  document.getElementById('color-preview').style.background =
    `oklab(${currentL} ${currentA} ${currentB})`;

  // Update sRGB hex and gamut indicator (skip focused fields)
  if (active !== document.getElementById('srgb-hex'))
    document.getElementById('srgb-hex').textContent = srgbHex;
  document.getElementById('srgb-gamut-indicator').innerHTML = srgbInGamut
    ? '<span class="in-gamut" title="In sRGB gamut">✓</span>'
    : '<span class="out-of-gamut" title="Out of sRGB gamut">✗ out of gamut</span>';

  // Update Display P3 hex and gamut indicator
  if (active !== document.getElementById('display-p3-hex'))
    document.getElementById('display-p3-hex').textContent = p3Hex;
  document.getElementById('display-p3-gamut-indicator').innerHTML = p3InGamut
    ? '<span class="in-gamut" title="In Display P3 gamut">✓</span>'
    : '<span class="out-of-gamut" title="Out of Display P3 gamut">✗ out of gamut</span>';

  // Update working CS hex and gamut indicator (only shown for custom profiles)
  const isCustomCS = workingCS.name !== 'Display P3' && workingCS.name !== 'sRGB';
  document.getElementById('working-cs-row').style.display = isCustomCS ? '' : 'none';
  if (isCustomCS) {
    if (active !== document.getElementById('working-hex'))
      document.getElementById('working-hex').textContent = workingHex;
    document.getElementById('working-gamut-indicator').innerHTML = workingInGamut
      ? '<span class="in-gamut" title="In ' + workingCS.name + ' gamut">✓</span>'
      : '<span class="out-of-gamut" title="Out of ' + workingCS.name + ' gamut">✗ out of gamut</span>';
    document.getElementById('working-cs-hex-label').textContent = workingCS.name.length > 10
      ? workingCS.name.slice(0, 9) + '…:'
      : workingCS.name + ':';
  }

  // Update the raw CSS oklab() value
  if (active !== document.getElementById('css-oklab-value'))
    document.getElementById('css-oklab-value').textContent =
      `oklab(${currentL.toFixed(3)} ${currentA.toFixed(3)} ${currentB.toFixed(3)})`;
}


// ================================================================
//  LIGHTING LAB
//  Computes result = albedo × light in linear sRGB space.
//  Shows the result on a read-only mini a,b map and info readout.
// ================================================================

/**
 * Compute the lit color: result = albedo × light (component-wise
 * multiply in linear sRGB). Returns OKLab [L, a, b].
 */
function computeLitColor() {
  const [albR, albG, albB] = oklabToLinearSRGB(albedoL, albedoA, albedoB);
  const [litR, litG, litB] = oklabToLinearSRGB(lightL, lightA, lightB);

  // Component-wise multiplication in linear light, scaled by intensity
  const resultR = albR * litR * lightIntensity;
  const resultG = albG * litG * lightIntensity;
  const resultB = albB * litB * lightIntensity;

  return linearSRGBToOKLab(resultR, resultG, resultB);
}

/** Cached ImageData for the result mini a,b map */
let resultABImageData = null;

/**
 * Render the result mini a,b map. Shows the color field at the
 * result's lightness, with a marker at the result (a, b).
 */
function renderResultABMap() {
  const [resL, resA, resB] = computeLitColor();

  resultABImageData = resultABContext.createImageData(RESULT_MAP_SIZE, RESULT_MAP_SIZE);
  const pixels = resultABImageData.data;
  const step = (2 * AB_RANGE) / (RESULT_MAP_SIZE - 1);

  for (let y = 0; y < RESULT_MAP_SIZE; y++) {
    const bVal = AB_RANGE - y * step;
    for (let x = 0; x < RESULT_MAP_SIZE; x++) {
      const aVal = -AB_RANGE + x * step;
      const [linR, linG, linB] = oklabToLinearSRGB(resL, aVal, bVal);
      const idx = (y * RESULT_MAP_SIZE + x) * 4;

      let bR, bG, bB, inGamut;
      inGamut = isInWorkingGamut(resL, aVal, bVal);
      if (isDisplayP3Supported) {
        const [p3R, p3G, p3B] = linearSRGBToLinearP3(linR, linG, linB);
        bR = linearToColorByte(p3R);
        bG = linearToColorByte(p3G);
        bB = linearToColorByte(p3B);
      } else {
        bR = linearToColorByte(linR);
        bG = linearToColorByte(linG);
        bB = linearToColorByte(linB);
      }

      if (!inGamut) {
        bR = Math.round(bR * 0.15);
        bG = Math.round(bG * 0.15);
        bB = Math.round(bB * 0.15);
        if ((x + y) % 6 < 1) {
          bR = Math.min(255, bR + 35);
          bG = Math.min(255, bG + 35);
          bB = Math.min(255, bB + 35);
        }
      }

      pixels[idx]     = bR;
      pixels[idx + 1] = bG;
      pixels[idx + 2] = bB;
      pixels[idx + 3] = 255;
    }
  }

  resultABContext.putImageData(resultABImageData, 0, 0);

  // Draw crosshair at the result (a, b) position
  const cx = ((resA + AB_RANGE) / (2 * AB_RANGE)) * (RESULT_MAP_SIZE - 1);
  const cy = ((AB_RANGE - resB) / (2 * AB_RANGE)) * (RESULT_MAP_SIZE - 1);
  const isDark = resL > 0.5;

  resultABContext.strokeStyle = isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)';
  resultABContext.lineWidth = 2;
  resultABContext.beginPath();
  resultABContext.arc(cx, cy, 5, 0, 2 * Math.PI);
  resultABContext.stroke();

  resultABContext.strokeStyle = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
  resultABContext.lineWidth = 1;
  resultABContext.beginPath();
  resultABContext.arc(cx, cy, 7, 0, 2 * Math.PI);
  resultABContext.stroke();
}

/**
 * Update the lighting panel swatches and result info.
 */
function updateLightingPanel() {
  if (!isLightingOpen) return;

  // Update swatches using CSS oklab()
  document.getElementById('swatch-albedo').style.background =
    `oklab(${albedoL} ${albedoA} ${albedoB})`;
  document.getElementById('swatch-light').style.background = (() => {
    const [lr, lg, lb] = oklabToLinearSRGB(lightL, lightA, lightB);
    const [iL, iA, iB] = linearSRGBToOKLab(lr * lightIntensity, lg * lightIntensity, lb * lightIntensity);
    return `oklab(${iL} ${iA} ${iB})`;
  })();

  // Update intensity slider UI
  const pct = Math.min(lightIntensity / INTENSITY_MAX, 1) * 100;
  document.getElementById('intensity-fill').style.width = pct + '%';
  document.getElementById('intensity-thumb').style.left = pct + '%';
  if (document.activeElement !== document.getElementById('intensity-value'))
    document.getElementById('intensity-value').textContent = lightIntensity.toFixed(2);

  const [resL, resA, resB] = computeLitColor();
  document.getElementById('swatch-result').style.background =
    `oklab(${resL} ${resA} ${resB})`;

  // Result numeric readout
  const [resChroma, resHue] = oklabToOklch(resA, resB);
  document.getElementById('lighting-result-values').innerHTML =
    `<span class="label">L:</span> <b>${resL.toFixed(3)}</b>&ensp;` +
    `<span class="label">a:</span> <b>${resA.toFixed(3)}</b>&ensp;` +
    `<span class="label">b:</span> <b>${resB.toFixed(3)}</b><br>` +
    `<span class="label">C:</span> <b>${resChroma.toFixed(3)}</b>&ensp;` +
    `<span class="label">h:</span> <b>${resHue.toFixed(1)}°</b>`;

  // Result hex codes: sRGB, Display P3, Working CS
  const [linR, linG, linB] = oklabToLinearSRGB(resL, resA, resB);

  // sRGB
  const srgbOk = isInGamut(linR, linG, linB);
  const srgbHex = rgbToHex(linearToGamma(linR), linearToGamma(linG), linearToGamma(linB));
  document.getElementById('result-srgb-hex').textContent = srgbHex;
  document.getElementById('result-srgb-gamut').innerHTML = srgbOk
    ? '<span class="in-gamut" title="In sRGB gamut">✓</span>'
    : '<span class="out-of-gamut" title="Out of sRGB gamut">✗</span>';

  // Display P3
  const [p3R, p3G, p3B] = linearSRGBToLinearP3(linR, linG, linB);
  const p3Ok = isInGamut(p3R, p3G, p3B);
  const p3Hex = rgbToHex(linearToGamma(p3R), linearToGamma(p3G), linearToGamma(p3B));
  document.getElementById('result-p3-hex').textContent = p3Hex;
  document.getElementById('result-p3-gamut').innerHTML = p3Ok
    ? '<span class="in-gamut" title="In Display P3 gamut">✓</span>'
    : '<span class="out-of-gamut" title="Out of Display P3 gamut">✗</span>';

  // Working CS (only shown for custom ICC profiles)
  const isCustomCS = workingCS.name !== 'Display P3' && workingCS.name !== 'sRGB';
  document.getElementById('result-wcs-row').style.display = isCustomCS ? '' : 'none';
  if (isCustomCS) {
    const [wcR, wcG, wcB] = workingCS.fromLinearSRGB(linR, linG, linB);
    const wcOk = isInGamut(wcR, wcG, wcB);
    let wcHex;
    if (workingCS.perChannelTRC) {
      wcHex = rgbToHex(workingCS.encode(wcR, 0), workingCS.encode(wcG, 1), workingCS.encode(wcB, 2));
    } else {
      wcHex = rgbToHex(workingCS.encode(wcR), workingCS.encode(wcG), workingCS.encode(wcB));
    }
    document.getElementById('result-wcs-hex').textContent = wcHex;
    document.getElementById('result-wcs-gamut').innerHTML = wcOk
      ? '<span class="in-gamut" title="In ' + workingCS.name + ' gamut">✓</span>'
      : '<span class="out-of-gamut" title="Out of ' + workingCS.name + ' gamut">✗</span>';
    document.getElementById('result-wcs-label').textContent = workingCS.name.length > 10
      ? workingCS.name.slice(0, 9) + '…:' : workingCS.name + ':';
  }

  document.getElementById('result-css-value').textContent =
    `oklab(${resL.toFixed(3)} ${resA.toFixed(3)} ${resB.toFixed(3)})`;

  // Render the result mini a,b map
  renderResultABMap();
}
