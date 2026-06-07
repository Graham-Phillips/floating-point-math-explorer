import { adapters } from "./adapters";
import {
  findBreakdown,
  findLimits,
  runAccuracySuite,
  runFinancialWorkflowSuite,
  runPerformanceSuite,
  runRoundingSuite,
} from "./suite";
import { loadDecNumberAdapter } from "./wasm/decNumberClient";
import type {
  DecimalAdapter,
  SuiteConfig,
  SuiteProgress,
  SuiteWorkerRequest,
  SuiteWorkerResponse,
} from "./types";

function post(response: SuiteWorkerResponse): void {
  self.postMessage(response);
}

function progress(progress: SuiteProgress): void {
  post({ type: "progress", progress });
}

self.addEventListener("message", (event: MessageEvent<SuiteWorkerRequest>) => {
  if (event.data.type !== "run") {
    return;
  }

  void run(event.data);
});

async function run(request: SuiteWorkerRequest): Promise<void> {
  try {
    progress({ stage: "accuracy", completed: 0, total: 1, message: "Preparing adapters" });
    const needsDecNumber = request.config.includeDecNumber || request.config.oracleAdapterId === "decnumber-wasm";
    const decNumberAdapter = needsDecNumber ? await loadDecNumberAdapter(request.config.decNumberPrecision) : null;
    const selectedAdapters = decNumberAdapter && needsDecNumber ? [...adapters, decNumberAdapter] : adapters;
    const oracleAdapter = resolveOracleAdapter(request.config.oracleAdapterId, selectedAdapters, decNumberAdapter);

    if (!oracleAdapter) {
      post({
        type: "error",
        message:
          request.config.oracleAdapterId === "decnumber-wasm"
            ? "decNumber WASM could not be loaded as the source of truth."
            : `Unknown source of truth adapter: ${request.config.oracleAdapterId}`,
      });
      return;
    }

    post({
      type: "adapters",
      adapters: [
        ...selectedAdapters.map(({ id, label, status, notes }) => ({ id, label, status, notes })),
        ...(needsDecNumber && !decNumberAdapter
          ? [
              {
                id: "decnumber-wasm",
                label: "decNumber WASM",
                status: "unavailable" as const,
                notes: "decNumber WASM could not be loaded.",
              },
            ]
          : []),
      ],
    });

    progress({
      stage: "accuracy",
      completed: 0,
      total: request.config.samples,
      message: `Using ${oracleAdapter.label} as source of truth`,
    });
    const accuracy = runAccuracySuite(request.config, selectedAdapters, progress, oracleAdapter);
    const rounding = runRoundingSuite(selectedAdapters, progress);
    const financialWorkflows = runFinancialWorkflowSuite(request.config, selectedAdapters, oracleAdapter, progress);
    const performance = runPerformanceSuite(request.config, selectedAdapters, progress);
    const limits = findLimits(selectedAdapters, progress);
    const breakdown = findBreakdown(request.config, selectedAdapters, oracleAdapter, progress);

    progress({ stage: "complete", completed: 1, total: 1, message: "Suite complete" });
    post({ type: "result", accuracy, rounding, financialWorkflows, performance, limits, breakdown, complete: true });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
}

function resolveOracleAdapter(
  oracleAdapterId: string,
  selectedAdapters: DecimalAdapter[],
  decNumberAdapter: DecimalAdapter | null,
): DecimalAdapter | undefined {
  if (oracleAdapterId === "decnumber-wasm") {
    return decNumberAdapter ?? undefined;
  }

  return selectedAdapters.find((adapter) => adapter.id === oracleAdapterId) ?? adapters.find((adapter) => adapter.id === oracleAdapterId);
}


