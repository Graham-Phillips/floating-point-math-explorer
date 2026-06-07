const moduleUrl = new URL("./decnumber.mjs", import.meta.url).href;
const wasmUrl = new URL("./decnumber.wasm", import.meta.url).href;
const functionNames = new Set([
  "decnumber_add",
  "decnumber_subtract",
  "decnumber_multiply",
  "decnumber_divide",
]);

const form = document.querySelector("#callForm");
const statusNode = document.querySelector("#status");
const logNode = document.querySelector("#log");
const runSamplesButton = document.querySelector("#runSamples");

let mainThreadModulePromise;

log(`Harness loaded at ${new Date().toISOString()}`);
log(`Module URL: ${moduleUrl}`);
log(`WASM URL:   ${wasmUrl}`);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void callFromForm();
});

runSamplesButton.addEventListener("click", () => {
  void runSampleMatrix();
});

async function callFromForm() {
  const data = readForm();
  if (!functionNames.has(data.operation)) {
    setStatus(`Unknown function: ${data.operation}`, true);
    return;
  }

  await callAndDisplay(data);
}

async function runSampleMatrix() {
  const base = readForm();
  const samples = [
    ["decnumber_add", "0.1", "0.2"],
    ["decnumber_subtract", "1.0000000000000001", "1"],
    ["decnumber_multiply", "123456789.123456789", "0.000000001"],
    ["decnumber_divide", "1", "3"],
    ["decnumber_divide", "1", "0"],
    ["decnumber_add", "9.999999999999999999999999999999999E+6144", "1"],
    ["decnumber_multiply", "1E-6143", "1E-10"],
  ];

  runSamplesButton.disabled = true;
  try {
    for (const [operation, left, right] of samples) {
      await callAndDisplay({ ...base, operation, left, right });
    }
  } finally {
    runSamplesButton.disabled = false;
  }
}

async function callAndDisplay({ mode, operation, left, right, precision, timeoutMs }) {
  setStatus(`${operation} running via ${mode}`);
  const started = performance.now();

  try {
    const result =
      mode === "main"
        ? await callOnMainThread(operation, left, right, precision)
        : await callInWorker(operation, left, right, precision, timeoutMs);
    const elapsedMs = performance.now() - started;

    setStatus(`${operation} returned in ${formatMs(elapsedMs)}`);
    logResult({ operation, left, right, precision, mode, elapsedMs, result });
  } catch (error) {
    const elapsedMs = performance.now() - started;
    const message = error instanceof Error ? error.message : String(error);

    setStatus(`${operation} failed after ${formatMs(elapsedMs)}`, true);
    logResult({ operation, left, right, precision, mode, elapsedMs, error: message });
  }
}

async function callOnMainThread(operation, left, right, precision) {
  const module = await getMainThreadModule();
  return module.ccall(operation, "string", ["string", "string", "number"], [left, right, precision]);
}

async function getMainThreadModule() {
  mainThreadModulePromise ??= import(moduleUrl).then((loaded) => {
    if (typeof loaded.default !== "function") {
      throw new Error("decnumber.mjs did not export an Emscripten module factory");
    }

    return loaded.default({
      locateFile: (path) => new URL(path, moduleUrl).href,
      print: (...args) => log(`[stdout] ${args.join(" ")}`),
      printErr: (...args) => log(`[stderr] ${args.join(" ")}`),
      onAbort: (reason) => log(`[abort] ${String(reason)}`),
    });
  });

  return mainThreadModulePromise;
}

function callInWorker(operation, left, right, precision, timeoutMs) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(createWorkerUrl(), { type: "module" });
    let settled = false;

    const timeout = window.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      worker.terminate();
      reject(new Error(`Worker timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    worker.addEventListener("message", (event) => {
      if (settled) {
        return;
      }

      const message = event.data;
      if (message.type === "log") {
        log(`[worker] ${message.message}`);
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      worker.terminate();

      if (message.type === "result") {
        resolve(message.result);
      } else {
        reject(new Error(message.message || "Worker failed"));
      }
    });

    worker.addEventListener("error", (event) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message));
    });

    worker.postMessage({ moduleUrl, operation, left, right, precision });
  });
}

let workerObjectUrl;

function createWorkerUrl() {
  if (workerObjectUrl) {
    return workerObjectUrl;
  }

  const workerSource = `
    let modulePromise;

    self.addEventListener("message", (event) => {
      call(event.data).catch((error) => {
        self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
      });
    });

    async function call({ moduleUrl, operation, left, right, precision }) {
      modulePromise ??= import(moduleUrl).then((loaded) => {
        if (typeof loaded.default !== "function") {
          throw new Error("decnumber.mjs did not export an Emscripten module factory");
        }

        return loaded.default({
          locateFile: (path) => new URL(path, moduleUrl).href,
          print: (...args) => self.postMessage({ type: "log", message: "[stdout] " + args.join(" ") }),
          printErr: (...args) => self.postMessage({ type: "log", message: "[stderr] " + args.join(" ") }),
          onAbort: (reason) => self.postMessage({ type: "log", message: "[abort] " + String(reason) }),
        });
      });

      const module = await modulePromise;
      const result = module.ccall(operation, "string", ["string", "string", "number"], [left, right, precision]);
      self.postMessage({ type: "result", result });
    }
  `;

  workerObjectUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
  return workerObjectUrl;
}

function readForm() {
  const data = new FormData(form);
  return {
    mode: String(data.get("mode") || "worker"),
    operation: String(data.get("operation") || "decnumber_add"),
    left: String(data.get("left") || ""),
    right: String(data.get("right") || ""),
    precision: clampInteger(data.get("precision"), 34, 1, 128),
    timeoutMs: clampInteger(data.get("timeoutMs"), 2000, 100, 60000),
  };
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function logResult(result) {
  log(JSON.stringify(result, null, 2));
}

function log(message) {
  logNode.textContent += `${message}\n`;
  logNode.scrollTop = logNode.scrollHeight;
}

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle("error", isError);
}

function formatMs(ms) {
  return `${ms.toFixed(1)} ms`;
}
