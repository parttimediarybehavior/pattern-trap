/**
 * Scoring. An answer is judged only against the rule that generated the
 * round — never against how the revealed data happened to look.
 */
import type { Round } from "./round";

/** A chart index (0–8) or "none" for “No persistent pattern”. */
export type Choice = number | "none";

export type Outcome =
  | "hit" //            persistent round, picked the drifting chart
  | "miss" //           persistent round, said none
  | "wrong-chart" //    persistent round, picked a noise chart
  | "correct-none" //   noise or temporary round, said none
  | "faded" //          temporary round, picked the chart whose drift had stopped
  | "false-alarm"; //   noise or temporary round, picked a noise chart

export interface Judgement {
  choice: Choice;
  correctAnswer: Choice;
  correct: boolean;
  outcome: Outcome;
}

/** The only right answer: the persistent chart if there is one, otherwise "none". */
export function correctAnswer(round: Round): Choice {
  return round.type === "persistent" && round.specialIndex !== null ? round.specialIndex : "none";
}

export function isValidChoice(choice: unknown, chartCount: number): choice is Choice {
  return (
    choice === "none" ||
    (typeof choice === "number" && Number.isInteger(choice) && choice >= 0 && choice < chartCount)
  );
}

export function judge(round: Round, choice: Choice): Judgement {
  if (!isValidChoice(choice, round.charts.length)) {
    throw new Error(`Invalid choice: ${String(choice)}`);
  }
  const answer = correctAnswer(round);
  const correct = choice === answer;
  let outcome: Outcome;
  switch (round.type) {
    case "persistent":
      outcome = correct ? "hit" : choice === "none" ? "miss" : "wrong-chart";
      break;
    case "temporary":
      outcome = correct ? "correct-none" : choice === round.specialIndex ? "faded" : "false-alarm";
      break;
    case "noise":
      outcome = correct ? "correct-none" : "false-alarm";
      break;
  }
  return { choice, correctAnswer: answer, correct, outcome };
}
