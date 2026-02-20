// ================================================================
//  MATRIX UTILITIES
//  3×3 matrix operations used for ICC profile color space transforms.
// ================================================================

/** Multiply two 3×3 matrices: result = A × B */
function mat3Multiply(A, B) {
  const R = [[0,0,0],[0,0,0],[0,0,0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      R[i][j] = A[i][0]*B[0][j] + A[i][1]*B[1][j] + A[i][2]*B[2][j];
  return R;
}

/** Apply a 3×3 matrix to a 3-element vector: [r,g,b] */
function mat3Apply(M, r, g, b) {
  return [
    M[0][0]*r + M[0][1]*g + M[0][2]*b,
    M[1][0]*r + M[1][1]*g + M[1][2]*b,
    M[2][0]*r + M[2][1]*g + M[2][2]*b,
  ];
}

/** Invert a 3×3 matrix (Cramer's rule). Returns null if singular. */
function mat3Invert(M) {
  const [a,b,c] = M[0], [d,e,f] = M[1], [g,h,k] = M[2];
  const det = a*(e*k-f*h) - b*(d*k-f*g) + c*(d*h-e*g);
  if (Math.abs(det) < 1e-15) return null;
  const inv = 1/det;
  return [
    [ (e*k-f*h)*inv, (c*h-b*k)*inv, (b*f-c*e)*inv],
    [ (f*g-d*k)*inv, (a*k-c*g)*inv, (c*d-a*f)*inv],
    [ (d*h-e*g)*inv, (b*g-a*h)*inv, (a*e-b*d)*inv],
  ];
}


// ================================================================
//  WORKING COLOR SPACE
//  Defines the current working color space used for gamut detection,
//  hex value computation, and eyedropper interpretation.
//  Can be Display P3, sRGB, or a custom ICC profile.
// ================================================================

// Well-known XYZ matrices (D65 white point)
const XYZ_TO_LINEAR_SRGB = [
  [ 3.2409699419045226, -1.5373831775700939, -0.4986107602930034],
  [-0.9692436362808796,  1.8759675015077202,  0.04155505740717559],
  [ 0.05563007969699366,-0.20397696064091520, 1.0569715142428786],
];
const LINEAR_SRGB_TO_XYZ = [
  [0.4123907992659595, 0.357584339383878,  0.1804807884018343],
  [0.21263900587151027,0.715168678767756,  0.07219231536073371],
  [0.01933081871559182,0.11919477979462598,0.9505321522496607],
];

// Bradford chromatic adaptation D50 → D65
const BRADFORD_D50_TO_D65 = [
  [ 0.9555766, -0.0230393,  0.0631636],
  [-0.0282895,  1.0099416,  0.0210077],
  [ 0.0122982, -0.0204830,  1.3299098],
];

/**
 * Create a working color space object.
 * @param {string} name - Display name
 * @param {number[][]} toSRGBMatrix - 3×3 matrix: linear WCS → linear sRGB
 * @param {number[][]} fromSRGBMatrix - 3×3 matrix: linear sRGB → linear WCS
 * @param {function} decode - gamma decode: encoded value → linear
 * @param {function} encode - gamma encode: linear → encoded value
 */
function createWorkingCS(name, toSRGBMatrix, fromSRGBMatrix, decode, encode) {
  return {
    name,
    toLinearSRGB:   (r, g, b) => mat3Apply(toSRGBMatrix, r, g, b),
    fromLinearSRGB: (r, g, b) => mat3Apply(fromSRGBMatrix, r, g, b),
    decode,
    encode,
  };
}

/** Create an sRGB working color space (identity transform). */
function createSRGBWorkingCS() {
  const I = [[1,0,0],[0,1,0],[0,0,1]];
  return createWorkingCS('sRGB', I, I, gammaToLinear, linearToGamma);
}

/** Create a Display P3 working color space. */
function createP3WorkingCS() {
  // P3→sRGB = existing linearP3ToLinearSRGB, sRGB→P3 = existing linearSRGBToLinearP3
  const p3ToSRGB = [
    [ 1.2249401762, -0.2249401762,  0.0],
    [-0.0420569549,  1.0420569549,  0.0],
    [-0.0196375546, -0.0786360236,  1.0982735782],
  ];
  const srgbToP3 = [
    [0.8224621209, 0.1775378791, 0.0],
    [0.0331941826, 0.9668058174, 0.0],
    [0.0170826307, 0.0723974407, 0.9105199286],
  ];
  // P3 uses the same sRGB transfer function
  return createWorkingCS('Display P3', p3ToSRGB, srgbToP3, gammaToLinear, linearToGamma);
}

/** Update the UI to reflect the current working CS name. */
function updateWorkingCSDisplay() {
  const el = document.getElementById('cs-name-display');
  el.textContent = workingCS.name;
  el.title = workingCS.name;
}


// ================================================================
//  ICC PROFILE PARSER
//  Reads matrix-based RGB ICC/ICM profiles to extract primaries
//  and transfer curves, then builds a working color space from them.
// ================================================================

/**
 * Read a signed 15.16 fixed-point number from a DataView.
 */
function readS15Fixed16(dv, offset) {
  const raw = dv.getInt32(offset, false); // big-endian
  return raw / 65536;
}

/**
 * Parse an ICC profile ArrayBuffer and return a working CS object.
 * Supports matrix-based RGB profiles (rXYZ/gXYZ/bXYZ + TRC tags).
 * @throws {Error} if the profile is unsupported
 */
function parseICCProfile(buffer) {
  const dv = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Read tag table
  const tagCount = dv.getUint32(128, false);
  const tags = {};
  for (let i = 0; i < tagCount; i++) {
    const base = 132 + i * 12;
    const sig = String.fromCharCode(bytes[base], bytes[base+1], bytes[base+2], bytes[base+3]);
    tags[sig] = {
      offset: dv.getUint32(base + 4, false),
      size:   dv.getUint32(base + 8, false),
    };
  }

  // Extract profile description for the name
  let profileName = 'Custom CS';
  if (tags['desc']) {
    const descOff = tags['desc'].offset;
    const descType = String.fromCharCode(
      bytes[descOff], bytes[descOff+1], bytes[descOff+2], bytes[descOff+3]
    );
    if (descType === 'desc') {
      // ICC v2 'desc' type: 4 type + 4 reserved + 4 length + ASCII string
      const strLen = dv.getUint32(descOff + 8, false);
      const strBytes = bytes.slice(descOff + 12, descOff + 12 + strLen - 1);
      profileName = new TextDecoder('ascii').decode(strBytes).trim() || 'Custom CS';
    } else if (descType === 'mluc') {
      // ICC v4 'mluc' type: multi-localized Unicode
      const recCount = dv.getUint32(descOff + 8, false);
      if (recCount > 0) {
        const recLen   = dv.getUint32(descOff + 16, false);
        const recOff   = dv.getUint32(descOff + 20, false);
        const strData  = new Uint16Array(recLen / 2);
        for (let i = 0; i < strData.length; i++) {
          strData[i] = dv.getUint16(descOff + recOff + i * 2, false);
        }
        profileName = String.fromCharCode(...strData).replace(/\0/g, '').trim() || 'Custom CS';
      }
    }
  }

  // We need rXYZ, gXYZ, bXYZ for the 3×3 matrix
  if (!tags['rXYZ'] || !tags['gXYZ'] || !tags['bXYZ']) {
    throw new Error('Not a matrix-based RGB profile (missing XYZ tags)');
  }

  // Read XYZ values (each tag: 4 type + 4 reserved + 12 XYZ data)
  function readXYZTag(tag) {
    const o = tag.offset + 8; // skip type signature + reserved
    return [
      readS15Fixed16(dv, o),
      readS15Fixed16(dv, o + 4),
      readS15Fixed16(dv, o + 8),
    ];
  }

  const rXYZ = readXYZTag(tags['rXYZ']);
  const gXYZ = readXYZTag(tags['gXYZ']);
  const bXYZ = readXYZTag(tags['bXYZ']);

  // Build custom→XYZ matrix (D50 PCS, columns = primaries)
  const customToXYZ_D50 = [
    [rXYZ[0], gXYZ[0], bXYZ[0]],
    [rXYZ[1], gXYZ[1], bXYZ[1]],
    [rXYZ[2], gXYZ[2], bXYZ[2]],
  ];

  // Adapt from D50 to D65, then convert to linear sRGB
  const customToXYZ_D65 = mat3Multiply(BRADFORD_D50_TO_D65, customToXYZ_D50);
  const customToLinearSRGB = mat3Multiply(XYZ_TO_LINEAR_SRGB, customToXYZ_D65);
  const linearSRGBToCustom = mat3Invert(customToLinearSRGB);
  if (!linearSRGBToCustom) throw new Error('Singular matrix in ICC profile');

  // Parse TRC (transfer response curve) tags
  function parseTRC(tag) {
    const o = tag.offset;
    const type = String.fromCharCode(bytes[o], bytes[o+1], bytes[o+2], bytes[o+3]);

    if (type === 'curv') {
      const count = dv.getUint32(o + 8, false);
      if (count === 0) {
        // Linear
        return { decode: v => v, encode: v => v };
      } else if (count === 1) {
        // Simple gamma: u8Fixed8Number
        const gamma = dv.getUint16(o + 12, false) / 256;
        return {
          decode: v => Math.pow(Math.max(0, v), gamma),
          encode: v => Math.pow(Math.max(0, v), 1 / gamma),
        };
      } else {
        // Table-based curve: build forward + inverse LUT
        const table = new Float64Array(count);
        for (let i = 0; i < count; i++) {
          table[i] = dv.getUint16(o + 12 + i * 2, false) / 65535;
        }
        const invSize = 4096;
        const invTable = new Float64Array(invSize);
        let ti = 0;
        for (let i = 0; i < invSize; i++) {
          const target = i / (invSize - 1);
          while (ti < count - 2 && table[ti + 1] < target) ti++;
          const t0 = table[ti], t1 = table[Math.min(ti + 1, count - 1)];
          const frac = t1 > t0 ? (target - t0) / (t1 - t0) : 0;
          invTable[i] = (ti + frac) / (count - 1);
        }
        return {
          decode: v => {
            const x = Math.max(0, Math.min(1, v)) * (count - 1);
            const lo = Math.floor(x), hi = Math.min(lo + 1, count - 1);
            return table[lo] + (table[hi] - table[lo]) * (x - lo);
          },
          encode: v => {
            const x = Math.max(0, Math.min(1, v)) * (invSize - 1);
            const lo = Math.floor(x), hi = Math.min(lo + 1, invSize - 1);
            return invTable[lo] + (invTable[hi] - invTable[lo]) * (x - lo);
          },
        };
      }
    }

    if (type === 'para') {
      const funcType = dv.getUint16(o + 8, false);
      const p = (idx) => readS15Fixed16(dv, o + 12 + idx * 4);
      if (funcType === 0) {
        const g = p(0);
        return {
          decode: v => Math.pow(Math.max(0, v), g),
          encode: v => Math.pow(Math.max(0, v), 1/g),
        };
      } else if (funcType === 3) {
        // Y = (aX+b)^g if X>=d, else cX   (sRGB-like)
        const g = p(0), a = p(1), b = p(2), c = p(3), d = p(4);
        return {
          decode: v => v >= d ? Math.pow(a * v + b, g) : c * v,
          encode: v => {
            const cutoff = c * d;
            if (v <= cutoff && c !== 0) return v / c;
            return (Math.pow(Math.max(0, v), 1/g) - b) / a;
          },
        };
      } else if (funcType === 4) {
        const g = p(0), a = p(1), b = p(2), c = p(3), d = p(4), e = p(5), f = p(6);
        return {
          decode: v => v >= d ? Math.pow(a * v + b, g) + e : c * v + f,
          encode: v => {
            const cutoff = c * d + f;
            if (v <= cutoff && c !== 0) return (v - f) / c;
            return (Math.pow(Math.max(0, v - e), 1/g) - b) / a;
          },
        };
      }
      // Fallback for other parametric types: treat as gamma-only
      const g = p(0);
      return {
        decode: v => Math.pow(Math.max(0, v), g),
        encode: v => Math.pow(Math.max(0, v), 1/g),
      };
    }

    // Unknown TRC type → assume sRGB
    return { decode: gammaToLinear, encode: linearToGamma };
  }

  // Parse the three TRC channels
  const rTRC = tags['rTRC'] ? parseTRC(tags['rTRC']) : { decode: gammaToLinear, encode: linearToGamma };
  const gTRC = tags['gTRC'] ? parseTRC(tags['gTRC']) : { decode: gammaToLinear, encode: linearToGamma };
  const bTRC = tags['bTRC'] ? parseTRC(tags['bTRC']) : { decode: gammaToLinear, encode: linearToGamma };

  // Build per-channel decode/encode (handles profiles with different per-channel curves)
  function decode(v, ch) {
    if (ch === 0) return rTRC.decode(v);
    if (ch === 1) return gTRC.decode(v);
    return bTRC.decode(v);
  }
  function encode(v, ch) {
    if (ch === 0) return rTRC.encode(v);
    if (ch === 1) return gTRC.encode(v);
    return bTRC.encode(v);
  }

  return {
    name: profileName,
    toLinearSRGB:   (r, g, b) => mat3Apply(customToLinearSRGB, r, g, b),
    fromLinearSRGB: (r, g, b) => mat3Apply(linearSRGBToCustom, r, g, b),
    decode: (v, ch) => decode(v, ch),
    encode: (v, ch) => encode(v, ch),
    perChannelTRC: true,
  };
}

/**
 * Handle ICC file import from the file input.
 */
async function handleICCImport(input) {
  if (!input.files || !input.files[0]) return;
  try {
    const buffer = await input.files[0].arrayBuffer();
    workingCS = parseICCProfile(buffer);
    // Cache the raw profile bytes for persistence
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    iccProfileBase64 = btoa(binary);
    updateWorkingCSDisplay();
    renderAll();
    scheduleSave();
  } catch (err) {
    alert('Failed to load ICC profile:\n' + err.message);
  }
  input.value = ''; // allow re-importing the same file
}

/**
 * Reset working CS to the default (P3 if supported, else sRGB).
 */
function resetWorkingCS() {
  workingCS = isDisplayP3Supported ? createP3WorkingCS() : createSRGBWorkingCS();
  iccProfileBase64 = null;
  updateWorkingCSDisplay();
  renderAll();
  scheduleSave();
}
