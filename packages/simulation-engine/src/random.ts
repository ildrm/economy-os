import { createHash } from "node:crypto";

import { assertKey, assertNonnegativeIntegerText, digestJson } from "./internals.js";

const UINT64_MASK = (1n << 64n) - 1n;
const TWO_POW_53 = 9_007_199_254_740_992;

export interface RandomStreamIdentity {
  readonly seed: string;
  readonly partitions: readonly string[];
  readonly streamSha256: string;
}

function initialState(seed: string, partitions: readonly string[]): bigint {
  const digest = createHash("sha256").update(digestJson({ seed, partitions })).digest("hex");
  return BigInt(`0x${digest.slice(0, 16)}`);
}

function splitMix64(value: bigint): [bigint, bigint] {
  const state = (value + 0x9e3779b97f4a7c15n) & UINT64_MASK;
  let output = state;
  output = ((output ^ (output >> 30n)) * 0xbf58476d1ce4e5b9n) & UINT64_MASK;
  output = ((output ^ (output >> 27n)) * 0x94d049bb133111ebn) & UINT64_MASK;
  return [state, (output ^ (output >> 31n)) & UINT64_MASK];
}

export class DeterministicRandomStream {
  readonly identity: Readonly<RandomStreamIdentity>;
  #state: bigint;

  constructor(seed: string, partitions: readonly string[]) {
    assertNonnegativeIntegerText(seed, "random seed");
    if (partitions.length === 0 || partitions.length > 16) {
      throw new TypeError("random stream requires 1..16 partition keys");
    }
    for (const [index, partition] of partitions.entries()) {
      assertKey(partition, `random partition[${index}]`);
    }
    this.identity = Object.freeze({
      seed,
      partitions: Object.freeze([...partitions]),
      streamSha256: digestJson({ seed, partitions }),
    });
    this.#state = initialState(seed, partitions);
  }

  nextUnitInterval(): number {
    const [state, output] = splitMix64(this.#state);
    this.#state = state;
    return Number(output >> 11n) / TWO_POW_53;
  }

  uniform(lower: number, upper: number): number {
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) {
      throw new TypeError("uniform draw bounds must be finite and ordered");
    }
    if (lower === upper) return lower;
    return lower + this.nextUnitInterval() * (upper - lower);
  }
}

export function createRandomStream(
  seed: string,
  partitions: readonly string[],
): DeterministicRandomStream {
  return new DeterministicRandomStream(seed, partitions);
}
