/** Educational identities only. Never country observations or calibrated forecasts. */
function bounded(value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError("Learning assumption is outside its supported range");
  }
}

export function purchasingPower(priceChange: number, years: number, interest = 0): number {
  bounded(priceChange, -20, 50);
  bounded(years, 1, 10);
  bounded(interest, 0, 30);
  return 100 * ((1 + interest / 100) / (1 + priceChange / 100)) ** years;
}

/** Quote is local-currency units per foreign-currency unit, not currency-value depreciation. */
export function importCost(quoteChange: number, importedShare: number): number {
  bounded(quoteChange, -20, 50);
  bounded(importedShare, 0, 100);
  return 100 * (1 + (quoteChange / 100) * (importedShare / 100));
}
