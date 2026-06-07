import { describe, expect, it } from "vitest";
import { adapters } from "./adapters";
import type { RoundingName } from "./types";

const cases: Array<[RoundingName, string]> = [
  ["half-up", "2.35"],
  ["half-down", "2.34"],
  ["half-even", "2.34"],
  ["ceil", "2.35"],
  ["floor", "2.34"],
  ["up", "2.35"],
  ["down", "2.34"],
];

describe("rounding mode comparisons", () => {
  it.each(cases)("rounds 2.345 to two places using %s", (mode, expected) => {
    const exactAdapters = adapters.filter((adapter) => adapter.id !== "number" && adapter.id !== "big" && adapter.supportedRoundingModes?.includes(mode));
    for (const adapter of exactAdapters) {
      expect(adapter.round("2.345", 2, mode), adapter.label).toBe(expected);
    }
  });

  it("documents JavaScript Number toFixed tie behavior", () => {
    const number = adapters.find((adapter) => adapter.id === "number");
    const decimal = adapters.find((adapter) => adapter.id === "decimal");

    expect(number).toBeDefined();
    expect(decimal).toBeDefined();
    expect(decimal!.round("2.345", 2, "half-even")).toBe("2.34");
    expect(number!.round("2.345", 2, "half-even")).toBe("2.35");
  });
});
