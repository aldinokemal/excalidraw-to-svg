const path = require("path");
const { Worker } = require("worker_threads");
const { JSDOM } = require("jsdom");

const WORKER_PATH = path.join(__dirname, "excalidraw-to-svg.worker.js");

const deserializeWorkerError = (error) => {
  const workerError = new Error(
    error && error.message ? error.message : "Worker conversion failed",
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
 * @returns {Promise<SVGElement>} SVG XML Node
 */
const excalidrawToSvg = async (diagram) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH);
    let settled = false;

    const cleanup = () => {
      worker.removeAllListeners("message");
      worker.removeAllListeners("error");
      worker.removeAllListeners("exit");
    };

    worker.once("message", (message) => {
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
      settled = true;
      cleanup();
      void worker.terminate();
      reject(error);
    });

    worker.once("exit", (code) => {
      cleanup();
      if (!settled && code !== 0) {
        reject(new Error(`SVG worker stopped with exit code ${code}`));
      }
    });

    worker.postMessage({ diagram });
  });
};

module.exports = excalidrawToSvg;
