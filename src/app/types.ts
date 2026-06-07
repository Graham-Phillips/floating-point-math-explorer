export type Operation = "add" | "subtract" | "multiply" | "divide";

export type RoundingName =
  | "up"
  | "down"
  | "ceil"
  | "floor"
  | "half-up"
  | "half-down"
  | "half-even"
  | "half-ceil"
  | "half-floor";

export interface DecimalAdapter {
  id: string;
  label: string;
  family: "native" | "mikemcl" | "wasm" | "money" | "formatting";
  status: "ready" | "optional" | "unavailable";
  notes: string;
  supportedOperations?: Operation[];
  supportedRoundingModes?: RoundingName[];
  add(a: string, b: string): string;
  subtract(a: string, b: string): string;
  multiply(a: string, b: string): string;
  divide(a: string, b: string): string;
  round(value: string, decimals: number, mode: RoundingName): string;
}

export interface SuiteConfig {
  seed: number;
  samples: number;
  integerDigits: number;
  fractionDigits: number;
  operations: Operation[];
  divideByZero: boolean;
  includeDecNumber: boolean;
  oracleAdapterId: string;
  performanceMinMilliseconds: number;
  decNumberPrecision: number;
  accuracyDecimalPlaces: number;
}

export interface AccuracyCase {
  adapterId: string;
  operation: Operation;
  a: string;
  b: string;
  expected: string;
  actual: string;
  absoluteError: string;
}

export interface AdapterAccuracySummary {
  adapterId: string;
  adapterLabel: string;
  total: number;
  failures: number;
  maxAbsoluteError: string;
  examples: AccuracyCase[];
}

export interface RoundingCase {
  adapterId: string;
  value: string;
  decimals: number;
  mode: RoundingName;
  expected: string;
  actual: string;
  absoluteError: string;
}

export interface AdapterRoundingSummary {
  adapterId: string;
  adapterLabel: string;
  total: number;
  unsupported: number;
  failures: number;
  examples: RoundingCase[];
}

export interface PerformanceSummary {
  adapterId: string;
  adapterLabel: string;
  operation: Operation;
  iterations: number;
  milliseconds: number;
  operationsPerSecond: number;
}

export interface FinancialWorkflowExample {
  adapterId: string;
  description: string;
  expected: string;
  actual: string;
  residual: string;
}

export interface FinancialWorkflowSummary {
  adapterId: string;
  adapterLabel: string;
  scenario: string;
  total: number;
  failures: number;
  maxResidual: string;
  milliseconds: number;
  operationsPerSecond: number;
  examples: FinancialWorkflowExample[];
}

export interface LimitFinding {
  adapterId: string;
  adapterLabel: string;
  maxExactIntegerDigits: number;
  maxObservedFractionDigits: number;
  smallestNonZero: string;
  largestFinite: string;
  notes: string[];
}

export interface BreakdownFinding {
  adapterId: string;
  adapterLabel: string;
  operation: Operation;
  firstIntegerDigitFailure: number | null;
  firstFractionDigitFailure: number | null;
  integerExample?: AccuracyCase;
  fractionExample?: AccuracyCase;
}

export interface SuiteProgress {
  stage:
    | "accuracy"
    | "rounding"
    | "performance"
    | "limits"
    | "breakdown"
    | "financial-workflows"
    | "complete";
  completed: number;
  total: number;
  message: string;
}

export type SuiteWorkerRequest = {
  type: "run";
  config: SuiteConfig;
};

export type SuiteWorkerResponse =
  | { type: "adapters"; adapters: Array<Pick<DecimalAdapter, "id" | "label" | "status" | "notes">> }
  | { type: "progress"; progress: SuiteProgress }
  | {
      type: "result";
      accuracy: AdapterAccuracySummary[];
      rounding: AdapterRoundingSummary[];
      financialWorkflows: FinancialWorkflowSummary[];
      performance: PerformanceSummary[];
      limits: LimitFinding[];
      breakdown: BreakdownFinding[];
      complete?: boolean;
    }
  | { type: "error"; message: string };




