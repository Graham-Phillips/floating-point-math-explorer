import type { DecimalAdapter, RoundingName } from "../types";

type DecNumberModule = {
  ccall<T>(name: string, returnType: string, argTypes: string[], args: unknown[]): T;
};

type DecNumberModuleOptions = {
  locateFile?: (path: string) => string;
  print?: (...args: unknown[]) => void;
  printErr?: (...args: unknown[]) => void;
  onAbort?: (reason: unknown) => void;
};

const decNumberRoundingModes: RoundingName[] = ["up", "down", "ceil", "floor", "half-up", "half-down", "half-even"];

export async function loadDecNumberAdapter(precision = 34): Promise<DecimalAdapter | null> {
  let factory: ((options?: DecNumberModuleOptions) => Promise<DecNumberModule>) | undefined;

  try {
    const decNumberModuleUrl = new URL("/decnumber/decnumber.mjs", globalThis.location.origin).href;
    const module = (await import(/* @vite-ignore */ decNumberModuleUrl)) as {
      default?: (options?: DecNumberModuleOptions) => Promise<DecNumberModule>;
    };
    factory = module.default;
  } catch {
    return null;
  }

  if (!factory) {
    return null;
  }

  let module: DecNumberModule;
  try {
    module = await withTimeout(
      factory({
        locateFile: (path: string) => `/decnumber/${path}`,
        print: () => undefined,
        printErr: () => undefined,
        onAbort: () => undefined,
      }),
      5000,
    );
  } catch {
    return null;
  }
  const call = (name: string, a: string, b: string) => {
    try {
      return module.ccall<string>(name, "string", ["string", "string", "number"], [a, b, precision]);
    } catch (error) {
      return error instanceof Error ? `Error: ${error.message}` : "Error";
    }
  };
  const round = (value: string, decimals: number, mode: RoundingName) => {
    try {
      return module.ccall<string>(
        "decnumber_round",
        "string",
        ["string", "number", "string", "number"],
        [value, decimals, mode, precision],
      );
    } catch (error) {
      return error instanceof Error ? `Error: ${error.message}` : "Error";
    }
  };

  return {
    id: "decnumber-wasm",
    label: "decNumber WASM",
    family: "wasm",
    status: "optional",
    notes: `IBM decNumber compiled to WebAssembly. Precision is ${precision} significant digits.`,
    supportedRoundingModes: decNumberRoundingModes,
    add: (a, b) => call("decnumber_add", a, b),
    subtract: (a, b) => call("decnumber_subtract", a, b),
    multiply: (a, b) => call("decnumber_multiply", a, b),
    divide: (a, b) => call("decnumber_divide", a, b),
    round,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Timed out loading decNumber WASM")), timeoutMs);
    }),
  ]);
}


