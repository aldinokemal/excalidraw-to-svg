const path = require("path");
const { Worker } = require("worker_threads");
const { JSDOM } = require("jsdom");

const WORKER_PATH = path.join(__dirname, "excalidraw-to-svg.worker.js");
const svgParserWindow = new JSDOM("<!DOCTYPE html>").window;
const svgParser = new svgParserWindow.DOMParser();
const workerState = {
  currentTask: null,
  idleTimerId: null,
  nextRequestId: 1,
  queue: [],
  worker: null,
};

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
  return svgParser.parseFromString(svgMarkup, "image/svg+xml").documentElement;
};

const cleanupTask = (task) => {
  if (task.timeoutId) {
    clearTimeout(task.timeoutId);
    task.timeoutId = null;
  }
  if (task.signal && task.abortHandler) {
    task.signal.removeEventListener("abort", task.abortHandler);
    task.abortHandler = null;
  }
};

const settleTask = (task, settle) => {
  if (!task || task.settled) {
    return false;
  }

  task.settled = true;
  cleanupTask(task);
  settle();
  return true;
};

const removeQueuedTask = (task) => {
  const index = workerState.queue.indexOf(task);
  if (index >= 0) {
    workerState.queue.splice(index, 1);
  }
};

const detachWorker = () => {
  const { worker } = workerState;
  if (!worker) {
    return null;
  }

  worker.removeListener("message", handleWorkerMessage);
  worker.removeListener("error", handleWorkerError);
  worker.removeListener("exit", handleWorkerExit);
  workerState.worker = null;
  return worker;
};

const terminateWorker = () => {
  if (workerState.idleTimerId) {
    clearTimeout(workerState.idleTimerId);
    workerState.idleTimerId = null;
  }

  const worker = detachWorker();
  if (worker) {
    void worker.terminate();
  }
};

const ensureWorker = () => {
  if (workerState.worker) {
    return workerState.worker;
  }

  const worker = new Worker(WORKER_PATH);
  if (typeof worker.unref === "function") {
    worker.unref();
  }
  worker.on("message", handleWorkerMessage);
  worker.on("error", handleWorkerError);
  worker.on("exit", handleWorkerExit);
  workerState.worker = worker;
  return worker;
};

const pumpQueue = () => {
  if (workerState.idleTimerId) {
    clearTimeout(workerState.idleTimerId);
    workerState.idleTimerId = null;
  }

  if (workerState.currentTask) {
    return;
  }

  while (workerState.queue.length > 0) {
    const task = workerState.queue.shift();
    if (!task || task.settled) {
      continue;
    }

    if (task.signal?.aborted) {
      settleTask(task, () => {
        task.reject(createNamedError("AbortError", "SVG worker aborted"));
      });
      continue;
    }

    workerState.currentTask = task;

    try {
      ensureWorker().postMessage({ diagram: task.diagram, id: task.id });
    } catch (error) {
      workerState.currentTask = null;
      settleTask(task, () => {
        task.reject(error);
      });
      continue;
    }

    return;
  }

  if (workerState.worker && !workerState.idleTimerId) {
    workerState.idleTimerId = setTimeout(() => {
      workerState.idleTimerId = null;
      if (!workerState.currentTask && workerState.queue.length === 0) {
        terminateWorker();
      }
    }, 0);
  }
};

const failActiveTask = (error) => {
  const activeTask = workerState.currentTask;
  workerState.currentTask = null;
  if (activeTask) {
    settleTask(activeTask, () => {
      activeTask.reject(error);
    });
  }
};

function handleWorkerMessage(message) {
  const activeTask = workerState.currentTask;
  if (!activeTask || !message || message.id !== activeTask.id) {
    return;
  }

  workerState.currentTask = null;
  if (!message.ok) {
    settleTask(activeTask, () => {
      activeTask.reject(deserializeWorkerError(message.error));
    });
  } else {
    settleTask(activeTask, () => {
      activeTask.resolve(parseSvgMarkup(message.svgMarkup));
    });
  }
  pumpQueue();
}

function handleWorkerError(error) {
  terminateWorker();
  failActiveTask(error);
  pumpQueue();
}

function handleWorkerExit(code) {
  detachWorker();
  if (workerState.currentTask) {
    failActiveTask(
      new Error(
        code === 0
          ? "SVG worker stopped unexpectedly"
          : `SVG worker stopped with exit code ${code}`
      )
    );
  }
  pumpQueue();
}

const cancelTask = (task, error) => {
  if (!task || task.settled) {
    return;
  }

  if (workerState.currentTask === task) {
    workerState.currentTask = null;
    settleTask(task, () => {
      task.reject(error);
    });
    terminateWorker();
    pumpQueue();
    return;
  }

  removeQueuedTask(task);
  settleTask(task, () => {
    task.reject(error);
  });
};

/**
 * Function to convert an excalidraw JSON file to an SVG
 * @param {string | object} diagram excalidraw diagram to convert
 * @param {{ timeoutMs?: number, signal?: AbortSignal }=} options
 * @returns {Promise<SVGElement>} SVG XML Node
 */
const excalidrawToSvg = async (diagram, options = {}) => {
  const { timeoutMs, signal } = options || {};

  if (signal?.aborted) {
    return Promise.reject(createNamedError("AbortError", "SVG worker aborted"));
  }

  return new Promise((resolve, reject) => {
    const task = {
      abortHandler: null,
      diagram,
      id: workerState.nextRequestId++,
      reject,
      resolve,
      settled: false,
      signal,
      timeoutId: null,
    };

    if (
      typeof timeoutMs === "number" &&
      Number.isFinite(timeoutMs) &&
      timeoutMs > 0
    ) {
      task.timeoutId = setTimeout(() => {
        cancelTask(
          task,
          createNamedError(
            "TimeoutError",
            `SVG worker timed out after ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
    }

    if (signal) {
      task.abortHandler = () => {
        cancelTask(task, createNamedError("AbortError", "SVG worker aborted"));
      };
      signal.addEventListener("abort", task.abortHandler, { once: true });
    }

    workerState.queue.push(task);
    pumpQueue();
  });
};

module.exports = excalidrawToSvg;
