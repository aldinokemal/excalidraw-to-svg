const { parentPort } = require("worker_threads");
const { renderSvgMarkup } = require("./excalidraw-runtime");

const serializeError = (error) => ({
  message: error && error.message ? error.message : String(error),
  name: error && error.name ? error.name : "Error",
  stack: error && error.stack ? error.stack : undefined,
});

parentPort.on("message", async ({ diagram }) => {
  try {
    const svgMarkup = await renderSvgMarkup(diagram);
    parentPort.postMessage({ ok: true, svgMarkup });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: serializeError(error) });
  }
});
