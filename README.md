# Floating Point Math Comparison Lab

A browser-based TypeScript/Vite lab for comparing JavaScript floating-point behaviour with decimal and money-oriented arithmetic libraries.

The project demonstrates where JavaScript `Number` works, where it exposes binary floating-point artefacts, and how common decimal libraries behave across accuracy, rounding, limits, performance, and financial workflow scenarios.

## What It Compares

The lab currently includes adapters for:

- JavaScript `Number`
- `decimal.js`
- `bignumber.js`
- `big.js`
- `decimal.js-light`
- `currency.js`
- `dinero.js`
- `accounting-js`
- `moneysafe`
- Optional IBM `decNumber` compiled to WebAssembly

The main comparison page can use a selected source of truth, including `decNumber WASM` when the WASM files are available.

## Pages

- `/comparisons.html` - interactive comparison lab
- `/fp-errors.html` - explanation of common floating-point errors
- `/attempts.html` - examples of naive floating-point workarounds
- `/third-party-libraries.html` - notes on third-party decimal and money libraries
- `/index.html` - simple landing entry

## Prerequisites

Install:

- Node.js 20 or newer recommended
- pnpm 10 or newer recommended

Check versions:

```sh
node --version
pnpm --version
```

## Clone And Install

```sh
git clone <repo-url>
cd gp-fp-compare
pnpm install
```

The repository includes `pnpm-lock.yaml`, so `pnpm install` should install a reproducible dependency set.

## Run Locally

```sh
pnpm dev
```

Vite starts on `127.0.0.1`. Open the URL printed by Vite, then go to:

```text
/comparisons.html
```

## Test

```sh
pnpm test
```

The test suite uses Vitest and covers the suite engine, adapter comparison behaviour, and deterministic rounding checks.

For watch mode:

```sh
pnpm test:watch
```

## Build

```sh
pnpm run build
```

This runs TypeScript checking and then builds the Vite multi-page app into `dist/`.

Preview the production build:

```sh
pnpm preview
```

## Optional decNumber WASM

The app can compare against IBM `decNumber` compiled to WebAssembly. Prebuilt files are expected under:

```text
public/decnumber/decnumber.mjs
public/decnumber/decnumber.wasm
```

If those files are present, the comparison worker can load the WASM adapter. If they are missing or fail to load, the UI reports that `decNumber WASM` is unavailable.

To rebuild the WASM bridge, install Emscripten first, then run:

```sh
pnpm run build:decnumber
```

The source bridge is in:

```text
src/app/wasm/decnumber_bridge.c
```

The vendored decNumber source is under:

```text
src/decNumber/
```

## Useful Scripts

```sh
pnpm dev              # start Vite dev server
pnpm test             # run Vitest once
pnpm test:watch       # run Vitest in watch mode
pnpm run build        # type-check and build production assets
pnpm preview          # preview dist/ locally
pnpm run build:decnumber  # rebuild optional decNumber WASM bridge
```

## Project Structure

```text
src/app/                 comparison app, adapters, workers, suite logic, tests
src/app/wasm/            decNumber WASM bridge/client code
src/decNumber/           vendored decNumber C sources
public/decnumber/        runtime WASM/JS files loaded by the browser worker
*.html                   Vite multi-page entry files
scripts/                 helper scripts
```

## Notes

- Accuracy comparisons round expected and actual values to the configured decimal-place scale before pass/fail comparison.
- Some libraries are money-formatting or money-object libraries rather than general decimal arithmetic engines; the lab includes them to make those tradeoffs visible.
- Performance numbers are browser/runtime-dependent and should be read as comparative lab output, not absolute benchmark claims.
