import { describe, expect, it } from "vitest";
import {
  createRound,
  driftAt,
  CHART_COUNT,
  HIDDEN_STEPS,
  PERSISTENT_DRIFT,
  TEMPORARY_MOVE,
  TOTAL_STEPS,
  VISIBLE_STEPS,
  ROUND_TYPE_WEIGHTS,
  type Round,
} from "../src/game/round";
import { correctAnswer, judge, type Choice } from "../src/game/judge";
import { createGame, publicView } from "../src/game/session";
import { chanceNoiseMovesThisFar } from "../src/game/explain";
import { createRng, parseSeed, newSeed } from "../src/game/rng";

const seeds = (n: number, prefix = "s") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const increments = (points: readonly number[], from: number, to: number) =>
  Array.from({ length: to - from }, (_, k) => points[from + k + 1] - points[from + k]);

/** Many rounds of each type, collected once. */
const byType: Record<Round["type"], Round[]> = { noise: [], persistent: [], temporary: [] };
for (const s of seeds(3000)) {
  const r = createRound(s);
  byType[r.type].push(r);
}

describe("seeds", () => {
  it("reproduce identical rounds", () => {
    for (const s of ["abc123", "zzzz", "k3f92xqa", "0000"]) {
      expect(createRound(s)).toEqual(createRound(s));
    }
  });

  it("differ across seeds", () => {
    expect(createRound("aaaa").charts[0].points).not.toEqual(createRound("aaab").charts[0].points);
  });

  it("match a pinned golden round, so old challenge links keep working", () => {
    // If this fails, the generator changed and every shared link now shows a different round.
    const g = createRound("golden1");
    expect(g.type).toBe("temporary");
    expect(g.specialIndex).toBe(4);
    expect(g.charts[4].rule).toEqual({ kind: "temporary", drift: 17 / 38, start: 6, end: 44 });
    const a = g.charts[0].points.slice(1, 4);
    [-1.3270024942219016, -1.2776299056279854, -2.534393290580913].forEach((v, i) => expect(a[i]).toBeCloseTo(v, 9));
    expect(g.charts[8].points[TOTAL_STEPS]).toBeCloseTo(-5.57516880346335, 9);
  });

  it("produce uniform floats in [0, 1)", () => {
    const rng = createRng("pattern");
    const xs = Array.from({ length: 20000 }, rng);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mean(xs)).toBeCloseTo(0.5, 2);
  });

  it("only accepts plain tokens from URLs", () => {
    expect(parseSeed("AbC123")).toBe("abc123");
    expect(parseSeed("<script>")).toBeNull();
    expect(parseSeed("ab")).toBeNull();
    expect(parseSeed(null)).toBeNull();
    for (let i = 0; i < 50; i++) expect(parseSeed(newSeed())).not.toBeNull();
  });
});

describe("round structure", () => {
  it("every round has nine charts of the right length starting at 0", () => {
    for (const r of [...byType.noise, ...byType.persistent, ...byType.temporary].slice(0, 300)) {
      expect(r.charts).toHaveLength(CHART_COUNT);
      for (const c of r.charts) {
        expect(c.points).toHaveLength(TOTAL_STEPS + 1);
        expect(c.points[0]).toBe(0);
        expect(c.points.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("round types are randomized at their configured rates", () => {
    expect(ROUND_TYPE_WEIGHTS.noise + ROUND_TYPE_WEIGHTS.persistent + ROUND_TYPE_WEIGHTS.temporary).toBeCloseTo(1, 12);
    for (const t of ["noise", "persistent", "temporary"] as const) {
      // 3000 rounds: standard error ≤ 0.0092; allow ~4 SE.
      expect(Math.abs(byType[t].length / 3000 - ROUND_TYPE_WEIGHTS[t])).toBeLessThan(0.037);
    }
  });

  it("special chart positions cover all nine slots", () => {
    const counts = new Array(CHART_COUNT).fill(0);
    for (const r of [...byType.persistent, ...byType.temporary]) counts[r.specialIndex!]++;
    const total = counts.reduce((a, b) => a + b, 0);
    for (const c of counts) {
      expect(c / total).toBeGreaterThan(0.08);
      expect(c / total).toBeLessThan(0.15);
    }
  });

  it("rounds cannot be mutated after generation", () => {
    const r = createRound("frozen");
    expect(() => {
      (r.charts[0].points as number[])[5] = 999;
    }).toThrow();
    expect(Object.isFrozen(r.charts[0].rule)).toBe(true);
  });
});

describe("generating rules", () => {
  it("noise rounds: all nine charts are zero-drift random walks", () => {
    const incs: number[] = [];
    for (const r of byType.noise) {
      expect(r.specialIndex).toBeNull();
      for (const c of r.charts) {
        expect(c.rule.kind).toBe("noise");
        incs.push(...increments(c.points, 0, TOTAL_STEPS));
      }
    }
    // ~900k increments: standard error of the mean ≈ 0.001.
    expect(Math.abs(mean(incs))).toBeLessThan(0.01);
    expect(sd(incs)).toBeCloseTo(1, 1);
  });

  it("persistent rounds: exactly one chart drifts, and keeps drifting through the hidden steps", () => {
    const hidden: number[] = [];
    for (const r of byType.persistent) {
      const kinds = r.charts.map((c) => c.rule.kind);
      expect(kinds.filter((k) => k === "persistent")).toHaveLength(1);
      expect(kinds.filter((k) => k === "noise")).toHaveLength(CHART_COUNT - 1);
      const c = r.charts[r.specialIndex!];
      const rule = c.rule;
      if (rule.kind !== "persistent") throw new Error("expected persistent");
      expect(Math.abs(rule.drift)).toBe(PERSISTENT_DRIFT);
      for (let s = 0; s < TOTAL_STEPS; s++) expect(driftAt(rule, s)).toBe(rule.drift);
      // Normalize sign so up and down drifts can be pooled.
      hidden.push(...increments(c.points, VISIBLE_STEPS, TOTAL_STEPS).map((d) => d * Math.sign(rule.drift)));
    }
    expect(mean(hidden)).toBeGreaterThan(PERSISTENT_DRIFT - 0.03);
    expect(mean(hidden)).toBeLessThan(PERSISTENT_DRIFT + 0.03);
  });

  it("temporary rounds: drift is real while active and ends before the reveal", () => {
    const active: number[] = [];
    const hidden: number[] = [];
    for (const r of byType.temporary) {
      const kinds = r.charts.map((c) => c.rule.kind);
      expect(kinds.filter((k) => k === "temporary")).toHaveLength(1);
      const c = r.charts[r.specialIndex!];
      const rule = c.rule;
      if (rule.kind !== "temporary") throw new Error("expected temporary");
      expect(rule.start).toBeGreaterThanOrEqual(0);
      expect(rule.end).toBeGreaterThan(rule.start);
      expect(rule.end).toBeLessThan(VISIBLE_STEPS); // ends before the line
      expect(Math.abs(rule.drift * (rule.end - rule.start))).toBeCloseTo(TEMPORARY_MOVE, 9);
      for (let s = rule.end; s < TOTAL_STEPS; s++) expect(driftAt(rule, s)).toBe(0);
      const sign = Math.sign(rule.drift);
      active.push(...increments(c.points, rule.start, rule.end).map((d) => (d * sign) / Math.abs(rule.drift)));
      hidden.push(...increments(c.points, VISIBLE_STEPS, TOTAL_STEPS).map((d) => d * sign));
    }
    // Normalized active increments average 1 (i.e. the drift was really applied).
    expect(mean(active)).toBeGreaterThan(0.9);
    expect(mean(active)).toBeLessThan(1.1);
    // After the reveal it is plain noise.
    expect(Math.abs(mean(hidden))).toBeLessThan(0.03);
  });

  it("noise charts in drift rounds are plain noise", () => {
    const incs: number[] = [];
    for (const r of [...byType.persistent, ...byType.temporary]) {
      r.charts.forEach((c, i) => {
        if (i !== r.specialIndex) {
          expect(c.rule.kind).toBe("noise");
          incs.push(...increments(c.points, VISIBLE_STEPS, TOTAL_STEPS));
        }
      });
    }
    expect(Math.abs(mean(incs))).toBeLessThan(0.01);
  });
});

describe("hidden data stays hidden before the choice", () => {
  it("the public view contains only the visible steps and no rules", () => {
    for (const s of seeds(200, "pv")) {
      const r = createRound(s);
      const v = publicView(r);
      const json = JSON.stringify(v);
      expect(json).not.toMatch(/rule|drift|type|special|persistent|temporary/);
      v.charts.forEach((c, i) => {
        expect(c.points).toHaveLength(VISIBLE_STEPS + 1);
        expect(c.points).toEqual(r.charts[i].points.slice(0, VISIBLE_STEPS + 1));
      });
      // No hidden value appears anywhere in the public view.
      const visible = new Set(v.charts.flatMap((c) => c.points.map(String)));
      for (const c of r.charts) {
        for (const p of c.points.slice(VISIBLE_STEPS + 1)) {
          if (!visible.has(String(p))) expect(json).not.toContain(String(p));
        }
      }
      expect(Object.keys(v).sort()).toEqual(["charts", "hiddenSteps", "seed", "visibleSteps"]);
      expect(v.hiddenSteps).toBe(HIDDEN_STEPS);
    }
  });

  it("the game object exposes no round data before lock-in", () => {
    const g = createGame("peek");
    expect(g.revealed).toBe(false);
    expect(Object.keys(g).sort()).toEqual(["lockIn", "revealed", "seed", "view"]);
    expect(JSON.stringify(g)).not.toMatch(/rule|drift|persistent|temporary/);
  });
});

describe("the choice never affects the data", () => {
  it("every possible choice yields the same round", () => {
    const choices: Choice[] = ["none", ...Array.from({ length: CHART_COUNT }, (_, i) => i)];
    for (const s of seeds(40, "c")) {
      const reference = createRound(s);
      for (const choice of choices) {
        const g = createGame(s);
        const before = JSON.stringify(g.view);
        const rv = g.lockIn(choice);
        expect(rv.round).toEqual(reference);
        expect(JSON.stringify(g.view)).toBe(before);
      }
    }
  });

  it("only the first lock-in counts", () => {
    const g = createGame("once");
    const first = g.lockIn(3);
    const second = g.lockIn("none");
    expect(second).toBe(first);
    expect(second.judgement.choice).toBe(3);
  });

  it("rejects invalid choices without revealing", () => {
    const g = createGame("bad");
    expect(() => g.lockIn(9 as Choice)).toThrow();
    expect(() => g.lockIn(-1 as Choice)).toThrow();
    expect(() => g.lockIn(1.5 as Choice)).toThrow();
    expect(g.revealed).toBe(false);
  });
});

describe("scoring matches the round type", () => {
  const all = [...byType.noise.slice(0, 100), ...byType.persistent.slice(0, 100), ...byType.temporary.slice(0, 100)];

  it("exactly one answer is correct per round, and it is the right one", () => {
    for (const r of all) {
      const choices: Choice[] = ["none", ...Array.from({ length: CHART_COUNT }, (_, i) => i)];
      const correct = choices.filter((c) => judge(r, c).correct);
      expect(correct).toHaveLength(1);
      if (r.type === "persistent") expect(correct[0]).toBe(r.specialIndex);
      else expect(correct[0]).toBe("none");
      expect(correctAnswer(r)).toBe(correct[0]);
    }
  });

  it("labels each outcome by round type", () => {
    const p = byType.persistent[0];
    const pOther = (p.specialIndex! + 1) % CHART_COUNT;
    expect(judge(p, p.specialIndex!).outcome).toBe("hit");
    expect(judge(p, "none").outcome).toBe("miss");
    expect(judge(p, pOther).outcome).toBe("wrong-chart");

    const t = byType.temporary[0];
    const tOther = (t.specialIndex! + 1) % CHART_COUNT;
    expect(judge(t, "none").outcome).toBe("correct-none");
    expect(judge(t, t.specialIndex!).outcome).toBe("faded");
    expect(judge(t, t.specialIndex!).correct).toBe(false);
    expect(judge(t, tOther).outcome).toBe("false-alarm");

    const n = byType.noise[0];
    expect(judge(n, "none").outcome).toBe("correct-none");
    expect(judge(n, 4).outcome).toBe("false-alarm");
  });

  it("does not judge by how the revealed data looks", () => {
    // Find a persistent round whose drifting chart happened to fall back during the reveal.
    const r = byType.persistent.find((x) => {
      const c = x.charts[x.specialIndex!];
      const rule = c.rule as { drift: number };
      return (c.points[TOTAL_STEPS] - c.points[VISIBLE_STEPS]) * Math.sign(rule.drift) < 0;
    });
    expect(r).toBeDefined();
    expect(judge(r!, r!.specialIndex!).correct).toBe(true);
  });
});

describe("explanations", () => {
  it("are produced for every outcome without placeholders", () => {
    for (const r of [byType.noise[0], byType.persistent[0], byType.temporary[0]]) {
      for (const c of ["none", 0, r.specialIndex ?? 1, ((r.specialIndex ?? 0) + 1) % CHART_COUNT] as Choice[]) {
        const e = createGame(r.seed).lockIn(c).explanation;
        for (const text of Object.values(e)) {
          expect(text.length).toBeGreaterThan(10);
          expect(text).not.toMatch(/undefined|NaN|null/);
        }
      }
    }
  });

  it("noise-move odds behave sensibly", () => {
    expect(chanceNoiseMovesThisFar(0)).toBeCloseTo(1, 6);
    expect(chanceNoiseMovesThisFar(100)).toBeLessThan(1e-6);
    // One chart, 1 sd: two-sided tail ≈ 31.7%.
    expect(chanceNoiseMovesThisFar(Math.sqrt(60), 60, 1)).toBeCloseTo(0.3173, 3);
  });

  it("noise-move odds match simulation", () => {
    let hits = 0;
    const n = 4000;
    const threshold = 20;
    for (const s of seeds(n, "sim")) {
      const rng = createRng(s);
      let any = false;
      for (let c = 0; c < CHART_COUNT; c++) {
        let x = 0;
        for (let k = 0; k < VISIBLE_STEPS; k++) {
          x += Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
        }
        if (Math.abs(x) >= threshold) any = true;
      }
      if (any) hits++;
    }
    expect(Math.abs(hits / n - chanceNoiseMovesThisFar(threshold))).toBeLessThan(0.025);
  });
});
