import Decimal from "decimal.js";
import { absoluteError, adapters, isEqualDecimal, oracle } from "./adapters";
import { decimalString, mulberry32 } from "./random";
import type {
  AccuracyCase,
  AdapterAccuracySummary,
  AdapterRoundingSummary,
  BreakdownFinding,
  DecimalAdapter,
  FinancialWorkflowExample,
  FinancialWorkflowSummary,
  LimitFinding,
  Operation,
  PerformanceSummary,
  RoundingName,
  SuiteProgress,
  SuiteConfig,
} from "./types";

const defaultOperations: Operation[] = ["add", "subtract", "multiply", "divide"];

export const defaultConfig: SuiteConfig = {
  seed: 12345,
  samples: 4000,
  integerDigits: 12,
  fractionDigits: 4,
  operations: defaultOperations,
  divideByZero: false,
  includeDecNumber: true,
  oracleAdapterId: "decnumber-wasm",
  performanceMinMilliseconds: 75,
  decNumberPrecision: 80,
  accuracyDecimalPlaces: 12,
};

export function runAccuracySuite(
  config: SuiteConfig = defaultConfig,
  selectedAdapters: DecimalAdapter[] = adapters,
  onProgress?: (progress: SuiteProgress) => void,
  oracleAdapter?: DecimalAdapter,
): AdapterAccuracySummary[] {
  const rng = mulberry32(config.seed);
  const summaries = new Map<string, AdapterAccuracySummary>();
  const progressEvery = Math.max(1, Math.floor(config.samples / 100));

  for (const adapter of selectedAdapters) {
    summaries.set(adapter.id, {
      adapterId: adapter.id,
      adapterLabel: adapter.label,
      total: 0,
      failures: 0,
      maxAbsoluteError: "0",
      examples: [],
    });
  }

  for (let i = 0; i < config.samples; i += 1) {
    if (i % progressEvery === 0) {
      onProgress?.({
        stage: "accuracy",
        completed: i,
        total: config.samples,
        message: `Checking generated case ${i.toLocaleString()} of ${config.samples.toLocaleString()}`,
      });
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
      let expected: string;
      try {
        expected = oracleAdapter ? oracleAdapter[operation](a, b) : oracle(operation, a, b);
      } catch (error) {
        expected = error instanceof Error ? `Error: ${error.message}` : "Error";
      }

      for (const adapter of selectedAdapters) {
        if (!supportsOperation(adapter, operation)) {
          continue;
        }
        const summary = summaries.get(adapter.id);
        if (!summary) continue;
        summary.total += 1;

        let actual: string;
        try {
          actual = adapter[operation](a, b);
        } catch (error) {
          actual = error instanceof Error ? `Error: ${error.message}` : "Error";
        }

        const expectedForComparison = normalizeForAccuracy(expected, config.accuracyDecimalPlaces);
        const actualForComparison = normalizeForAccuracy(actual, config.accuracyDecimalPlaces);

        if (!isEqualDecimal(expectedForComparison, actualForComparison)) {
          const error = absoluteError(expectedForComparison, actualForComparison);
          summary.failures += 1;
          if (new Decimal(error === "Infinity" ? Number.MAX_VALUE : error).gt(summary.maxAbsoluteError)) {
            summary.maxAbsoluteError = error;
          }
          if (summary.examples.length < 8) {
            summary.examples.push({
              adapterId: adapter.id,
              operation,
              a,
              b,
              expected: expectedForComparison,
              actual: actualForComparison,
              absoluteError: error,
            });
          }
        }
      }
    }
  }

  onProgress?.({
    stage: "accuracy",
    completed: config.samples,
    total: config.samples,
    message: "Accuracy checks complete",
  });

  return [...summaries.values()];
}

function normalizeForAccuracy(value: string, decimalPlaces: number): string {
  if (!Number.isFinite(Number(value))) {
    return value;
  }

  try {
    return new Decimal(value).toDecimalPlaces(Math.max(0, decimalPlaces), Decimal.ROUND_HALF_EVEN).toString();
  } catch {
    return value;
  }
}

const roundingModes: RoundingName[] = [
  "up",
  "down",
  "ceil",
  "floor",
  "half-up",
  "half-down",
  "half-even",
  "half-ceil",
  "half-floor",
];

const roundingCases: Array<{ value: string; decimals: number; modes?: RoundingName[] }> = [
  { value: "2.345", decimals: 2 },
  { value: "-2.345", decimals: 2 },
  { value: "1.005", decimals: 2 },
  { value: "-1.005", decimals: 2 },
  { value: "36895.000005", decimals: 5, modes: ["half-even", "half-up", "half-down"] },
  { value: "1413134246.7569", decimals: 4, modes: ["half-even"] },
  { value: "94452116.9087", decimals: 4, modes: ["half-even"] },
  { value: "999999999.99995", decimals: 4, modes: ["half-even", "half-up", "half-down"] },
];

export function runRoundingSuite(
  selectedAdapters: DecimalAdapter[] = adapters,
  onProgress?: (progress: SuiteProgress) => void,
): AdapterRoundingSummary[] {
  const summaries = new Map<string, AdapterRoundingSummary>();
  const expandedCases = roundingCases.flatMap((item) =>
    (item.modes ?? roundingModes).map((mode) => ({ value: item.value, decimals: item.decimals, mode })),
  );

  for (const adapter of selectedAdapters) {
    summaries.set(adapter.id, {
      adapterId: adapter.id,
      adapterLabel: adapter.label,
      total: 0,
      unsupported: 0,
      failures: 0,
      examples: [],
    });
  }

  let completed = 0;
  const total = selectedAdapters.length * expandedCases.length;
  for (const adapter of selectedAdapters) {
    for (const testCase of expandedCases) {
      onProgress?.({
        stage: "rounding",
        completed,
        total,
        message: `Checking ${adapter.label} ${testCase.mode} rounding`,
      });

      const summary = summaries.get(adapter.id);
      if (!summary) continue;
      summary.total += 1;

      if (!adapter.supportedRoundingModes?.includes(testCase.mode)) {
        summary.unsupported += 1;
        completed += 1;
        continue;
      }

      const expected = exactRound(testCase.value, testCase.decimals, testCase.mode);
      let actual: string;
      try {
        actual = adapter.round(testCase.value, testCase.decimals, testCase.mode);
      } catch (error) {
        actual = error instanceof Error ? `Error: ${error.message}` : "Error";
      }

      if (!isEqualDecimal(expected, actual)) {
        summary.failures += 1;
        if (summary.examples.length < 8) {
          summary.examples.push({
            adapterId: adapter.id,
            value: testCase.value,
            decimals: testCase.decimals,
            mode: testCase.mode,
            expected,
            actual,
            absoluteError: absoluteError(expected, actual),
          });
        }
      }
      completed += 1;
    }
  }

  onProgress?.({
    stage: "rounding",
    completed: total,
    total,
    message: "Rounding checks complete",
  });

  return [...summaries.values()];
}

function exactRound(value: string, decimals: number, mode: RoundingName): string {
  const rounding = {
    "up": Decimal.ROUND_UP,
    "down": Decimal.ROUND_DOWN,
    "ceil": Decimal.ROUND_CEIL,
    "floor": Decimal.ROUND_FLOOR,
    "half-up": Decimal.ROUND_HALF_UP,
    "half-down": Decimal.ROUND_HALF_DOWN,
    "half-even": Decimal.ROUND_HALF_EVEN,
    "half-ceil": Decimal.ROUND_HALF_CEIL,
    "half-floor": Decimal.ROUND_HALF_FLOOR,
  }[mode];

  return new Decimal(value).toDecimalPlaces(decimals, rounding).toString();
}

export function runPerformanceSuite(
  config: SuiteConfig = defaultConfig,
  selectedAdapters: DecimalAdapter[] = adapters,
  onProgress?: (progress: SuiteProgress) => void,
): PerformanceSummary[] {
  const rng = mulberry32(config.seed);
  const cases = Array.from({ length: config.samples }, () => {
    const a = decimalString(rng, config.integerDigits, config.fractionDigits);
    const b = decimalString(rng, config.integerDigits, config.fractionDigits);
    return { a, b: new Decimal(b).isZero() ? "1" : b };
  });

  const results: PerformanceSummary[] = [];
  const total = selectedAdapters.length * config.operations.length;
  let completed = 0;
  for (const adapter of selectedAdapters) {
    for (const operation of config.operations) {
      if (!supportsOperation(adapter, operation)) {
        continue;
      }
      onProgress?.({
        stage: "performance",
        completed,
        total,
        message: `Timing ${adapter.label} ${operation}`,
      });

      for (const item of cases) {
        try {
          adapter[operation](item.a, item.b);
        } catch {
          break;
        }
      }

      const start = performance.now();
      let iterations = 0;
      let failed = false;
      let milliseconds = 0;
      const targetMilliseconds = Math.max(10, config.performanceMinMilliseconds);

      while (milliseconds < targetMilliseconds && !failed) {
        for (const item of cases) {
          try {
            adapter[operation](item.a, item.b);
            iterations += 1;
          } catch {
            failed = true;
            break;
          }
          if (iterations % 100 === 0) {
            milliseconds = performance.now() - start;
            if (milliseconds >= targetMilliseconds) {
              break;
            }
          }
        }
        milliseconds = performance.now() - start;
      }

      results.push({
        adapterId: adapter.id,
        adapterLabel: adapter.label,
        operation,
        iterations,
        milliseconds,
        operationsPerSecond: milliseconds === 0 ? Infinity : (iterations / milliseconds) * 1000,
      });
      completed += 1;
    }
  }

  onProgress?.({
    stage: "performance",
    completed: total,
    total,
    message: "Performance checks complete",
  });
  return results;
}

type FinancialWorkflowInput = {
  quantity: string;
  price: string;
  rebateRate: string;
  taxRate: string;
  commissionRate: string;
  fxRate: string;
};

export function runFinancialWorkflowSuite(
  config: SuiteConfig = defaultConfig,
  selectedAdapters: DecimalAdapter[] = adapters,
  oracleAdapter: DecimalAdapter = adapters.find((adapter) => adapter.id === "decimal") ?? adapters[0],
  onProgress?: (progress: SuiteProgress) => void,
): FinancialWorkflowSummary[] {
  const rng = mulberry32(config.seed ^ 0xa53a9d7b);
  const caseCount = Math.max(10, Math.min(config.samples, 5000));
  const normalCases = Array.from({ length: caseCount }, () => financialCase(rng));
  const boundaryCases = Array.from({ length: caseCount }, (_, index) => financialBoundaryCase(index));
  const scenarios = [
    { label: "Generated", cases: normalCases },
    { label: "Boundary stress", cases: boundaryCases },
  ];
  const summaries: FinancialWorkflowSummary[] = [];

  let completed = 0;
  const total = selectedAdapters.length * scenarios.length;
  for (const scenario of scenarios) {
    for (const adapter of selectedAdapters) {
      onProgress?.({
        stage: "financial-workflows",
        completed,
        total,
        message: `Checking ${scenario.label.toLowerCase()} financial workflow for ${adapter.label}`,
      });

      const summary: FinancialWorkflowSummary = {
        adapterId: adapter.id,
        adapterLabel: adapter.label,
        scenario: scenario.label,
        total: 0,
        failures: 0,
        maxResidual: "0",
        milliseconds: 0,
        operationsPerSecond: 0,
        examples: [],
      };

      const start = performance.now();
      for (const item of scenario.cases) {
        const expectedForward = runFinancialWorkflow(oracleAdapter, item, 1);
        const expectedReverse = runFinancialWorkflow(oracleAdapter, item, -1);
        const actualForward = runFinancialWorkflow(adapter, item, 1);
        const actualReverse = runFinancialWorkflow(adapter, item, -1);
        const expectedResidual = safeAdd(oracleAdapter, expectedForward, expectedReverse);
        const actualResidual = safeAdd(adapter, actualForward, actualReverse);
        const residualError = absoluteError(normalizeWorkflowValue(expectedResidual), normalizeWorkflowValue(actualResidual));
        const valueMatches = isEqualDecimal(normalizeWorkflowValue(expectedForward), normalizeWorkflowValue(actualForward));
        const residualMatches = isEqualDecimal(normalizeWorkflowValue(expectedResidual), normalizeWorkflowValue(actualResidual));

        summary.total += 1;
        if (new Decimal(residualError === "Infinity" ? Number.MAX_VALUE : residualError).gt(summary.maxResidual)) {
          summary.maxResidual = residualError;
        }

        if (!valueMatches || !residualMatches) {
          summary.failures += 1;
          if (summary.examples.length < 6) {
            summary.examples.push(formatWorkflowExample(adapter.id, item, expectedForward, actualForward, actualResidual));
          }
        }
      }

      summary.milliseconds = performance.now() - start;
      summary.operationsPerSecond = summary.milliseconds === 0 ? Infinity : (summary.total / summary.milliseconds) * 1000;
      summaries.push(summary);
      completed += 1;
    }
  }

  onProgress?.({
    stage: "financial-workflows",
    completed,
    total,
    message: "Financial workflow checks complete",
  });

  return summaries;
}

function financialBoundaryCase(index: number): FinancialWorkflowInput {
  const family = index % 8;
  const quantity = ["1.0000", "10.0000", "100.0000", "1000.0000"][index % 4];
  const price = ["1.2550", "2.2550", "10.0750", "16.2350", "19.9000", "36895.0000", "99999.9999", "123456.7891"][
    family
  ];

  return {
    quantity,
    price,
    rebateRate: ["0.005000", "0.010050", "0.012550", "0.025500"][index % 4],
    taxRate: ["0.2000", "0.0750", "0.0500", "0.1900"][index % 4],
    commissionRate: ["0.000500", "0.001255", "0.002255", "0.010075"][index % 4],
    fxRate: ["1.005000", "1.010050", "0.999950", "1.255000"][index % 4],
  };
}

function financialCase(rng: () => number): FinancialWorkflowInput {
  return {
    quantity: fixedDecimal(rng, 1, 250000, 4),
    price: fixedDecimal(rng, 1, 150000, 4),
    rebateRate: rateDecimal(rng, 0, 0.08, 6),
    taxRate: ["0.2", "0.19", "0.075", "0.05"][Math.floor(rng() * 4)],
    commissionRate: rateDecimal(rng, 0, 0.02, 6),
    fxRate: rateDecimal(rng, 0.7, 1.8, 6),
  };
}

function fixedDecimal(rng: () => number, minInteger: number, maxInteger: number, decimals: number): string {
  const integer = Math.floor(minInteger + rng() * Math.max(1, maxInteger - minInteger));
  const fraction = Math.floor(rng() * 10 ** decimals).toString().padStart(decimals, "0");
  return `${integer}.${fraction}`;
}

function rateDecimal(rng: () => number, min: number, max: number, decimals: number): string {
  return new Decimal(min + rng() * (max - min)).toDecimalPlaces(decimals, Decimal.ROUND_HALF_EVEN).toFixed(decimals);
}

function runFinancialWorkflow(adapter: DecimalAdapter, input: FinancialWorkflowInput, sign: 1 | -1): string {
  const signedQuantity = sign === 1 ? input.quantity : `-${input.quantity}`;
  const gross = roundWorkflow(adapter, safeMultiply(adapter, signedQuantity, input.price));
  const rebate = roundWorkflow(adapter, safeMultiply(adapter, gross, input.rebateRate));
  const taxable = roundWorkflow(adapter, safeSubtract(adapter, gross, rebate));
  const tax = roundWorkflow(adapter, safeMultiply(adapter, taxable, input.taxRate));
  const commission = roundWorkflow(adapter, safeMultiply(adapter, gross, input.commissionRate));
  const localTotal = roundWorkflow(adapter, safeAdd(adapter, safeAdd(adapter, taxable, tax), commission));
  return roundWorkflow(adapter, safeMultiply(adapter, localTotal, input.fxRate));
}

function roundWorkflow(adapter: DecimalAdapter, value: string): string {
  if (value.startsWith("Error:")) {
    return value;
  }

  try {
    return adapter.round(value, 4, "half-even");
  } catch (error) {
    return error instanceof Error ? `Error: ${error.message}` : "Error";
  }
}

function safeAdd(adapter: DecimalAdapter, a: string, b: string): string {
  return safeBinary(adapter, "add", a, b);
}

function safeSubtract(adapter: DecimalAdapter, a: string, b: string): string {
  return safeBinary(adapter, "subtract", a, b);
}

function safeMultiply(adapter: DecimalAdapter, a: string, b: string): string {
  return safeBinary(adapter, "multiply", a, b);
}

function safeBinary(adapter: DecimalAdapter, operation: Operation, a: string, b: string): string {
  if (a.startsWith("Error:") || b.startsWith("Error:")) {
    return a.startsWith("Error:") ? a : b;
  }

  try {
    return adapter[operation](a, b);
  } catch (error) {
    return error instanceof Error ? `Error: ${error.message}` : "Error";
  }
}

function normalizeWorkflowValue(value: string): string {
  return normalizeForAccuracy(value, 4);
}

function formatWorkflowExample(
  adapterId: string,
  input: FinancialWorkflowInput,
  expected: string,
  actual: string,
  residual: string,
): FinancialWorkflowExample {
  return {
    adapterId,
    description:
      `qty ${input.quantity}, price ${input.price}, rebate ${input.rebateRate}, tax ${input.taxRate}, ` +
      `commission ${input.commissionRate}, fx ${input.fxRate}`,
    expected: normalizeWorkflowValue(expected),
    actual: normalizeWorkflowValue(actual),
    residual: normalizeWorkflowValue(residual),
  };
}

export function findLimits(
  selectedAdapters: DecimalAdapter[] = adapters,
  onProgress?: (progress: SuiteProgress) => void,
): LimitFinding[] {
  return selectedAdapters.map((adapter, index) => {
    onProgress?.({
      stage: "limits",
      completed: index,
      total: selectedAdapters.length,
      message: `Probing limits for ${adapter.label}`,
    });

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

    return {
      adapterId: adapter.id,
      adapterLabel: adapter.label,
      maxExactIntegerDigits,
      maxObservedFractionDigits,
      smallestNonZero: adapter.family === "native" ? String(Number.MIN_VALUE) : "configurable",
      largestFinite: adapter.family === "native" ? String(Number.MAX_VALUE) : "configurable",
      notes,
    };
  });
}

export function findBreakdown(
  config: SuiteConfig = defaultConfig,
  selectedAdapters: DecimalAdapter[] = adapters,
  oracleAdapter: DecimalAdapter,
  onProgress?: (progress: SuiteProgress) => void,
): BreakdownFinding[] {
  const results: BreakdownFinding[] = [];
  const total = selectedAdapters.length * config.operations.length;
  let completed = 0;

  for (const adapter of selectedAdapters) {
    for (const operation of config.operations) {
      if (!supportsOperation(adapter, operation)) {
        continue;
      }
      onProgress?.({
        stage: "breakdown",
        completed,
        total,
        message: `Sweeping ${adapter.label} ${operation}`,
      });

      const integerSweep = findFirstFailure(config, adapter, oracleAdapter, operation, "integer");
      const fractionSweep = findFirstFailure(config, adapter, oracleAdapter, operation, "fraction");

      results.push({
        adapterId: adapter.id,
        adapterLabel: adapter.label,
        operation,
        firstIntegerDigitFailure: integerSweep.failureAt,
        firstFractionDigitFailure: fractionSweep.failureAt,
        integerExample: integerSweep.example,
        fractionExample: fractionSweep.example,
      });
      completed += 1;
    }
  }

  onProgress?.({
    stage: "breakdown",
    completed: total,
    total,
    message: "Breakdown sweep complete",
  });

  return results;
}
function findFirstFailure(
  config: SuiteConfig,
  adapter: DecimalAdapter,
  oracleAdapter: DecimalAdapter,
  operation: Operation,
  dimension: "integer" | "fraction",
): { failureAt: number | null; example?: AccuracyCase } {
  const max = dimension === "integer" ? Math.max(1, config.integerDigits) : Math.max(0, config.fractionDigits);

  for (let digits = dimension === "integer" ? 1 : 0; digits <= max; digits += 1) {
    const integerDigits = dimension === "integer" ? digits : Math.max(1, Math.min(config.integerDigits, 6));
    const fractionDigits = dimension === "fraction" ? digits : config.accuracyDecimalPlaces;
    const cases = breakdownCases(integerDigits, fractionDigits, operation);

    for (const { a, b } of cases) {
      const expected = safeOperation(oracleAdapter, operation, a, b);
      const actual = safeOperation(adapter, operation, a, b);
      const expectedForComparison = normalizeForAccuracy(expected, config.accuracyDecimalPlaces);
      const actualForComparison = normalizeForAccuracy(actual, config.accuracyDecimalPlaces);

      if (!isEqualDecimal(expectedForComparison, actualForComparison)) {
        return {
          failureAt: digits,
          example: {
            adapterId: adapter.id,
            operation,
            a,
            b,
            expected: expectedForComparison,
            actual: actualForComparison,
            absoluteError: absoluteError(expectedForComparison, actualForComparison),
          },
        };
      }
    }
  }

  return { failureAt: null };
}

function breakdownCases(integerDigits: number, fractionDigits: number, operation: Operation): Array<{ a: string; b: string }> {
  const high = `${"9".repeat(integerDigits)}${fractionDigits ? `.${"9".repeat(fractionDigits)}` : ""}`;
  const mid = `${"7".repeat(integerDigits)}${fractionDigits ? `.${"3".repeat(fractionDigits)}` : ""}`;
  const divisor = `${"1".repeat(Math.max(1, Math.min(integerDigits, 6)))}${fractionDigits ? `.${"2".repeat(fractionDigits)}` : ""}`;

  if (operation === "divide") {
    return [
      { a: high, b: divisor === "0" ? "1" : divisor },
      { a: `-${high}`, b: divisor === "0" ? "1" : divisor },
    ];
  }

  return [
    { a: high, b: mid },
    { a: `-${high}`, b: mid },
  ];
}

function safeOperation(adapter: DecimalAdapter, operation: Operation, a: string, b: string): string {
  try {
    return adapter[operation](a, b);
  } catch (error) {
    return error instanceof Error ? `Error: ${error.message}` : "Error";
  }
}

function supportsOperation(adapter: DecimalAdapter, operation: Operation): boolean {
  return !adapter.supportedOperations || adapter.supportedOperations.includes(operation);
}

