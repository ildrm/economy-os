import { computeMaterialBalance } from "@economyos/allocation-planning";
import { quasiHyperbolicUtility } from "@economyos/behavioral-economics";

// Executed in the server page. Reuse the governed packages' numerical kernels;
// never ship their Node.js integrity/hashing dependencies into the browser.
export function buildLabPresets() {
  return {
    supply: ["100", "70", null].map((production) => {
      const input = {
        commodityKey: "example_grain",
        unit: "tonnes",
        production,
        imports: "20",
        openingInventory: "10",
        intermediateDemand: "20",
        householdDemand: "60",
        governmentDemand: "10",
        investmentDemand: "0",
        exports: "10",
        closingInventory: "10",
      };
      return { input, result: computeMaterialBalance(input) };
    }),
    choice: ["1", "0.8", "0.5"].map((beta) => ({
      beta,
      delta: "0.95",
      immediate: "80",
      future: "100",
      now: quasiHyperbolicUtility(["80", "0"], beta, "0.95"),
      later: quasiHyperbolicUtility(["0", "100"], beta, "0.95"),
    })),
  };
}
export type LabPresets = ReturnType<typeof buildLabPresets>;
