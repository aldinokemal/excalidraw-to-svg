const { parentPort } = require("worker_threads");
const { renderSvgMarkup } = require("./excalidraw-runtime");

const serializeError = (error) => ({
  message: error && error.message ? error.message : String(error),
  name: error && error.name ? error.name : "Error",
  stack: error && error.stack ? error.stack : undefined,
});

let renderQueue = Promise.resolve();

parentPort.on("message", ({ diagram, id }) => {
  renderQueue = renderQueue.then(async () => {
    try {
      const svgMarkup = await renderSvgMarkup(diagram);
      parentPort.postMessage({ id, ok: true, svgMarkup });
    } catch (error) {
      parentPort.postMessage({ id, ok: false, error: serializeError(error) });
    }
  });
});
