const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const subsetFont = require("subset-font");

/**
 * Mapping of Excalidraw font family names to their .ttf file names
 * in @excalidraw/utils dist/prod/assets directory.
 */
const FONT_FILE_MAP = {
  Excalifont: "Excalifont.ttf",
  Virgil: "Virgil.ttf",
  Cascadia: "Cascadia Code.ttf",
  "Comic Shanns": "Comic Shanns Regular.ttf",
  "Liberation Sans": "Liberation Sans.ttf",
  "Lilita One": "Lilita One.ttf",
  Nunito: "Nunito ExtraLight Medium.ttf",
  Xiaolai: "Xiaolai.ttf",
};
const fontFileCache = new Map();
const fontSubsetCache = new Map();
const fullFontDataUriCache = new Map();
let fontAssetsDir = null;

/**
 * Resolves the path to the @excalidraw/utils font assets directory.
 */
const getFontAssetsDir = () => {
  if (!fontAssetsDir) {
    const utilsDir = path.dirname(require.resolve("@excalidraw/utils"));
    fontAssetsDir = path.join(utilsDir, "assets");
  }
  return fontAssetsDir;
};

/**
 * Reads a font file and returns its Buffer.
 * @param {string} fontFileName - Name of the font file (e.g., "Excalifont.ttf")
 * @returns {Buffer|null} Font file buffer or null if the file doesn't exist
 */
const readFontFile = (fontFileName) => {
  if (!fontFileName) return null;
  if (fontFileCache.has(fontFileName)) {
    return fontFileCache.get(fontFileName);
  }

  try {
    const fontPath = path.join(getFontAssetsDir(), fontFileName);
    const fontBuffer = fs.readFileSync(fontPath);
    fontFileCache.set(fontFileName, fontBuffer);
    return fontBuffer;
  } catch {
    fontFileCache.set(fontFileName, null);
    return null;
  }
};

const buildCharacterString = (chars) =>
  [...chars]
    .sort((a, b) => a.codePointAt(0) - b.codePointAt(0))
    .join("");

const getFullFontDataUri = (fontName, fontBuffer) => {
  if (fullFontDataUriCache.has(fontName)) {
    return fullFontDataUriCache.get(fontName);
  }

  const dataUri = `data:font/ttf;base64,${fontBuffer.toString("base64")}`;
  fullFontDataUriCache.set(fontName, dataUri);
  return dataUri;
};

const getEmbeddedFontDataUri = async (fontName, fontBuffer, charString) => {
  if (!charString) {
    return null;
  }

  const cacheKey = `${fontName}\0${charString}`;
  if (fontSubsetCache.has(cacheKey)) {
    return fontSubsetCache.get(cacheKey);
  }

  const subsetPromise = (async () => {
    try {
      const subsetBuffer = await subsetFont(fontBuffer, charString, {
        targetFormat: "sfnt",
      });
      return `data:font/ttf;base64,${Buffer.from(subsetBuffer).toString("base64")}`;
    } catch {
      return getFullFontDataUri(fontName, fontBuffer);
    }
  })();

  fontSubsetCache.set(cacheKey, subsetPromise);
  return subsetPromise;
};

/**
 * Checks if a character is an emoji. Emoji characters are excluded from
 * embedded font subsets so that the system's color emoji font (e.g. Apple
 * Color Emoji) renders them instead of monochrome fallback glyphs.
 * @param {string} char - A single character (may be a surrogate pair)
 * @returns {boolean} True if the character is an emoji
 */
const isEmoji = (char) => {
  const cp = char.codePointAt(0);
  if (cp === undefined) return false;
  return (
    (cp >= 0x1f1e0 && cp <= 0x1f1ff) ||
    (cp >= 0x1f300 && cp <= 0x1f5ff) ||
    (cp >= 0x1f600 && cp <= 0x1f64f) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x1fa00 && cp <= 0x1fa6f) ||
    (cp >= 0x1fa70 && cp <= 0x1faff) ||
    (cp >= 0x2600 && cp <= 0x26ff) ||
    (cp >= 0x2700 && cp <= 0x27bf) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xe0020 && cp <= 0xe007f) ||
    cp === 0x200d
  );
};

/**
 * Collects all characters used per font family from the SVG's text elements.
 * Emoji characters are excluded so they render via the system's color emoji font.
 * @param {SVGElement} svg - The SVG element to scan
 * @returns {Map<string, Set<string>>} Map of font family name to set of characters
 */
const collectUsedCharsPerFont = (svg) => {
  const fontCharsMap = new Map();

  const addChars = (fontFamily, text) => {
    if (!text) return;
    const families = fontFamily.split(",").map((family) => family.trim());
    for (const family of families) {
      if (FONT_FILE_MAP[family]) {
        if (!fontCharsMap.has(family)) fontCharsMap.set(family, new Set());
        const charSet = fontCharsMap.get(family);
        for (const char of text) {
          if (!isEmoji(char)) charSet.add(char);
        }
      }
    }
  };

  const textElements = svg.querySelectorAll("text");
  for (const textEl of textElements) {
    const fontFamily = textEl.getAttribute("font-family") || "";
    const text = textEl.textContent || "";
    addChars(fontFamily, text);
  }

  const svgHTML = svg.outerHTML;
  const styleFontMatches = svgHTML.matchAll(
    /font-family:\s*([^;"]+)[^>]*>([^<]*)</g,
  );
  for (const match of styleFontMatches) {
    addChars(match[1], match[2]);
  }

  return fontCharsMap;
};

/**
 * Scans an SVG element for font-family references and generates @font-face CSS
 * with embedded base64 font data. Fonts are subsetted to include only the
 * characters actually used in the SVG, drastically reducing file size.
 * @param {SVGElement} svg - The SVG element to scan
 * @returns {Promise<string>} CSS string containing @font-face declarations
 */
const generateFontFaceCSS = async (svg) => {
  const fontCharsMap = collectUsedCharsPerFont(svg);

  if (fontCharsMap.size === 0) return "";

  const fontFaceRules = [];
  for (const [fontName, chars] of fontCharsMap) {
    const fileName = FONT_FILE_MAP[fontName];
    const fontBuffer = readFontFile(fileName);
    if (!fontBuffer) continue;

    const dataUri = await getEmbeddedFontDataUri(
      fontName,
      fontBuffer,
      buildCharacterString(chars),
    );
    if (!dataUri) continue;

    fontFaceRules.push(
      `@font-face { font-family: "${fontName}"; src: url("${dataUri}") format("truetype"); }`,
    );
  }

  return fontFaceRules.join("\n");
};

/**
 * Injects @font-face CSS rules into the SVG's <style> element.
 * Fonts are subsetted to include only characters used in the SVG.
 * @param {SVGElement} svg - The SVG element to modify
 */
const embedFontsInSvg = async (svg) => {
  const fontCSS = await generateFontFaceCSS(svg);
  if (!fontCSS) return;

  let styleEl = svg.querySelector("style.style-fonts");
  if (!styleEl) {
    styleEl = svg.querySelector("style");
  }
  if (!styleEl) {
    const defs =
      svg.querySelector("defs") ||
      svg.insertBefore(
        svg.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "defs"),
        svg.firstChild,
      );
    styleEl = svg.ownerDocument.createElementNS(
      "http://www.w3.org/2000/svg",
      "style",
    );
    defs.appendChild(styleEl);
  }

  styleEl.textContent = fontCSS + "\n" + (styleEl.textContent || "");
};

/**
 * Sets up browser-like global polyfills required by @excalidraw/utils
 * in a Node.js worker environment using JSDOM.
 */
const setupBrowserGlobals = () => {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "http://localhost",
    pretendToBeVisual: true,
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.DOMParser = dom.window.DOMParser;
  global.XMLSerializer = dom.window.XMLSerializer;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;
  global.SVGElement = dom.window.SVGElement;
  global.Image = dom.window.Image;
  global.HTMLImageElement = dom.window.HTMLImageElement;
  global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
  global.devicePixelRatio = 1;
  global.fetch = dom.window.fetch || (() => Promise.resolve({ ok: false }));
  global.URL = dom.window.URL;
  global.Blob = dom.window.Blob;
  global.FileReader = dom.window.FileReader;
  global.atob = dom.window.atob;
  global.btoa = dom.window.btoa;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  global.ClipboardEvent = class ClipboardEvent {};
  global.FontFace = class FontFace {
    constructor() {}

    load() {
      return Promise.resolve(this);
    }
  };
  global.CanvasRenderingContext2D = class CanvasRenderingContext2D {};
  global.Path2D = class Path2D {
    constructor() {}
    addPath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    rect() {}
    ellipse() {}
    closePath() {}
  };

  const origCreateElement = document.createElement.bind(document);
  document.createElement = function (tag) {
    const element = origCreateElement(tag);
    if (tag === "canvas") {
      element.getContext = function (type) {
        if (type === "2d") {
          return {
            measureText: () => ({ width: 0 }),
            fillRect: () => {},
            clearRect: () => {},
            drawImage: () => {},
            getImageData: () => ({ data: [] }),
            putImageData: () => {},
            createImageData: () => ({}),
            setTransform: () => {},
            resetTransform: () => {},
            scale: () => {},
            rotate: () => {},
            translate: () => {},
            transform: () => {},
            beginPath: () => {},
            closePath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            bezierCurveTo: () => {},
            quadraticCurveTo: () => {},
            arc: () => {},
            arcTo: () => {},
            rect: () => {},
            fill: () => {},
            stroke: () => {},
            clip: () => {},
            save: () => {},
            restore: () => {},
            canvas: element,
            fillStyle: "",
            strokeStyle: "",
            lineWidth: 1,
            font: "",
            textAlign: "",
            textBaseline: "",
            globalAlpha: 1,
            globalCompositeOperation: "source-over",
          };
        }
        return null;
      };
      element.toBlob = (cb) => cb(new Blob());
      element.toDataURL = () => "";
    }
    return element;
  };
};

let browserGlobalsReady = false;
let utilsPromise = null;

const getExcalidrawUtils = () => {
  if (!browserGlobalsReady) {
    setupBrowserGlobals();
    browserGlobalsReady = true;
  }
  if (!utilsPromise) {
    utilsPromise = import("@excalidraw/utils");
  }
  return utilsPromise;
};

/**
 * Converts an Excalidraw diagram into serialized SVG markup inside an isolated runtime.
 * @param {string | object} diagram - Excalidraw diagram input
 * @returns {Promise<string>} Serialized SVG markup
 */
const renderSvgMarkup = async (diagram) => {
  const diagramObj =
    typeof diagram === "string" ? JSON.parse(diagram) : diagram;
  const { exportToSvg } = await getExcalidrawUtils();

  const origConsoleError = console.error;
  console.error = (...args) => {
    const msg = args[0];
    if (typeof msg === "string" && msg.includes("font-face")) return;
    origConsoleError.apply(console, args);
  };

  try {
    const svg = await exportToSvg({
      elements: diagramObj.elements || [],
      appState: diagramObj.appState || {},
      files: diagramObj.files || null,
      skipInliningFonts: true,
    });

    await embedFontsInSvg(svg);
    return svg.outerHTML;
  } finally {
    console.error = origConsoleError;
  }
};

module.exports = {
  renderSvgMarkup,
};
