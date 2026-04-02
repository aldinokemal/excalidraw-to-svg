const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { 
  url: 'http://localhost',
  pretendToBeVisual: true
});

// Polyfill browser globals needed by @excalidraw/utils
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.DOMParser = dom.window.DOMParser;
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;
global.SVGElement = dom.window.SVGElement;
global.XMLSerializer = dom.window.XMLSerializer;
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
global.ResizeObserver = class ResizeObserver { observe() {} unobserve() {} disconnect() {} };
global.ClipboardEvent = class ClipboardEvent {};
global.FontFace = class FontFace { constructor() {} load() { return Promise.resolve(this); } };
global.CanvasRenderingContext2D = class CanvasRenderingContext2D {};

// Set up canvas getContext to return a mock 2d context
const origCreateElement = document.createElement.bind(document);
document.createElement = function(tag) {
  const el = origCreateElement(tag);
  if (tag === 'canvas') {
    el.getContext = function(type) {
      if (type === '2d') {
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
          canvas: el,
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          font: '',
          textAlign: '',
          textBaseline: '',
          globalAlpha: 1,
          globalCompositeOperation: 'source-over',
        };
      }
      return null;
    };
    el.toBlob = (cb) => cb(new Blob());
    el.toDataURL = () => '';
  }
  return el;
};

const mockDiagram = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [
    {
      id: "vWrqOAfkind2qcm7LDAGZ",
      type: "ellipse",
      x: 414,
      y: 237,
      width: 214,
      height: 214,
      angle: 0,
      strokeColor: "#000000",
      backgroundColor: "#15aabf",
      fillStyle: "hachure",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      strokeSharpness: "sharp",
      seed: 1041657908,
      version: 120,
      versionNonce: 1188004276,
      isDeleted: false,
      boundElementIds: null,
    },
  ],
  appState: { viewBackgroundColor: "#ffffff", gridSize: null },
};

import('@excalidraw/utils').then(async (m) => {
  console.log('Module loaded successfully');
  try {
    const svg = await m.exportToSvg({
      elements: mockDiagram.elements,
      appState: mockDiagram.appState,
      files: null,
    });
    console.log('SVG generated!');
    console.log('SVG tag:', svg.tagName);
    const output = svg.outerHTML;
    console.log('SVG length:', output.length);
    console.log('SVG preview:', output.substring(0, 200));
  } catch (e) {
    console.error('exportToSvg ERROR:', e.message);
    console.error('Stack:', e.stack && e.stack.split('\n').slice(0, 8).join('\n'));
  }
}).catch(e => {
  console.error('Import ERROR:', e.message);
});
