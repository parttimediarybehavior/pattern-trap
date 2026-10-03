/**
 * Round generation. Everything a round will ever show — including the unseen
 * continuation — is produced here, from the seed alone, before the player
 * sees anything. Nothing the player does can reach this code.
 */
import { createRng, randInt, randNormal } from "./rng";

/** Steps shown before the player chooses. */
export const VISIBLE_STEPS = 60;
/** Steps revealed afterwards. */
export const HIDDEN_STEPS = 40;
export const TOTAL_STEPS = VISIBLE_STEPS + HIDDEN_STEPS;
export const CHART_COUNT = 9;
export const CHART_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"] as const;

/** Size of each random step (standard deviation). */
export const NOISE_SD = 1;
/** Per-step drift of the persistent chart. */
export const PERSISTENT_DRIFT = 0.35;
/** Total move a temporary drift adds while it is active. */
export const TEMPORARY_MOVE = 17;
/** Temporary drift starts in [0, TEMP_START_MAX] ... */
export const TEMP_START_MAX = 10;
/** ... and ends in [TEMP_END_MIN, TEMP_END_MAX], always before the reveal. */
export const TEMP_END_MIN = VISIBLE_STEPS - 24;
export const TEMP_END_MAX = VISIBLE_STEPS - 6;

export type RoundType = "noise" | "persistent" | "temporary";
export const ROUND_TYPES: readonly RoundType[] = ["noise", "persistent", "temporary"];
/**
 * How often each round type comes up. Half the rounds contain a real,
 * lasting drift so that always answering "none" is not the best strategy;
 * the other half are the two kinds of trap.
 */
export const ROUND_TYPE_WEIGHTS: Readonly<Record<RoundType, number>> = {
  noise: 0.25,
  persistent: 0.5,
  temporary: 0.25,
};

function pickType(u: number): RoundType {
  let acc = 0;
  for (const t of ROUND_TYPES) {
    acc += ROUND_TYPE_WEIGHTS[t];
    if (u < acc) return t;
  }
  return ROUND_TYPES[ROUND_TYPES.length - 1];
}

export type ChartRule =
  | { kind: "noise" }
  | { kind: "persistent"; drift: number }
  /** Drift applies to steps start+1 .. end (inclusive), i.e. while step index s satisfies start <= s < end. */
  | { kind: "temporary"; drift: number; start: number; end: number };

export interface Chart {
  id: string;
  /** TOTAL_STEPS + 1 values; points[0] = 0. points[k] is the value after step k. */
  points: number[];
  rule: ChartRule;
}

export interface Round {
  seed: string;
  type: RoundType;
  /** Index of the chart carrying drift, or null in a noise-only round. */
  specialIndex: number | null;
  charts: Chart[];
}

/**
 * Expected drift added to step number `s` (0-based: the move from points[s]
 * to points[s+1]).
 */
export function driftAt(rule: ChartRule, s: number): number {
  switch (rule.kind) {
    case "noise":
      return 0;
    case "persistent":
      return rule.drift;
    case "temporary":
      return s >= rule.start && s < rule.end ? rule.drift : 0;
  }
}

/**
 * Build a complete round from a seed. The random draws happen in a fixed
 * order and a fixed amount regardless of round type, so the seed fully
 * determines the round and no later input can shift the sequence.
 */
export function createRound(seed: string): Round {
  const rng = createRng(seed);

  const type = pickType(rng());
  const target = randInt(rng, CHART_COUNT);
  const sign = rng() < 0.5 ? -1 : 1;
  const tempStart = randInt(rng, TEMP_START_MAX + 1);
  const tempEnd = TEMP_END_MIN + randInt(rng, TEMP_END_MAX - TEMP_END_MIN + 1);

  let special: ChartRule = { kind: "noise" };
  if (type === "persistent") {
    special = { kind: "persistent", drift: sign * PERSISTENT_DRIFT };
  } else if (type === "temporary") {
    special = {
      kind: "temporary",
      drift: (sign * TEMPORARY_MOVE) / (tempEnd - tempStart),
      start: tempStart,
      end: tempEnd,
    };
  }

  const charts: Chart[] = [];
  for (let c = 0; c < CHART_COUNT; c++) {
    const rule: ChartRule = type !== "noise" && c === target ? special : { kind: "noise" };
    const points = new Array<number>(TOTAL_STEPS + 1);
    points[0] = 0;
    for (let s = 0; s < TOTAL_STEPS; s++) {
      points[s + 1] = points[s] + driftAt(rule, s) + NOISE_SD * randNormal(rng);
    }
    charts.push({ id: CHART_IDS[c], points, rule });
  }

  return deepFreeze({
    seed,
    type,
    specialIndex: type === "noise" ? null : target,
    charts,
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as object)) deepFreeze(v);
  }
  return value;
}
