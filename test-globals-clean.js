/**
 * Verification script: proves that globals are NOT polluted by require()
 * or by in-flight conversion work.
 */
const fs = require("fs");

// Capture Node.js native globals BEFORE requiring the library
const nativeFetch = global.fetch;
const hasWindow = "window" in global;
const hasDocument = "document" in global;

console.log("=== BEFORE require() ===");
console.log("global.fetch:", typeof global.fetch);
console.log("global.window exists:", hasWindow);
console.log("global.document exists:", hasDocument);

// Require the library — this USED to pollute globals immediately
const excalidrawToSvg = require("./src/excalidraw-to-svg");

console.log("\n=== AFTER require() (should be unchanged) ===");
console.log("global.fetch:", typeof global.fetch);
console.log("global.fetch same ref:", global.fetch === nativeFetch);
console.log("global.window exists:", "window" in global);
console.log("global.document exists:", "document" in global);

const diagram = fs.readFileSync("./diagrams/sample.excalidraw", "utf8");

(async () => {
  console.log("\n=== DURING conversion (should still be unchanged) ===");
  const pendingSvg = excalidrawToSvg(diagram);
  console.log("global.fetch same ref:", global.fetch === nativeFetch);
  console.log("global.window exists:", "window" in global);
  console.log("global.document exists:", "document" in global);

  const svg = await pendingSvg;
  console.log("SVG generated:", svg.tagName === "svg" ? "✅" : "❌");

  console.log("\n=== AFTER conversion (should be restored) ===");
  console.log("global.fetch:", typeof global.fetch);
  console.log("global.fetch same ref:", global.fetch === nativeFetch);
  console.log("global.window exists:", "window" in global, hasWindow ? "(expected: true — was pre-existing)" : "(expected: false)");
  console.log("global.document exists:", "document" in global, hasDocument ? "(expected: true — was pre-existing)" : "(expected: false)");

  // Final assertions
  const allClean =
    global.fetch === nativeFetch &&
    ("window" in global) === hasWindow &&
    ("document" in global) === hasDocument;

  console.log("\n" + (allClean ? "✅ PASS — globals are clean after conversion" : "❌ FAIL — globals are still polluted"));
  process.exit(allClean ? 0 : 1);
})();
