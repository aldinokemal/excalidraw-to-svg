const path = require("path");
const { Worker } = require("worker_threads");
const { JSDOM } = require("jsdom");

const WORKER_PATH = path.join(__dirname, "excalidraw-to-svg.worker.js");

const createNamedError = (name, message) => {
  const error = new Error(message);
  error.name = name;
  return error;
};

const deserializeWorkerError = (error) => {
  const workerError = new Error(
    error && error.message ? error.message : "Worker conversion failed"
  );
  workerError.name = error && error.name ? error.name : "Error";
  if (error && error.stack) {
    workerError.stack = error.stack;
  }
  return workerError;
};

const parseSvgMarkup = (svgMarkup) => {
  const dom = new JSDOM(svgMarkup, { contentType: "image/svg+xml" });
  return dom.window.document.documentElement;
};

/**
 * Function to convert an excalidraw JSON file to an SVG
 * @param {string | object} diagram excalidraw diagram to convert
 * @param {{ timeoutMs?: number, signal?: AbortSignal }=} options
 * @returns {Promise<SVGElement>} SVG XML Node
 */
const excalidrawToSvg = async (diagram, options = {}) => {
  const { timeoutMs, signal } = options || {};

  // Check abort before spawning worker (avoids unnecessary worker creation)
  if (signal?.aborted) {
    return Promise.reject(createNamedError("AbortError", "SVG worker aborted"));
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH);
    let settled = false;
    let timeoutId = null;
    let abortHandler = null;

    const cleanup = () => {
      worker.removeAllListeners("message");
      worker.removeAllListeners("error");
      worker.removeAllListeners("exit");
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
        abortHandler = null;
      }
    };

    const rejectAndTerminate = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      void worker.terminate();
      reject(error);
    };

    worker.once("message", (message) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      void worker.terminate();

      if (!message.ok) {
        reject(deserializeWorkerError(message.error));
        return;
      }

      resolve(parseSvgMarkup(message.svgMarkup));
    });

    worker.once("error", (error) => {
      rejectAndTerminate(error);
    });

    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        rejectAndTerminate(
          new Error(`SVG worker stopped with exit code ${code}`)
        );
      }
    });

    if (
      typeof timeoutMs === "number" &&
      Number.isFinite(timeoutMs) &&
      timeoutMs > 0
    ) {
      timeoutId = setTimeout(() => {
        rejectAndTerminate(
          createNamedError(
            "TimeoutError",
            `SVG worker timed out after ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
    }

    if (signal) {
      abortHandler = () => {
        rejectAndTerminate(
          createNamedError("AbortError", "SVG worker aborted")
        );
      };
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    worker.postMessage({ diagram });
  });
};

module.exports = excalidrawToSvg;
