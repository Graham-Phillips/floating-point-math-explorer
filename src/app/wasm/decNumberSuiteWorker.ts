import Decimal from "decimal.js";
import { absoluteError, isEqualDecimal, oracle } from "../adapters";
import { decimalString, mulberry32 } from "../random";
import type { AdapterAccuracySummary, DecimalAdapter, LimitFinding, PerformanceSummary, SuiteConfig, SuiteProgress } from "../types";
import { loadDecNumberAdapter } from "./decNumberClient";

function progress(progress: SuiteProgress): void {
  self.postMessage({ type: "progress", progress });
}

self.addEventListener("message", (event: MessageEvent<SuiteConfig>) => {
  void run(event.data);
});

async function run(config: SuiteConfig): Promise<void> {
  try {
    progress({ stage: "accuracy", completed: 0, total: 1, message: "Loading decNumber WASM" });
    const adapter = await loadDecNumberAdapter();

    if (!adapter) {
      self.postMessage({ type: "error", message: "WASM module did not load" });
      return;
    }

    const accuracy = await runDecNumberAccuracySuite(config, adapter);
    const performance = await runDecNumberPerformanceSuite(config, adapter);
    const limits = await findDecNumberLimits(adapter);

    self.postMessage({
      adapter: {
        id: adapter.id,
        label: adapter.label,
        status: adapter.status,
        notes: adapter.notes,
      },
      accuracy,
      performance,
      limits,
    });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
}

async function runDecNumberAccuracySuite(config: SuiteConfig, adapter: DecimalAdapter): Promise<AdapterAccuracySummary[]> {
  const rng = mulberry32(config.seed);
  const summary: AdapterAccuracySummary = {
    adapterId: adapter.id,
    adapterLabel: adapter.label,
    total: 0,
    failures: 0,
    maxAbsoluteError: "0",
    examples: [],
  };
  const progressEvery = Math.max(1, Math.floor(config.samples / 100));

  for (let i = 0; i < config.samples; i += 1) {
    if (i % progressEvery === 0) {
      progress({
        stage: "accuracy",
        completed: i,
        total: config.samples,
        message: `Checking decNumber generated case ${i.toLocaleString()} of ${config.samples.toLocaleString()}`,
      });
      await yieldToWorker();
    }

    const a = decimalString(rng, config.integerDigits, config.fractionDigits);
    let b = decimalString(rng, config.integerDigits, config.fractionDigits);
    if (!config.divideByZero && new Decimal(b).isZero()) {
      b = "1";
    }

    for (const operation of config.operations) {
      if (operation === "divide" && !config.divideByZero && new Decimal(b).isZero()) {
        continue;
      }

      const expected = oracle(operation, a, b);
      summary.total += 1;

      let actual: string;
      try {
        actual = adapter[operation](a, b);
      } catch (error) {
        actual = error instanceof Error ? `Error: ${error.message}` : "Error";
      }

      if (!isEqualDecimal(expected, actual)) {
        const error = absoluteError(expected, actual);
        summary.failures += 1;
        if (new Decimal(error === "Infinity" ? Number.MAX_VALUE : error).gt(summary.maxAbsoluteError)) {
          summary.maxAbsoluteError = error;
        }
        if (summary.examples.length < 8) {
          summary.examples.push({ adapterId: adapter.id, operation, a, b, expected, actual, absoluteError: error });
        }
      }
    }
  }

  progress({
    stage: "accuracy",
    completed: config.samples,
    total: config.samples,
    message: "decNumber accuracy checks complete",
  });

  return [summary];
}

async function runDecNumberPerformanceSuite(config: SuiteConfig, adapter: DecimalAdapter): Promise<PerformanceSummary[]> {
  const rng = mulberry32(config.seed);
  const cases = Array.from({ length: config.samples }, () => {
    const a = decimalString(rng, config.integerDigits, config.fractionDigits);
    const b = decimalString(rng, config.integerDigits, config.fractionDigits);
    return { a, b: new Decimal(b).isZero() ? "1" : b };
  });

  const results: PerformanceSummary[] = [];
  for (let operationIndex = 0; operationIndex < config.operations.length; operationIndex += 1) {
    const operation = config.operations[operationIndex];
    progress({
      stage: "performance",
      completed: operationIndex,
      total: config.operations.length,
      message: `Timing decNumber ${operation}`,
    });
    await yieldToWorker();

    const start = performance.now();
    for (const item of cases) {
      try {
        adapter[operation](item.a, item.b);
      } catch {
        break;
      }
    }
    const milliseconds = performance.now() - start;

    results.push({
      adapterId: adapter.id,
      adapterLabel: adapter.label,
      operation,
      iterations: cases.length,
      milliseconds,
      operationsPerSecond: milliseconds === 0 ? Infinity : (cases.length / milliseconds) * 1000,
    });
  }

  progress({
    stage: "performance",
    completed: config.operations.length,
    total: config.operations.length,
    message: "decNumber performance checks complete",
  });

  return results;
}

async function findDecNumberLimits(adapter: DecimalAdapter): Promise<LimitFinding[]> {
  progress({
    stage: "limits",
    completed: 0,
    total: 1,
    message: "Probing limits for decNumber WASM",
  });
  await yieldToWorker();

  let maxExactIntegerDigits = 0;
  const notes: string[] = [];

  for (let digits = 1; digits <= 40; digits += 1) {
    const value = "9".repeat(digits);
    try {
      const actual = adapter.add(value, "1");
      const expected = new Decimal(value).plus(1).toString();
      if (isEqualDecimal(expected, actual)) {
        maxExactIntegerDigits = digits;
      } else {
        notes.push(`first integer add mismatch at ${digits} digits`);
        break;
      }
    } catch {
      notes.push(`integer add failed at ${digits} digits`);
      break;
    }
  }

  let maxObservedFractionDigits = 0;
  for (let digits = 1; digits <= 30; digits += 1) {
    const value = `0.${"0".repeat(digits - 1)}1`;
    try {
      const actual = adapter.add(value, value);
      const expected = new Decimal(value).plus(value).toString();
      if (isEqualDecimal(expected, actual)) {
        maxObservedFractionDigits = digits;
      } else {
        notes.push(`first fractional add mismatch at ${digits} decimal places`);
        break;
      }
    } catch {
      notes.push(`fractional add failed at ${digits} decimal places`);
      break;
    }
  }

  return [
    {
      adapterId: adapter.id,
      adapterLabel: adapter.label,
      maxExactIntegerDigits,
      maxObservedFractionDigits,
      smallestNonZero: "configurable",
      largestFinite: "configurable",
      notes,
    },
  ];
}

function yieldToWorker(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}


