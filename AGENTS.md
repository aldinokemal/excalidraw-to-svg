# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-11
**Commit:** 49d12df
**Branch:** main

## OVERVIEW

Node.js library + CLI to convert Excalidraw `.excalidraw` diagrams into standalone SVGs with embedded, subsetted fonts. Published as `@aldinokemal2104/excalidraw-to-svg` on npm.

## STRUCTURE

```
./
├── src/
│   ├── excalidraw-to-svg.js   # Core: JSDOM setup, font embedding, exportToSvg wrapper
│   ├── build-svg-path.js      # Output path resolution for CLI
│   ├── cli.js                 # CLI entry point (bin)
│   ├── index.js               # Package entry (re-exports core)
│   └── *.test.js              # Jest tests
├── assets/                    # Extra font files (Xiaolai.ttf, 22MB)
├── diagrams/                  # Example .excalidraw inputs
├── output/                    # Example .svg outputs (gittracked)
└── test/                      # Manual integration / smoke scripts (run with node)
    ├── sample.js              # Smoke: convert diagrams/sample.excalidraw → output/sample.svg
    ├── import.js              # Standalone JSDOM bootstrap + exportToSvg (debug harness)
    ├── globals-clean.js       # Verify host globals stay clean
    └── warm-worker-impact.js  # Benchmark cold vs warm worker conversion times
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Core conversion logic | `src/excalidraw-to-svg.js` | 356 lines — all critical logic in one file |
| Add/modify font support | `src/excalidraw-to-svg.js` → `FONT_FILE_MAP` | Map font family name → `.ttf` filename |
| Font assets location | `@excalidraw/utils` dist assets dir | Resolved dynamically via `require.resolve` |
| CLI behavior | `src/cli.js` → `src/build-svg-path.js` | Arg parsing + output path resolution |
| Test the library | `npm test` | Jest with `--experimental-vm-modules` |
| Package entry | `package.json` → `main: src/excalidraw-to-svg.js` | NOT `src/index.js` (index just re-exports) |

## CONVENTIONS

- **CommonJS only** — `require`/`module.exports` everywhere, except one `import()` for `@excalidraw/utils` (dynamic import required because it's ESM-only)
- **No build step** — Source files are shipped directly, no transpilation
- **Font subsetting** — Uses `subset-font` to include only glyphs actually used → keeps SVGs small
- **Emoji exclusion** — Emoji codepoints explicitly filtered out of font subsets (system emoji font renders them)
- **Console.error suppression** — Temporarily overrides `console.error` during export to suppress `@excalidraw/utils` font-face warnings in Node env
- **JSDOM on module load** — Browser globals (`window`, `document`, etc.) are set up once at `require()` time via `setupBrowserGlobals()`, polluting `global`
- **Prettier** — Config exists (`.prettierrc.json`) but is empty (defaults)

## ANTI-PATTERNS (THIS PROJECT)

- **DO NOT** add ESM `export` syntax — the package is CJS and dynamically imports the one ESM dep
- **DO NOT** remove `console.error` suppression — `@excalidraw/utils` emits noisy font-face errors in Node
- **DO NOT** inline fonts without subsetting — full embedding produces 2MB+ SVGs

## KEY DEPENDENCIES

| Package | Version | Role |
|---------|---------|------|
| `@excalidraw/utils` | `0.1.3-test32` | Core SVG export (pinned pre-release — **not semver stable**) |
| `jsdom` | `^24.0.0` | Browser env simulation for Node |
| `subset-font` | `^2.4.0` | Font subsetting (TrueType → subset TrueType) |

## COMMANDS

```bash
npm test                        # Run Jest tests (requires --experimental-vm-modules)
npm run test:integration         # test/ scripts (each in its own node process: globals-clean → sample → import → warm)
npx excalidraw-to-svg <input> [output]  # CLI usage
```

## NOTES

- `@excalidraw/utils` is pinned to a **test pre-release** (`0.1.3-test32`) — upgrades may break API
- `assets/Xiaolai.ttf` (22MB) is a CJK font stored in-repo for custom font support — not from `@excalidraw/utils`
- `output/` and `diagrams/` are gittracked but `.npmignore`d from the published package
- `test/import.js` duplicates the JSDOM setup from core — standalone debug harness, not part of Jest
- The `package.json` `main` field points to `src/excalidraw-to-svg.js` directly (not `src/index.js`)
