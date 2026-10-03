/**
 * Plain-language explanation of a finished round. Pure text, no DOM.
 */
import { CHART_COUNT, NOISE_SD, VISIBLE_STEPS, type Chart, type Round } from "./round";
import type { Judgement } from "./judge";

export interface Explanation {
  headline: string;
  rule: string;
  biggestMover: string;
  ambiguity: string;
}

/** Abramowitz & Stegun 7.1.26, |error| < 1.5e-7. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/**
 * Chance that at least one of `charts` pure-noise walks ends at least `move`
 * away from its start after `steps` steps. Exact for Gaussian steps (the
 * endpoint is Normal(0, sd·√steps)); it looks only at the endpoint.
 */
export function chanceNoiseMovesThisFar(move: number, steps = VISIBLE_STEPS, charts = CHART_COUNT): number {
  const z = Math.abs(move) / (NOISE_SD * Math.sqrt(steps));
  const pOne = 1 - erf(z / Math.SQRT2); // two-sided tail for one chart
  return 1 - Math.pow(1 - pOne, charts);
}

/** Change from the first point to the last visible point. */
export function visibleMove(chart: Chart): number {
  return chart.points[VISIBLE_STEPS] - chart.points[0];
}

/** Index of the chart with the largest visible move (either direction). */
export function biggestMoverIndex(round: Round): number {
  let best = 0;
  for (let i = 1; i < round.charts.length; i++) {
    if (Math.abs(visibleMove(round.charts[i])) > Math.abs(visibleMove(round.charts[best]))) best = i;
  }
  return best;
}

export function formatPercent(p: number): string {
  if (p < 0.01) return "under 1%";
  if (p > 0.99) return "over 99%";
  return `${Math.round(p * 100)}%`;
}

function signed(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : "0";
}

function direction(drift: number): string {
  return drift > 0 ? "upward" : "downward";
}

export function explain(round: Round, j: Judgement): Explanation {
  const name = (i: number) => `chart ${round.charts[i].id}`;
  const Name = (i: number) => `Chart ${round.charts[i].id}`;
  const special = round.specialIndex;
  const picked = j.choice === "none" ? null : j.choice;

  let headline: string;
  switch (j.outcome) {
    case "hit":
      headline = `Right. ${Name(special!)} had a persistent drift.`;
      break;
    case "miss":
      headline = `Missed it. ${Name(special!)} had a steady drift.`;
      break;
    case "wrong-chart":
      headline = `Not that one. ${Name(picked!)} was noise; the steady drift was in ${name(special!)}.`;
      break;
    case "correct-none":
      headline =
        round.type === "temporary"
          ? `Right — and you dodged the trap in ${name(special!)}.`
          : "Right. Every chart was noise.";
      break;
    case "faded":
      headline = `Trapped. ${Name(special!)}'s trend was real, but it had already stopped.`;
      break;
    case "false-alarm":
      headline =
        round.type === "noise"
          ? `Fooled. ${Name(picked!)} was pure noise — they all were.`
          : `Fooled. ${Name(picked!)} was pure noise.`;
      break;
  }

  const noisePart = "each step was a random nudge up or down that averaged zero";
  let rule: string;
  if (round.type === "noise" || special === null) {
    rule = `All nine charts were pure noise: ${noisePart}. Nothing was going anywhere.`;
  } else {
    const r = round.charts[special].rule;
    if (r.kind === "persistent") {
      rule =
        `Eight charts were pure noise: ${noisePart}. ` +
        `${Name(special)} had the same nudges plus a steady ${direction(r.drift)} drift of ` +
        `${Math.abs(r.drift).toFixed(2)} per step, about a third of a typical nudge, that never stopped.`;
    } else if (r.kind === "temporary") {
      rule =
        `Eight charts were pure noise: ${noisePart}. ` +
        `${Name(special)} drifted ${direction(r.drift)} from step ${r.start} to step ${r.end}, ` +
        `then became pure noise, before the ${VISIBLE_STEPS} steps you saw had ended.`;
    } else {
      rule = `All nine charts were pure noise: ${noisePart}.`;
    }
  }

  const b = biggestMoverIndex(round);
  const move = visibleMove(round.charts[b]);
  const odds = formatPercent(chanceNoiseMovesThisFar(move));
  const whatItWas =
    b === special
      ? round.type === "persistent"
        ? "This time it was the real drift."
        : "Its drift was real but had already ended."
      : "It was pure noise.";
  const biggestMover =
    `The biggest mover before the line was ${name(b)} (${signed(move)}). ` +
    `Among nine charts of pure noise, at least one moves that far ${odds} of the time. ${whatItWas}`;

  const ambiguity =
    `Knowing the rule now doesn't mean the first ${VISIBLE_STEPS} steps proved it. ` +
    "A short chart can't fully separate a real trend from a lucky run. Even a perfect player misses some rounds.";

  return { headline, rule, biggestMover, ambiguity };
}
