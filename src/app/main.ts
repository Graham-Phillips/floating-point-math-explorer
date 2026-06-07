import "./styles.css";
import { defaultConfig } from "./suite";
import type {
  AdapterAccuracySummary,
  AdapterRoundingSummary,
  BreakdownFinding,
  FinancialWorkflowSummary,
  LimitFinding,
  Operation,
  PerformanceSummary,
  SuiteConfig,
  SuiteProgress,
  SuiteWorkerResponse,
} from "./types";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

app.innerHTML = `
  <nav class="top-nav" aria-label="Primary">
    <a href="/fp-errors.html">FP Math Errors</a>
    <a href="/attempts.html">Naive Solutions</a>
    <a href="/comparisons.html" aria-current="page">Lab</a>
    <a href="/third-party-libraries.html">Third-Party Libraries</a>
  </nav>
  <section class="toolbar">
    <div>
      <h1>Floating Point Math Lab</h1>
      <p>JavaScript Number, MikeMcl decimal libraries, money libraries, and an optional decNumber WASM bridge.</p>
      <p id="adapterStatus">decNumber WASM not checked yet.</p>
      <p id="oracleStatus">Source of truth: decNumber WASM.</p>
    </div>
    <div class="actions">
      <button id="run">Run Suite</button>
      <button id="cancel" class="secondary" disabled>Cancel</button>
    </div>
  </section>

  <section class="controls" aria-label="suite controls">
    <label>Samples <input id="samples" type="number" min="10" max="200000" step="10" value="${defaultConfig.samples}" /></label>
    <label>Seed <input id="seed" type="number" min="1" max="4294967295" value="${defaultConfig.seed}" /></label>
    <label>Integer digits <input id="integerDigits" type="number" min="1" max="40" value="${defaultConfig.integerDigits}" /></label>
    <label>Fraction digits <input id="fractionDigits" type="number" min="0" max="30" value="${defaultConfig.fractionDigits}" /></label>
    <label>Timing target ms <input id="performanceMinMilliseconds" type="number" min="10" max="1000" step="5" value="${defaultConfig.performanceMinMilliseconds}" /></label>
    <label>decNumber precision <input id="decNumberPrecision" type="number" min="1" max="128" value="${defaultConfig.decNumberPrecision}" /></label>
    <label>Accuracy decimal places <input id="accuracyDecimalPlaces" type="number" min="0" max="80" value="${defaultConfig.accuracyDecimalPlaces}" /></label>
    <label>Source of truth
      <select id="oracleAdapter">
        <option value="decimal">decimal.js</option>
        <option value="decnumber-wasm" selected>decNumber WASM</option>
        <option value="bignumber">bignumber.js</option>
        <option value="big">big.js</option>
        <option value="decimal-light">decimal.js-light</option>
        <option value="currency-js">currency.js</option>
        <option value="dinero">Dinero.js</option>
        <option value="accounting-js">accounting-js</option>
        <option value="moneysafe">moneysafe</option>
        <option value="number">JavaScript Number</option>
      </select>
    </label>
    <fieldset>
      <legend>Operations</legend>
      ${["add", "subtract", "multiply", "divide"].map((op) => `<label><input class="operation" type="checkbox" value="${op}" checked /> ${op}</label>`).join("")}
    </fieldset>
    <div class="toggle-actions">
      <label class="toggle"><input id="includeDecNumber" type="checkbox" checked /> Include decNumber WASM</label>
      <button id="randomSeed" class="secondary compact-button" type="button">Random seed</button>
    </div>
  </section>

  <section class="status" aria-live="polite">
    <div class="status-row">
      <strong id="statusText">Idle</strong>
      <span id="statusDetail">Adjust the limits and run the suite.</span>
    </div>
    <progress id="progress" value="0" max="1"></progress>
  </section>

  <section>
    <article>
      <h2>Performance</h2>
      <div id="performance"></div>
    </article>
  </section>

  <section>
    <article>
      <h2>Accuracy</h2>
      <p id="accuracyNote" class="table-note">Accuracy failures are relative to the selected source of truth after rounding to ${defaultConfig.accuracyDecimalPlaces} decimal places.</p>
      <div id="accuracy"></div>
    </article>
  </section>

  <section>
    <article>
      <h2>Rounding Modes</h2>
      <p class="table-note">Deterministic tie and near-tie cases compared against exact decimal.js rounding for each mode.</p>
      <p class="table-note">The lab tests: up, down, ceil, floor, half-up, half-down, half-even, half-ceil, and half-floor. decNumber supports up, down, ceil, floor, half-up, half-down, and half-even; it does not support half-ceil or half-floor, and has DEC_ROUND_05UP which is not currently tested. Unsupported counts are test cases, not distinct rounding modes.</p>
      <div id="rounding"></div>
    </article>
  </section>

  <section>
    <h2>Limits</h2>
    <div id="limits"></div>
  </section>

  <section>
    <h2>Breakdown Sweep</h2>
    <p class="table-note">Shows the first integer digit count or fraction digit count where an adapter disagrees with the source of truth at the configured accuracy decimal places.</p>
    <div id="breakdown"></div>
  </section>

  <section>
    <h2>Financial Workflow Scenario</h2>
    <p class="table-note">Simulates a transaction and mirrored refund/reversal with price, quantity, rebate, tax, commission, FX conversion, and half-even rounding to 4dp at policy points.</p>
    <pre class="pseudocode"><code>gross = round4(quantity * price)
rebate = round4(gross * rebateRate)
taxable = round4(gross - rebate)
tax = round4(taxable * taxRate)
commission = round4(gross * commissionRate)
localTotal = round4(taxable + tax + commission)
settlement = round4(localTotal * fxRate)

refundSettlement = same calculation with negative quantity
residual = settlement + refundSettlement</code></pre>
    <div id="financialWorkflows"></div>
  </section>

  <section>
    <h2>Adapter Configuration Notes</h2>
    <ul class="critique">
      <li><strong>decimal.js:</strong> configured to 80 significant digits with half-even rounding; calculations are rounded to significant-digit precision.</li>
      <li><strong>decNumber WASM:</strong> configured by the decNumber precision control, defaulting to 80 significant digits; decNumber context precision is significant digits, not decimal places. The underlying IBM decNumber library is arbitrary-precision and also supports fixed decimal32/64/128 formats through separate decimal floating modules.</li>
      <li><strong>bignumber.js:</strong> configured to 80 decimal places for division-like operations; add, subtract, and multiply are generally exact until output or operation limits matter.</li>
      <li><strong>big.js:</strong> configured to 80 decimal places for division with half-even rounding.</li>
      <li><strong>decimal.js-light:</strong> configured to 80 significant digits; arithmetic is truncated at precision rather than rounded in the same way as full decimal.js.</li>
      <li><strong>currency.js:</strong> fixed-scale currency helper. This lab infers precision from operands, but the library is designed primarily for currency-scale values.</li>
      <li><strong>Dinero.js:</strong> money-object library using scaled integer amounts. This lab uses USD and input-inferred scale. Dinero.js v1 had divide and percentage helpers; Dinero.js v2 removes both. Division on integers loses information unless a rounding or allocation policy is explicit.</li>
      <li><strong>accounting-js:</strong> formatting/parsing helper, not an arithmetic engine. This lab runs Number arithmetic and then applies accounting.toFixed to demonstrate that workaround.</li>
      <li><strong>moneysafe:</strong> BigNumber-backed money helper. This lab uses a custom 12dp currency factory.</li>
      <li><strong>JavaScript Number:</strong> IEEE-754 binary64, roughly 15-17 significant decimal digits, binary representation, and overflow to Infinity.</li>
      <li><strong>Accuracy comparison:</strong> expected and actual values are rounded to the configured accuracy decimal places before pass/fail comparison.</li>
    </ul>
  </section>
`;

let worker: Worker | null = null;

function readConfig(): SuiteConfig {
  const operations = [...document.querySelectorAll<HTMLInputElement>(".operation")]
    .filter((input) => input.checked)
    .map((input) => input.value as Operation);

  return {
    seed: Number(document.querySelector<HTMLInputElement>("#seed")?.value || defaultConfig.seed),
    samples: Number(document.querySelector<HTMLInputElement>("#samples")?.value || defaultConfig.samples),
    integerDigits: Number(document.querySelector<HTMLInputElement>("#integerDigits")?.value || defaultConfig.integerDigits),
    fractionDigits: Number(document.querySelector<HTMLInputElement>("#fractionDigits")?.value || defaultConfig.fractionDigits),
    operations: operations.length ? operations : defaultConfig.operations,
    divideByZero: false,
    includeDecNumber: Boolean(document.querySelector<HTMLInputElement>("#includeDecNumber")?.checked),
    oracleAdapterId: document.querySelector<HTMLSelectElement>("#oracleAdapter")?.value || defaultConfig.oracleAdapterId,
    performanceMinMilliseconds: Number(
      document.querySelector<HTMLInputElement>("#performanceMinMilliseconds")?.value || defaultConfig.performanceMinMilliseconds,
    ),
    decNumberPrecision: Number(document.querySelector<HTMLInputElement>("#decNumberPrecision")?.value || defaultConfig.decNumberPrecision),
    accuracyDecimalPlaces: Number(document.querySelector<HTMLInputElement>("#accuracyDecimalPlaces")?.value || defaultConfig.accuracyDecimalPlaces),
  };
}

function renderAccuracy(results: AdapterAccuracySummary[]): string {
  return `
    <div class="table-scroll"><table>
      <thead><tr><th>Adapter</th><th>Total</th><th>Failures</th><th>Max abs error</th><th>Example</th></tr></thead>
      <tbody>
        ${results
          .map((row) => {
            const example = row.examples[0];
            return `<tr>
              <td>${row.adapterLabel}</td>
              <td>${row.total.toLocaleString()}</td>
              <td class="${row.failures ? "bad" : "good"}">${row.failures.toLocaleString()}</td>
              <td>${row.maxAbsoluteError}</td>
              <td>${example ? `${example.a} ${symbol(example.operation)} ${example.b}: expected ${example.expected}, got ${example.actual}` : "none"}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table></div>`;
}

function renderRounding(results: AdapterRoundingSummary[]): string {
  return `
    <div class="table-scroll"><table>
      <thead><tr><th>Adapter</th><th>Total</th><th>Unsupported</th><th>Failures</th><th>Example</th></tr></thead>
      <tbody>
        ${results
          .map((row) => {
            const example = row.examples[0];
            return `<tr>
              <td>${row.adapterLabel}</td>
              <td>${row.total.toLocaleString()}</td>
              <td>${row.unsupported.toLocaleString()}</td>
              <td class="${row.failures ? "bad" : "good"}">${row.failures.toLocaleString()}</td>
              <td>${
                example
                  ? `${example.value} rounded ${example.mode} to ${example.decimals}dp: expected ${example.expected}, got ${example.actual}`
                  : "none"
              }</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table></div>`;
}

function renderPerformance(results: PerformanceSummary[]): string {
  const operations = [...new Set(results.map((row) => row.operation))];
  const adapterLabels = [...new Map(results.map((row) => [row.adapterId, row.adapterLabel])).entries()]
    .map(([adapterId, adapterLabel]) => ({
      adapterId,
      adapterLabel,
      averageOpsPerSecond: average(
        operations
          .map((operation) => results.find((row) => row.adapterId === adapterId && row.operation === operation)?.operationsPerSecond)
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
      ),
    }))
    .sort((a, b) => b.averageOpsPerSecond - a.averageOpsPerSecond);
  const byAdapterAndOperation = new Map(results.map((row) => [`${row.adapterId}:${row.operation}`, row]));

  return `
    <div class="table-scroll"><table class="performance-table">
      <thead>
        <tr>
          <th>Adapter</th>
          <th class="perf-average">Average<br />ops/sec</th>
          ${operations.map((operation, index) => `<th class="perf-ops${index === 0 ? " group-start" : ""}">${operation}<br />ops/sec</th>`).join("")}
          ${operations.map((operation, index) => `<th class="perf-ms${index === 0 ? " group-start" : ""}">${operation}<br />ms</th>`).join("")}
          ${operations.map((operation, index) => `<th class="perf-calls${index === 0 ? " group-start" : ""}">${operation}<br />calls</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${adapterLabels
          .map(({ adapterId, adapterLabel, averageOpsPerSecond }) => {
            const opsPerSecondCells = operations
              .map((operation, index) => {
                const row = byAdapterAndOperation.get(`${adapterId}:${operation}`);
                return `<td class="perf-ops${index === 0 ? " group-start" : ""}">${row ? Math.round(row.operationsPerSecond).toLocaleString() : "-"}</td>`;
              })
              .join("");
            const millisecondCells = operations
              .map((operation, index) => {
                const row = byAdapterAndOperation.get(`${adapterId}:${operation}`);
                return `<td class="perf-ms${index === 0 ? " group-start" : ""}">${row ? row.milliseconds.toFixed(2) : "-"}</td>`;
              })
              .join("");
            const iterationCells = operations
              .map((operation, index) => {
                const row = byAdapterAndOperation.get(`${adapterId}:${operation}`);
                return `<td class="perf-calls${index === 0 ? " group-start" : ""}">${row ? row.iterations.toLocaleString() : "-"}</td>`;
              })
              .join("");

            return `<tr>
              <td>${adapterLabel}</td>
              <td class="perf-average">${Math.round(averageOpsPerSecond).toLocaleString()}</td>
              ${opsPerSecondCells}
              ${millisecondCells}
              ${iterationCells}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table></div>`;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function renderLimits(results: LimitFinding[]): string {
  return `
    <div class="table-scroll"><table>
      <thead><tr><th>Adapter</th><th>Exact integer digits</th><th>Fraction digits</th><th>Smallest</th><th>Largest</th><th>Notes</th></tr></thead>
      <tbody>
        ${results
          .map(
            (row) => `<tr>
              <td>${row.adapterLabel}</td>
              <td>${row.maxExactIntegerDigits}</td>
              <td>${row.maxObservedFractionDigits}</td>
              <td>${row.smallestNonZero}</td>
              <td>${row.largestFinite}</td>
              <td>${row.notes.join("; ") || "within probe range"}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table></div>`;
}

function renderBreakdown(results: BreakdownFinding[]): string {
  const operations = [...new Set(results.map((row) => row.operation))];
  const adapterLabels = [...new Map(results.map((row) => [row.adapterId, row.adapterLabel])).entries()];
  const byAdapterAndOperation = new Map(results.map((row) => [`${row.adapterId}:${row.operation}`, row]));

  return `
    <div class="table-scroll"><table>
      <thead>
        <tr>
          <th>Adapter</th>
          ${operations.map((operation) => `<th>${operation}<br />integer digits</th>`).join("")}
          ${operations.map((operation) => `<th>${operation}<br />fraction digits</th>`).join("")}
          <th>Example</th>
        </tr>
      </thead>
      <tbody>
        ${adapterLabels
          .map(([adapterId, adapterLabel]) => {
            const integerCells = operations
              .map((operation) => {
                const row = byAdapterAndOperation.get(`${adapterId}:${operation}`);
                return `<td>${formatBreakdownLimit(row?.firstIntegerDigitFailure)}</td>`;
              })
              .join("");
            const fractionCells = operations
              .map((operation) => {
                const row = byAdapterAndOperation.get(`${adapterId}:${operation}`);
                return `<td>${formatBreakdownLimit(row?.firstFractionDigitFailure)}</td>`;
              })
              .join("");
            const example = firstBreakdownExample(
              operations.map((operation) => byAdapterAndOperation.get(`${adapterId}:${operation}`)),
            );

            return `<tr>
              <td>${adapterLabel}</td>
              ${integerCells}
              ${fractionCells}
              <td>${formatBreakdownExample(example)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table></div>`;
}

function renderFinancialWorkflows(results: FinancialWorkflowSummary[]): string {
  return `
    <div class="table-scroll"><table>
      <thead>
        <tr>
          <th>Adapter</th>
          <th>Scenario</th>
          <th>Total</th>
          <th>Failures</th>
          <th>Max residual error</th>
          <th>Ops/sec</th>
          <th>Example</th>
        </tr>
      </thead>
      <tbody>
        ${results
          .map((row) => {
            const example = row.examples[0];
            return `<tr>
              <td>${row.adapterLabel}</td>
              <td>${row.scenario}</td>
              <td>${row.total.toLocaleString()}</td>
              <td class="${row.failures ? "bad" : "good"}">${row.failures.toLocaleString()}</td>
              <td>${row.maxResidual}</td>
              <td>${Math.round(row.operationsPerSecond).toLocaleString()}</td>
              <td>${
                example
                  ? `${example.description}: expected ${example.expected}, got ${example.actual}, reversal residual ${example.residual}`
                  : "none"
              }</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table></div>`;
}

function formatBreakdownLimit(value: number | null | undefined): string {
  return value === null || value === undefined ? "within range" : `fails at ${value}`;
}

function firstBreakdownExample(rows: Array<BreakdownFinding | undefined>): BreakdownFinding["integerExample"] {
  const candidates = rows.flatMap((row) => {
    if (!row) {
      return [];
    }

    return [
      row.firstIntegerDigitFailure === null
        ? undefined
        : { failureAt: row.firstIntegerDigitFailure, example: row.integerExample },
      row.firstFractionDigitFailure === null
        ? undefined
        : { failureAt: row.firstFractionDigitFailure, example: row.fractionExample },
    ];
  });

  return candidates
    .filter((candidate): candidate is { failureAt: number; example: NonNullable<BreakdownFinding["integerExample"]> } =>
      Boolean(candidate?.example),
    )
    .sort((a, b) => a.failureAt - b.failureAt)[0]?.example;
}

function formatBreakdownExample(example: BreakdownFinding["integerExample"]): string {
  return example
    ? `${example.a} ${symbol(example.operation)} ${example.b}: expected ${example.expected}, got ${example.actual}`
    : "none";
}

function symbol(operation: Operation): string {
  return { add: "+", subtract: "-", multiply: "x", divide: "/" }[operation];
}

function setRunning(running: boolean): void {
  document.querySelector<HTMLButtonElement>("#run")!.disabled = running;
  document.querySelector<HTMLButtonElement>("#cancel")!.disabled = !running;
}

function renderProgress(progress: SuiteProgress): void {
  const progressElement = document.querySelector<HTMLProgressElement>("#progress")!;
  const text = document.querySelector<HTMLElement>("#statusText")!;
  const detail = document.querySelector<HTMLElement>("#statusDetail")!;
  progressElement.max = Math.max(1, progress.total);
  progressElement.value = progress.completed;
  text.textContent = progress.stage[0].toUpperCase() + progress.stage.slice(1);
  detail.textContent = progress.message;
}

function run(): void {
  worker?.terminate();
  const config = readConfig();
  const oracleSelect = document.querySelector<HTMLSelectElement>("#oracleAdapter");
  const oracleLabel = oracleSelect?.selectedOptions[0]?.textContent || config.oracleAdapterId;
  document.querySelector<HTMLElement>("#oracleStatus")!.textContent = `Source of truth: ${oracleLabel}.`;
  document.querySelector<HTMLElement>("#accuracyNote")!.textContent =
    `Accuracy failures are relative to ${oracleLabel} after rounding to ${config.accuracyDecimalPlaces} decimal places.`;
  worker = new Worker(new URL("./suiteWorker.ts", import.meta.url), { type: "module" });
  setRunning(true);
  document.querySelector<HTMLDivElement>("#accuracy")!.innerHTML = "Running...";
  document.querySelector<HTMLDivElement>("#rounding")!.innerHTML = "Waiting for rounding checks...";
  document.querySelector<HTMLDivElement>("#performance")!.innerHTML = "Waiting for accuracy checks...";
  document.querySelector<HTMLDivElement>("#limits")!.innerHTML = "Waiting...";
  document.querySelector<HTMLDivElement>("#breakdown")!.innerHTML = "Waiting...";
  document.querySelector<HTMLDivElement>("#financialWorkflows")!.innerHTML = "Waiting...";
  renderProgress({ stage: "accuracy", completed: 0, total: config.samples, message: "Starting worker" });

  worker.addEventListener("message", (event: MessageEvent<SuiteWorkerResponse>) => {
    const message = event.data;
    if (message.type === "progress") {
      renderProgress(message.progress);
      return;
    }

    if (message.type === "adapters") {
      const decNumber = message.adapters.find((adapter) => adapter.id === "decnumber-wasm");
      document.querySelector<HTMLElement>("#adapterStatus")!.textContent =
        decNumber?.status === "unavailable"
          ? decNumber.notes
          : decNumber
            ? "decNumber WASM is included in this run."
            : "decNumber WASM is not included; running JS adapters only.";
      return;
    }

    if (message.type === "result") {
      document.querySelector<HTMLDivElement>("#accuracy")!.innerHTML = renderAccuracy(message.accuracy);
      document.querySelector<HTMLDivElement>("#rounding")!.innerHTML = renderRounding(message.rounding);
      document.querySelector<HTMLDivElement>("#performance")!.innerHTML = renderPerformance(message.performance);
      document.querySelector<HTMLDivElement>("#limits")!.innerHTML = renderLimits(message.limits);
      document.querySelector<HTMLDivElement>("#breakdown")!.innerHTML = renderBreakdown(message.breakdown);
      document.querySelector<HTMLDivElement>("#financialWorkflows")!.innerHTML = renderFinancialWorkflows(message.financialWorkflows);
      if (message.complete === false) {
        document.querySelector<HTMLElement>("#adapterStatus")!.textContent =
          "Intermediate results are displayed. decNumber WASM is still running.";
        return;
      }
      setRunning(false);
      worker?.terminate();
      worker = null;
      return;
    }

    document.querySelector<HTMLDivElement>("#accuracy")!.innerHTML = `<p class="bad">${message.message}</p>`;
    setRunning(false);
    worker?.terminate();
    worker = null;
  });

  worker.addEventListener("error", (event) => {
    document.querySelector<HTMLDivElement>("#accuracy")!.innerHTML = `<p class="bad">${event.message}</p>`;
    document.querySelector<HTMLElement>("#statusDetail")!.textContent = "Worker failed before completing the suite.";
    setRunning(false);
    worker?.terminate();
    worker = null;
  });

  worker.addEventListener("messageerror", () => {
    document.querySelector<HTMLDivElement>("#accuracy")!.innerHTML = `<p class="bad">Worker returned an unreadable message.</p>`;
    document.querySelector<HTMLElement>("#statusDetail")!.textContent = "Worker message could not be decoded.";
    setRunning(false);
    worker?.terminate();
    worker = null;
  });

  worker.postMessage({ type: "run", config });
}

document.querySelector<HTMLButtonElement>("#run")?.addEventListener("click", run);
document.querySelector<HTMLButtonElement>("#randomSeed")?.addEventListener("click", () => {
  const seedInput = document.querySelector<HTMLInputElement>("#seed");
  if (!seedInput) {
    return;
  }

  const randomSeed = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 0xffffffff);
  seedInput.value = String(Math.max(1, randomSeed));
});
document.querySelector<HTMLButtonElement>("#cancel")?.addEventListener("click", () => {
  worker?.terminate();
  worker = null;
  setRunning(false);
  renderProgress({ stage: "complete", completed: 0, total: 1, message: "Cancelled" });
});
run();


