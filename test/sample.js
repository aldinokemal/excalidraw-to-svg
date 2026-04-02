const fs = require("fs");
const path = require("path");
const excalidrawToSvg = require("../src/excalidraw-to-svg");

const repoRoot = path.join(__dirname, "..");
const diagram = fs.readFileSync(
  path.join(repoRoot, "diagrams/sample.excalidraw"),
  "utf8"
);

(async () => {
  try {
    const svg = await excalidrawToSvg(diagram);
    const svgHTML = svg.outerHTML;
    fs.writeFileSync(path.join(repoRoot, "output/sample.svg"), svgHTML);
    console.log("SUCCESS! SVG written to output/sample.svg");
    console.log("SVG size:", svgHTML.length, "bytes");
    console.log("SVG preview:", svgHTML.substring(0, 200));
  } catch (e) {
    console.error("ERROR:", e.message);
    console.error(e.stack);
  }
})();
