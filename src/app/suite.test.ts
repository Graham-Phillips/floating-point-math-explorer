import { describe, expect, it } from "vitest";
import { adapters } from "./adapters";
import {
  defaultConfig,
  findBreakdown,
  findLimits,
  runAccuracySuite,
  runRoundingSuite,
} from "./suite";

describe("floating point comparison suite", () => {
  it("shows the classic JavaScript decimal addition problem", () => {
    const number = adapters.find((adapter) => adapter.id === "number");
    const decimal = adapters.find((adapter) => adapter.id === "decimal");

    expect(number?.add("0.1", "0.2")).toBe("0.30000000000000004");
    expect(decimal?.add("0.1", "0.2")).toBe("0.3");
  });

  it("compares ready adapters against a high-precision decimal oracle", () => {
    const summaries = runAccuracySuite({
      ...defaultConfig,
      seed: 9981,
      samples: 250,
      integerDigits: 6,
      fractionDigits: 6,
      operations: ["add", "subtract", "multiply"],
    });

    const byId = new Map(summaries.map((summary) => [summary.adapterId, summary]));
    expect(byId.get("decimal")?.failures).toBe(0);
    expect(byId.get("bignumber")?.failures).toBe(0);
    expect(byId.get("big")?.failures).toBe(0);
    expect(byId.get("decimal-light")?.failures).toBe(0);
    expect(byId.get("number")?.failures).toBeGreaterThan(0);
  });

  it("uses the selected adapter as the accuracy source of truth", () => {
    const decimal = adapters.find((adapter) => adapter.id === "decimal");
    expect(decimal).toBeDefined();

    const biasedOracle = {
      ...decimal!,
      id: "biased-oracle",
      label: "Biased Oracle",
      add: () => "not-the-decimal-result",
    };

    const summaries = runAccuracySuite(
      {
        ...defaultConfig,
        seed: 1,
        samples: 1,
        integerDigits: 1,
        fractionDigits: 1,
        operations: ["add"],
      },
      [decimal!],
      undefined,
      biasedOracle,
    );

    expect(summaries[0].failures).toBe(1);
    expect(summaries[0].examples[0].expected).toBe("not-the-decimal-result");
  });

  it("checks deterministic rounding mode cases across exact decimal adapters", () => {
    const exactIds = new Set(["decimal", "bignumber", "decimal-light"]);
    const summaries = runRoundingSuite(adapters.filter((adapter) => exactIds.has(adapter.id)));
    const byId = new Map(summaries.map((summary) => [summary.adapterId, summary]));

    expect(byId.get("decimal")?.failures).toBe(0);
    expect(byId.get("bignumber")?.failures).toBe(0);
  });

  it("compares accuracy at the configured decimal-place scale", () => {
    const oracleAdapter = {
      ...adapters[0],
      id: "oracle",
      label: "Oracle",
      add: () => "1.0000000000004",
    };
    const closeAdapter = {
      ...adapters[0],
      id: "close",
      label: "Close",
      add: () => "1.0000000000005",
    };

    const summaries = runAccuracySuite(
      {
        ...defaultConfig,
        seed: 1,
        samples: 1,
        integerDigits: 1,
        fractionDigits: 0,
        operations: ["add"],
        accuracyDecimalPlaces: 12,
      },
      [closeAdapter],
      undefined,
      oracleAdapter,
    );

    expect(summaries[0].failures).toBe(0);
  });

  it("finds rough integer and fractional limits for each adapter", () => {
    const limits = findLimits();
    const number = limits.find((row) => row.adapterId === "number");
    const decimal = limits.find((row) => row.adapterId === "decimal");

    expect(number?.largestFinite).toBe(String(Number.MAX_VALUE));
    expect(decimal?.largestFinite).toBe("configurable");
    expect(decimal?.maxExactIntegerDigits).toBe(40);
  });

  it("reports scale breakdowns for selected adapters", () => {
    const decimal = adapters.find((adapter) => adapter.id === "decimal");
    const number = adapters.find((adapter) => adapter.id === "number");

    expect(decimal).toBeDefined();
    expect(number).toBeDefined();

    const breakdown = findBreakdown(
      {
        ...defaultConfig,
        integerDigits: 16,
        fractionDigits: 8,
        operations: ["multiply"],
        accuracyDecimalPlaces: 4,
      },
      [number!],
      decimal!,
    );

    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].operation).toBe("multiply");
  });
});
