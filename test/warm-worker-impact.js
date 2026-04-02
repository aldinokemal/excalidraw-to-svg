const fs = require("fs");
const path = require("path");
const { performance } = require("node:perf_hooks");
const excalidrawToSvg = require("../src/excalidraw-to-svg");

const repoRoot = path.join(__dirname, "..");

/**
 * Benchmark real cold vs warm conversion times (main thread + worker).
 * Sequential awaits keep the worker hot: idle teardown only schedules setTimeout(0).
 *
 * Usage (from repo root):
 *   node test/warm-worker-impact.js [diagram.excalidraw] [runs]
 * Defaults: diagrams/sample.excalidraw, 5 runs (min 2).
 */

const argv = process.argv.slice(2);
const diagramPath =
  argv[0] || path.join(repoRoot, "diagrams", "sample.excalidraw");
const iterations = Math.max(2, parseInt(argv[1] || "5", 10) || 5);

(async () => {
  if (!fs.existsSync(diagramPath)) {
    console.error("File not found:", diagramPath);
    process.exit(1);
  }

  const diagram = fs.readFileSync(diagramPath, "utf8");
  const timesMs = [];

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const svg = await excalidrawToSvg(diagram);
    timesMs.push(performance.now() - t0);
    if (!svg || svg.tagName !== "svg") {
      throw new Error(`Run ${i + 1}: expected SVG root`);
    }
  }

  const cold = timesMs[0];
  const warmSamples = timesMs.slice(1);
  const warmAvg =
    warmSamples.reduce((a, b) => a + b, 0) / warmSamples.length;
  const warmMin = Math.min(...warmSamples);
  const warmMax = Math.max(...warmSamples);
  const ratio = warmAvg > 0 ? cold / warmAvg : 0;
  const pctFaster = cold > 0 ? (1 - warmAvg / cold) * 100 : 0;

  console.log("Warm worker impact (real timings, not mocked)");
  console.log("Diagram:  ", diagramPath);
  console.log("Runs:     ", iterations, "(back-to-back awaits)");
  console.log("");
  console.log("Per-run duration (ms):");
  timesMs.forEach((ms, i) => {
    const label = i === 0 ? "cold" : "warm";
    console.log(`  ${String(i + 1).padStart(2)}. ${ms.toFixed(2)}  (${label})`);
  });
  console.log("");
  console.log(`Cold (run 1):        ${cold.toFixed(2)} ms`);
  console.log(
    `Warm (runs 2–${iterations}, avg): ${warmAvg.toFixed(2)} ms  (min ${warmMin.toFixed(2)}, max ${warmMax.toFixed(2)})`
  );
  console.log(
    `Cold / warm avg:     ${ratio.toFixed(2)}×  (~${pctFaster.toFixed(1)}% faster warm)`
  );
})().catch((e) => {
  console.error("ERROR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
