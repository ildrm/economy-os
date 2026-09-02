import { fileURLToPath } from "node:url";

import { bundleWorkflowCode } from "@temporalio/worker";
import { describe, expect, it } from "vitest";

describe("Temporal ingestion workflow", () => {
  it("bundles without importing nondeterministic Node.js modules", async () => {
    const bundle = await bundleWorkflowCode({
      workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
    });
    expect(bundle.code.length).toBeGreaterThan(1_000);
    expect(bundle.code).toContain("ingestDataset");
    expect(bundle.code).toContain("deliverReleaseNotifications");
  }, 30_000);
});
