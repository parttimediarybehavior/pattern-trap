/**
 * One round of play. The presentation layer gets only the public view
 * (visible steps, no rules) until the player locks in an answer. Locking in
 * reads the round that was already generated; it never generates data.
 */
import { createRound, CHART_COUNT, HIDDEN_STEPS, VISIBLE_STEPS, type Round } from "./round";
import { judge, isValidChoice, type Choice, type Judgement } from "./judge";
import { explain, type Explanation } from "./explain";

export interface PublicChart {
  id: string;
  /** VISIBLE_STEPS + 1 values. Nothing beyond the line. */
  points: readonly number[];
}

export interface PublicView {
  seed: string;
  visibleSteps: number;
  hiddenSteps: number;
  charts: readonly PublicChart[];
}

export interface Reveal {
  round: Round;
  judgement: Judgement;
  explanation: Explanation;
}

export interface Game {
  readonly seed: string;
  readonly view: PublicView;
  /** Lock in an answer. Only the first call counts; later calls return the same reveal. */
  lockIn(choice: Choice): Reveal;
  readonly revealed: boolean;
}

export function publicView(round: Round): PublicView {
  return Object.freeze({
    seed: round.seed,
    visibleSteps: VISIBLE_STEPS,
    hiddenSteps: HIDDEN_STEPS,
    charts: Object.freeze(
      round.charts.map((c) =>
        Object.freeze({ id: c.id, points: Object.freeze(c.points.slice(0, VISIBLE_STEPS + 1)) }),
      ),
    ),
  });
}

export function createGame(seed: string): Game {
  const round = createRound(seed);
  const view = publicView(round);
  let reveal: Reveal | null = null;

  return {
    seed,
    view,
    get revealed() {
      return reveal !== null;
    },
    lockIn(choice: Choice): Reveal {
      if (reveal) return reveal;
      if (!isValidChoice(choice, CHART_COUNT)) throw new Error(`Invalid choice: ${String(choice)}`);
      const judgement = judge(round, choice);
      reveal = { round, judgement, explanation: explain(round, judgement) };
      return reveal;
    },
  };
}
