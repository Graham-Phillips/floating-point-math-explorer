import { toFixed as accountingToFixed } from "accounting-js";
import Big from "big.js";
import BigNumber from "bignumber.js";
import currency from "currency.js";
import Decimal from "decimal.js";
import DecimalLight from "decimal.js-light";
import { add as dineroAdd, dinero, down, halfDown, halfEven, halfUp, multiply as dineroMultiply, subtract as dineroSubtract, toDecimal, transformScale, up, USD } from "dinero.js";
import { createCurrency } from "moneysafe";
import type { DecimalAdapter, RoundingName } from "./types";

Decimal.set({ precision: 80, rounding: Decimal.ROUND_HALF_EVEN });
BigNumber.config({ DECIMAL_PLACES: 80, ROUNDING_MODE: BigNumber.ROUND_HALF_EVEN });
Big.DP = 80;
Big.RM = Big.roundHalfEven;
DecimalLight.set({ precision: 80, rounding: DecimalLight.ROUND_HALF_EVEN });
const moneySafeDecimal = createCurrency({ decimals: 12 });

const allRoundingModes: RoundingName[] = [
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

export function canonical(value: string | number): string {
  if (value === "NaN" || value === "Infinity" || value === "-Infinity") {
    return String(value);
  }
  return new Decimal(value).toString();
}

export function absoluteError(expected: string, actual: string): string {
  if (!Number.isFinite(Number(expected)) || !Number.isFinite(Number(actual))) {
    return expected === actual ? "0" : "Infinity";
  }
  return new Decimal(expected).minus(actual).abs().toString();
}

export function isEqualDecimal(expected: string, actual: string): boolean {
  if (expected === actual) {
    return true;
  }
  if (!Number.isFinite(Number(expected)) || !Number.isFinite(Number(actual))) {
    return false;
  }
  return new Decimal(expected).equals(actual);
}

export function oracle(operation: "add" | "subtract" | "multiply" | "divide", a: string, b: string): string {
  const left = new Decimal(a);
  const right = new Decimal(b);
  if (operation === "add") return left.plus(right).toString();
  if (operation === "subtract") return left.minus(right).toString();
  if (operation === "multiply") return left.times(right).toString();
  return right.isZero() ? (left.isNegative() ? "-Infinity" : "Infinity") : left.dividedBy(right).toString();
}

function decimalRounding(mode: RoundingName): Decimal.Rounding {
  return {
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
}

function bigNumberRounding(mode: RoundingName): BigNumber.RoundingMode {
  return {
    "up": BigNumber.ROUND_UP,
    "down": BigNumber.ROUND_DOWN,
    "ceil": BigNumber.ROUND_CEIL,
    "floor": BigNumber.ROUND_FLOOR,
    "half-up": BigNumber.ROUND_HALF_UP,
    "half-down": BigNumber.ROUND_HALF_DOWN,
    "half-even": BigNumber.ROUND_HALF_EVEN,
    "half-ceil": BigNumber.ROUND_HALF_CEIL,
    "half-floor": BigNumber.ROUND_HALF_FLOOR,
  }[mode];
}

function bigRounding(mode: RoundingName): 0 | 1 | 2 | 3 {
  if (mode === "down" || mode === "floor" || mode === "half-down" || mode === "half-floor") return Big.roundDown;
  if (mode === "up" || mode === "ceil" || mode === "half-ceil") return Big.roundUp;
  if (mode === "half-even") return Big.roundHalfEven;
  return Big.roundHalfUp;
}

function decimalPlacesFromString(value: string): number {
  const normalized = value.toLowerCase();
  if (normalized.includes("e")) {
    return Math.max(0, new Decimal(value).decimalPlaces());
  }

  return normalized.split(".")[1]?.length ?? 0;
}

function dineroAmount(value: string, scale = decimalPlacesFromString(value)): ReturnType<typeof dinero> {
  const amount = new Decimal(value).times(new Decimal(10).pow(scale)).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
  return dinero({ amount, currency: USD, scale });
}

function decimalRatio(value: string): { amount: number; scale: number } {
  const scale = decimalPlacesFromString(value);
  return {
    amount: new Decimal(value).times(new Decimal(10).pow(scale)).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber(),
    scale,
  };
}

function dineroRounding(mode: RoundingName) {
  return {
    "up": up,
    "down": down,
    "half-up": halfUp,
    "half-down": halfDown,
    "half-even": halfEven,
  }[mode];
}

function currencyPrecision(...values: string[]): number {
  return Math.max(2, ...values.map(decimalPlacesFromString));
}

function accountingOperation(operation: "add" | "subtract" | "multiply" | "divide", a: string, b: string): string {
  const left = Number(a);
  const right = Number(b);
  const result =
    operation === "add"
      ? left + right
      : operation === "subtract"
        ? left - right
        : operation === "multiply"
          ? left * right
          : left / right;
  const precision =
    operation === "multiply"
      ? decimalPlacesFromString(a) + decimalPlacesFromString(b)
      : operation === "divide"
        ? 12
        : Math.max(decimalPlacesFromString(a), decimalPlacesFromString(b));

  return canonical(accountingToFixed(result, Math.min(80, precision)));
}

export const adapters: DecimalAdapter[] = [
  {
    id: "number",
    label: "JavaScript Number",
    family: "native",
    status: "ready",
    notes: "IEEE-754 binary64: fast, finite precision, decimal values are often inexact.",
    supportedRoundingModes: [],
    add: (a, b) => canonical(Number(a) + Number(b)),
    subtract: (a, b) => canonical(Number(a) - Number(b)),
    multiply: (a, b) => canonical(Number(a) * Number(b)),
    divide: (a, b) => canonical(Number(a) / Number(b)),
    round: (v, d) => canonical(Number(Number(v).toFixed(d))),
  },
  {
    id: "decimal",
    label: "decimal.js",
    family: "mikemcl",
    status: "ready",
    notes: "Arbitrary-precision Decimal with broad rounding and transcendental support.",
    supportedRoundingModes: allRoundingModes,
    add: (a, b) => new Decimal(a).plus(b).toString(),
    subtract: (a, b) => new Decimal(a).minus(b).toString(),
    multiply: (a, b) => new Decimal(a).times(b).toString(),
    divide: (a, b) => new Decimal(a).dividedBy(b).toString(),
    round: (v, d, mode) => new Decimal(v).toDecimalPlaces(d, decimalRounding(mode)).toString(),
  },
  {
    id: "bignumber",
    label: "bignumber.js",
    family: "mikemcl",
    status: "ready",
    notes: "Arbitrary-precision decimal arithmetic tuned for financial-style operations.",
    supportedRoundingModes: allRoundingModes,
    add: (a, b) => new BigNumber(a).plus(b).toString(),
    subtract: (a, b) => new BigNumber(a).minus(b).toString(),
    multiply: (a, b) => new BigNumber(a).times(b).toString(),
    divide: (a, b) => new BigNumber(a).dividedBy(b).toString(),
    round: (v, d, mode) => new BigNumber(v).decimalPlaces(d, bigNumberRounding(mode)).toString(),
  },
  {
    id: "big",
    label: "big.js",
    family: "mikemcl",
    status: "ready",
    notes: "Smaller arbitrary-precision decimal package with fewer rounding modes.",
    supportedRoundingModes: ["up", "down", "half-up", "half-even"],
    add: (a, b) => new Big(a).plus(b).toString(),
    subtract: (a, b) => new Big(a).minus(b).toString(),
    multiply: (a, b) => new Big(a).times(b).toString(),
    divide: (a, b) => new Big(a).div(b).toString(),
    round: (v, d, mode) => new Big(v).round(d, bigRounding(mode)).toString(),
  },
  {
    id: "decimal-light",
    label: "decimal.js-light",
    family: "mikemcl",
    status: "ready",
    notes: "Smaller decimal.js variant with core arbitrary-precision decimal arithmetic.",
    supportedRoundingModes: allRoundingModes,
    add: (a, b) => new DecimalLight(a).plus(b).toString(),
    subtract: (a, b) => new DecimalLight(a).minus(b).toString(),
    multiply: (a, b) => new DecimalLight(a).times(b).toString(),
    divide: (a, b) => new DecimalLight(a).dividedBy(b).toString(),
    round: (v, d, mode) => new DecimalLight(v).toDecimalPlaces(d, decimalRounding(mode)).toString(),
  },
  {
    id: "currency-js",
    label: "currency.js",
    family: "money",
    status: "ready",
    notes: "Fixed-scale currency helper backed by integer cents/minor units. Precision is inferred per operation for this lab.",
    supportedRoundingModes: [],
    add: (a, b) => currency(a, { precision: currencyPrecision(a, b) }).add(b).value.toString(),
    subtract: (a, b) => currency(a, { precision: currencyPrecision(a, b) }).subtract(b).value.toString(),
    multiply: (a, b) => currency(a, { precision: currencyPrecision(a, b) }).multiply(Number(b)).value.toString(),
    divide: (a, b) => currency(a, { precision: currencyPrecision(a, b) }).divide(Number(b)).value.toString(),
    round: (v, d) => currency(v, { precision: d }).value.toString(),
  },
  {
    id: "dinero",
    label: "Dinero.js",
    family: "money",
    status: "ready",
    notes: "Money-object library using scaled integer amounts. Dinero.js v1 had divide and percentage helpers; v2 removes both. Division on integers loses information without an explicit rounding or allocation policy.",
    supportedOperations: ["add", "subtract", "multiply"],
    supportedRoundingModes: ["up", "down", "half-up", "half-down", "half-even"],
    add: (a, b) => toDecimal(dineroAdd(dineroAmount(a), dineroAmount(b))),
    subtract: (a, b) => toDecimal(dineroSubtract(dineroAmount(a), dineroAmount(b))),
    multiply: (a, b) => toDecimal(dineroMultiply(dineroAmount(a), decimalRatio(b))),
    divide: () => "Error: Dinero.js v2 does not expose divide in this package.",
    round: (v, d, mode) => {
      const rounding = dineroRounding(mode);
      if (!rounding) {
        return `Error: unsupported rounding mode ${mode}`;
      }
      return toDecimal(transformScale(dineroAmount(v), d, rounding));
    },
  },
  {
    id: "accounting-js",
    label: "accounting-js",
    family: "formatting",
    status: "ready",
    notes: "Formatting/parsing library, not an arithmetic engine. The lab uses Number arithmetic followed by accounting.toFixed to show this workaround.",
    supportedRoundingModes: [],
    add: (a, b) => accountingOperation("add", a, b),
    subtract: (a, b) => accountingOperation("subtract", a, b),
    multiply: (a, b) => accountingOperation("multiply", a, b),
    divide: (a, b) => accountingOperation("divide", a, b),
    round: (v, d) => canonical(accountingToFixed(Number(v), d)),
  },
  {
    id: "moneysafe",
    label: "moneysafe",
    family: "money",
    status: "ready",
    notes: "BigNumber-backed money helper. This lab uses a custom 12dp currency factory so it can participate in precision comparisons.",
    supportedRoundingModes: [],
    add: (a, b) => moneySafeDecimal(a).plus(moneySafeDecimal(b)).toFixed(12).replace(/\.?0+$/, ""),
    subtract: (a, b) => moneySafeDecimal(a).minus(moneySafeDecimal(b)).toFixed(12).replace(/\.?0+$/, ""),
    multiply: (a, b) => moneySafeDecimal(a).times(moneySafeDecimal(b)).toFixed(12).replace(/\.?0+$/, ""),
    divide: (a, b) => moneySafeDecimal(a).div(moneySafeDecimal(b)).toFixed(12).replace(/\.?0+$/, ""),
    round: (v, d) => moneySafeDecimal(v).toFixed(d).replace(/\.?0+$/, ""),
  },
];



