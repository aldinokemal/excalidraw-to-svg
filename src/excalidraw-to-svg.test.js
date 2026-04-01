const excalidrawToSvg = require("./excalidraw-to-svg");

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

const mockDiagramWithFont = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [
    {
      id: "text1",
      type: "text",
      x: 100,
      y: 100,
      width: 120,
      height: 45,
      text: "halooo",
      fontSize: 36,
      fontFamily: 8,
      textAlign: "left",
      verticalAlign: "top",
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      roundness: null,
      seed: 12345,
      version: 1,
      versionNonce: 1,
      isDeleted: false,
      boundElements: [],
      lineHeight: 1.25,
    },
  ],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
};

describe("excalidraw-to-svg function", () => {
  it("should not install browser globals on require", () => {
    expect("window" in global).toBe(false);
    expect("document" in global).toBe(false);
  });

  it("should render an svg", async () => {
    const svg = await excalidrawToSvg(mockDiagram);
    expect(svg.outerHTML).toMatch(/<svg/);
  });

  it("should subset custom fonts to keep SVG small", async () => {
    const svg = await excalidrawToSvg(mockDiagramWithFont);
    const svgHTML = svg.outerHTML;

    // Should contain a @font-face rule for Comic Shanns
    expect(svgHTML).toMatch(/@font-face.*Comic Shanns/);

    // SVG should be under 100KB (without subsetting it would be ~2.2MB)
    const sizeKB = Buffer.byteLength(svgHTML, "utf8") / 1024;
    expect(sizeKB).toBeLessThan(100);
  });

  it("should keep host globals untouched during an in-flight conversion", async () => {
    const nativeFetch = global.fetch;
    const nativeConsoleError = console.error;

    const pendingSvg = excalidrawToSvg(mockDiagram);

    expect(global.fetch).toBe(nativeFetch);
    expect(console.error).toBe(nativeConsoleError);
    expect("window" in global).toBe(false);
    expect("document" in global).toBe(false);

    await pendingSvg;

    expect(global.fetch).toBe(nativeFetch);
    expect(console.error).toBe(nativeConsoleError);
    expect("window" in global).toBe(false);
    expect("document" in global).toBe(false);
  });

  it("should keep host globals untouched across concurrent conversions", async () => {
    const nativeFetch = global.fetch;
    const nativeConsoleError = console.error;

    const [firstSvg, secondSvg] = await Promise.all([
      excalidrawToSvg(mockDiagram),
      excalidrawToSvg(mockDiagramWithFont),
    ]);

    expect(firstSvg.outerHTML).toMatch(/<svg/);
    expect(secondSvg.outerHTML).toMatch(/<svg/);
    expect(global.fetch).toBe(nativeFetch);
    expect(console.error).toBe(nativeConsoleError);
    expect("window" in global).toBe(false);
    expect("document" in global).toBe(false);
  });
});

describe("excalidraw-to-svg cancellation", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.useRealTimers();
    jest.unmock("worker_threads");
  });

  it("should reject with TimeoutError and terminate the worker on timeout", async () => {
    jest.useFakeTimers();
    jest.resetModules();

    const workers = [];
    jest.doMock("worker_threads", () => ({
      Worker: jest.fn(() => {
        const worker = {
          once: jest.fn(),
          removeAllListeners: jest.fn(),
          terminate: jest.fn().mockResolvedValue(undefined),
          postMessage: jest.fn(),
        };
        workers.push(worker);
        return worker;
      }),
    }));

    const excalidrawToSvgWithTimeout = require("./excalidraw-to-svg");
    const promise = excalidrawToSvgWithTimeout(mockDiagram, { timeoutMs: 25 });
    const rejection = expect(promise).rejects.toMatchObject({
      name: "TimeoutError",
      message: "SVG worker timed out after 25ms",
    });

    await jest.advanceTimersByTimeAsync(25);

    await rejection;
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("should reject with AbortError and terminate the worker when aborted", async () => {
    jest.resetModules();

    const workers = [];
    jest.doMock("worker_threads", () => ({
      Worker: jest.fn(() => {
        const worker = {
          once: jest.fn(),
          removeAllListeners: jest.fn(),
          terminate: jest.fn().mockResolvedValue(undefined),
          postMessage: jest.fn(),
        };
        workers.push(worker);
        return worker;
      }),
    }));

    const excalidrawToSvgWithAbort = require("./excalidraw-to-svg");
    const controller = new AbortController();
    const promise = excalidrawToSvgWithAbort(mockDiagram, { signal: controller.signal });
    const rejection = expect(promise).rejects.toMatchObject({
      name: "AbortError",
      message: "SVG worker aborted",
    });
    controller.abort();

    await rejection;
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("should reject immediately with AbortError when signal is already aborted", async () => {
    jest.resetModules();

    const mockWorkerModule = {
      Worker: jest.fn(),
    };
    jest.doMock("worker_threads", () => mockWorkerModule);

    const excalidrawToSvgPreAborted = require("./excalidraw-to-svg");
    const controller = new AbortController();
    controller.abort();

    await expect(
      excalidrawToSvgPreAborted(mockDiagram, { signal: controller.signal })
    ).rejects.toMatchObject({
      name: "AbortError",
      message: "SVG worker aborted",
    });

    expect(mockWorkerModule.Worker).not.toHaveBeenCalled();
  });
});
