/**
 * Screens and input. All game rules live in ../game; this file only shows
 * what the game hands it.
 */
import { createGame, type Game, type Reveal } from "../game/session";
import { createRound, CHART_COUNT, HIDDEN_STEPS, TOTAL_STEPS, VISIBLE_STEPS } from "../game/round";
import type { Choice } from "../game/judge";
import { newSeed } from "../game/rng";
import { createChartCard, domainOf, pathFor, type ChartCard } from "./chart";
import { challengeUrl, shareChallenge } from "./share";

export interface AppOptions {
  /** Seed from a challenge link, if any. */
  seed: string | null;
  /** Override motion preference (tests). */
  reducedMotion?: boolean;
  /** Update the address bar (off in tests). */
  updateUrl?: boolean;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) el.className = cls;
  Object.assign(el, rest);
  el.append(...children);
  return el;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function mountApp(root: HTMLElement, opts: AppOptions) {
  const score = { played: 0, correct: 0 };
  const prefersReduced = () =>
    opts.reducedMotion ?? window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  let game: Game | null = null;
  let cards: ChartCard[] = [];
  let radios: HTMLElement[] = [];
  let selection: Choice | null = null;
  let lockButton: HTMLButtonElement | null = null;
  let resultSlot: HTMLElement | null = null;
  let live: HTMLElement | null = null;
  let scoreEl: HTMLElement | null = null;
  let frame = 0;

  function setUrl(seed: string) {
    if (opts.updateUrl === false) return;
    history.replaceState(null, "", challengeUrl(seed));
  }

  // ---------- Opening screen ----------

  function showIntro() {
    root.replaceChildren();
    const deco = createRound("pattern-trap-intro").charts[4].points;
    const d = domainOf([deco], 10);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 300 200");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("intro-line");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", pathFor(deco, 0, TOTAL_STEPS, d));
    p.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(p);

    const play = h("button", { class: "primary", type: "button" }, opts.seed ? "Play challenge" : "Play");
    play.addEventListener("click", () => startRound(opts.seed ?? newSeed()));

    const intro = h(
      "section",
      { class: "intro" },
      svg,
      h("p", { class: "eyebrow" }, "A game about noise"),
      h("h1", {}, "Pattern Trap"),
      h("p", { class: "lede" }, `Nine lines wander for ${VISIBLE_STEPS} steps. Is one of them really going somewhere?`),
      h(
        "ol",
        { class: "steps" },
        h("li", {}, "Pick the chart with a trend that will last, or say there isn’t one."),
        h("li", {}, `Watch the next ${HIDDEN_STEPS} steps.`),
        h("li", {}, "See how every chart was made."),
      ),
      ...(opts.seed ? [h("p", { class: "challenge-note" }, "You’ve been sent challenge ", h("code", {}, opts.seed), ".")] : []),
      play,
    );
    root.append(intro);
  }

  // ---------- Round ----------

  function startRound(seed: string) {
    cancelAnimationFrame(frame);
    game = createGame(seed);
    selection = null;
    setUrl(seed);

    const view = game.view;
    const domain = domainOf(view.charts.map((c) => c.points));

    cards = view.charts.map((c, i) => createChartCard(c, i, view.visibleSteps, TOTAL_STEPS));
    cards.forEach((c) => c.draw(domain));

    const none = h(
      "div",
      { class: "none", tabIndex: -1 },
      h("span", {}, "No persistent pattern"),
      h("kbd", {}, "0"),
    );
    none.querySelector("kbd")?.setAttribute("aria-hidden", "true");
    none.setAttribute("role", "radio");
    none.setAttribute("aria-checked", "false");
    none.dataset.choice = "none";

    radios = [...cards.map((c) => c.root), none];
    radios[0].tabIndex = 0;
    radios.forEach((r) => r.addEventListener("click", () => onRadioClick(r)));

    const group = h("div", { class: "choices" }, h("div", { class: "grid" }, ...cards.map((c) => c.root)), none);
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-labelledby", "prompt");
    group.addEventListener("keydown", onGroupKey);

    lockButton = h("button", { class: "primary lock", type: "button", disabled: true }, "Lock in");
    lockButton.addEventListener("click", lockIn);

    scoreEl = h("span", { class: "score" });
    renderScore();

    live = h("div", { class: "sr-only" });
    live.setAttribute("aria-live", "polite");
    resultSlot = h("div", { class: "result-slot" });

    root.replaceChildren(
      h(
        "header",
        { class: "bar" },
        h("span", { class: "brand" }, "Pattern Trap"),
        h("span", { class: "seed" }, "Challenge ", h("code", {}, seed)),
        scoreEl,
      ),
      h(
        "section",
        { class: "board" },
        h("h2", { class: "prompt", id: "prompt", tabIndex: -1 }, "Which chart has a pattern that will last?"),
        h(
          "p",
          { class: "hint" },
          `Each shows ${VISIBLE_STEPS} steps. The shaded area is what happens next.`,
          h("span", { class: "keys" }, " Keys: 1–9 to pick, 0 for none, Enter to lock in."),
        ),
        group,
        h("div", { class: "actions" }, lockButton),
        resultSlot,
        live,
      ),
    );
    // Focus the question, not a chart, so nothing looks pre-selected.
    root.querySelector<HTMLElement>("#prompt")?.focus({ preventScroll: true });
    window.scrollTo?.({ top: 0 });
  }

  function renderScore() {
    if (scoreEl) scoreEl.textContent = score.played ? `${score.correct} / ${score.played} right` : "";
  }

  function choiceOf(el: HTMLElement): Choice {
    return el.dataset.choice === "none" ? "none" : Number(el.dataset.choice);
  }

  function select(choice: Choice, focus = false) {
    if (!game || game.revealed) return;
    selection = choice;
    for (const r of radios) {
      const on = choiceOf(r) === choice;
      r.setAttribute("aria-checked", String(on));
      r.tabIndex = on ? 0 : -1;
      if (on && focus) r.focus();
    }
    if (lockButton) lockButton.disabled = false;
  }

  function onRadioClick(r: HTMLElement) {
    select(choiceOf(r), true);
  }

  function onGroupKey(e: KeyboardEvent) {
    if (!game || game.revealed) return;
    const idx = radios.indexOf(document.activeElement as HTMLElement);
    if (idx < 0) return;
    let next = -1;
    const noneIdx = CHART_COUNT;
    switch (e.key) {
      case "ArrowRight":
        next = idx === noneIdx ? 0 : idx + 1;
        break;
      case "ArrowLeft":
        next = idx === 0 ? noneIdx : idx - 1;
        break;
      case "ArrowDown":
        next = idx === noneIdx ? 1 : idx + 3 >= CHART_COUNT ? noneIdx : idx + 3;
        break;
      case "ArrowUp":
        next = idx === noneIdx ? 7 : idx - 3 < 0 ? noneIdx : idx - 3;
        break;
      case " ":
        e.preventDefault();
        select(choiceOf(radios[idx]), true);
        return;
      default:
        return;
    }
    e.preventDefault();
    select(choiceOf(radios[next]), true);
  }

  function onGlobalKey(e: KeyboardEvent) {
    if (!game || game.revealed || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    const k = e.key.toLowerCase();
    if (/^[1-9]$/.test(k)) {
      select(Number(k) - 1, true);
    } else if (/^[a-i]$/.test(k)) {
      select(k.charCodeAt(0) - 97, true);
    } else if (k === "0" || k === "n") {
      select("none", true);
    } else if (k === "enter" && target?.tagName !== "BUTTON") {
      if (selection !== null) {
        e.preventDefault();
        lockIn();
      }
    } else {
      return;
    }
  }
  document.addEventListener("keydown", onGlobalKey);

  // ---------- Reveal ----------

  function lockIn() {
    if (!game || game.revealed || selection === null) return;
    const reveal = game.lockIn(selection);
    score.played++;
    if (reveal.judgement.correct) score.correct++;

    for (const r of radios) {
      r.setAttribute("aria-disabled", "true");
      r.classList.add("locked");
    }
    lockButton?.remove();
    lockButton = null;
    root.querySelector(".board")?.classList.add("revealed");

    annotate(reveal);
    animate(reveal, () => showResult(reveal));
  }

  function annotate(reveal: Reveal) {
    const { round, judgement } = reveal;
    round.charts.forEach((chart, i) => {
      const card = cards[i];
      const r = chart.rule;
      let note: string;
      if (r.kind === "persistent") {
        note = `steady drift ${r.drift > 0 ? "up" : "down"}`;
        card.setTag(note, "accent");
        card.root.classList.add("special");
      } else if (r.kind === "temporary") {
        note = `drift ended at step ${r.end}`;
        card.setTag(note, "accent");
        card.root.classList.add("special", "faded");
        card.markWindow(r.start, r.end);
      } else {
        note = "noise";
        card.setTag(note, "plain");
      }
      const badges: string[] = [];
      if (judgement.choice === i) badges.push("your pick");
      if (judgement.correctAnswer === i) badges.push("answer");
      setBadges(card.root, badges);
      card.root.setAttribute("aria-label", `Chart ${chart.id}: ${note}${badges.length ? `, ${badges.join(", ")}` : ""}`);
    });
    const none = radios[CHART_COUNT];
    const badges: string[] = [];
    if (judgement.choice === "none") badges.push("your pick");
    if (judgement.correctAnswer === "none") badges.push("answer");
    setBadges(none, badges);
    none.setAttribute("aria-label", `No persistent pattern${badges.length ? `: ${badges.join(", ")}` : ""}`);
  }

  function setBadges(el: HTMLElement, badges: string[]) {
    el.classList.toggle("picked", badges.includes("your pick"));
    el.classList.toggle("answer", badges.includes("answer"));
    const holder = el.querySelector(".chart-head") ?? el;
    for (const b of badges) holder.append(h("span", { class: `badge badge-${b === "answer" ? "answer" : "pick"}` }, b));
  }

  function animate(reveal: Reveal, done: () => void) {
    const full = reveal.round.charts.map((c) => c.points);
    const hidden = full.map((p) => p.slice(VISIBLE_STEPS));
    const from = domainOf(full.map((p) => p.slice(0, VISIBLE_STEPS + 1)));
    const to = domainOf(full);

    if (prefersReduced()) {
      cards.forEach((c, i) => c.draw(to, hidden[i], HIDDEN_STEPS));
      done();
      return;
    }
    const duration = 1700;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const k = ease(Math.min(1, t / 0.45));
      const d = { lo: from.lo + (to.lo - from.lo) * k, hi: from.hi + (to.hi - from.hi) * k };
      const progress = ease(t) * HIDDEN_STEPS;
      cards.forEach((c, i) => c.draw(d, hidden[i], progress));
      if (t < 1) frame = requestAnimationFrame(step);
      else done();
    };
    frame = requestAnimationFrame(step);
  }

  function showResult(reveal: Reveal) {
    if (!resultSlot || !game) return;
    const { judgement, explanation } = reveal;
    renderScore();
    const seed = game.seed;

    const next = h("button", { class: "primary", type: "button" }, "Next round");
    next.addEventListener("click", () => startRound(newSeed()));
    const status = h("span", { class: "status", role: "status" });
    const share = h("button", { class: "secondary", type: "button" }, "Share this challenge");
    share.addEventListener("click", async () => {
      status.textContent = await shareChallenge(seed);
    });

    const result = h(
      "section",
      { class: `result ${judgement.correct ? "is-correct" : "is-wrong"}` },
      h("p", { class: "verdict" }, judgement.correct ? "Correct" : "Not this time"),
      h("h2", { tabIndex: -1 }, explanation.headline),
      h(
        "dl",
        {},
        h("dt", {}, "How they were made"),
        h("dd", {}, explanation.rule),
        h("dt", {}, "The trap"),
        h("dd", {}, explanation.biggestMover),
        h("dt", {}, "Could you have known?"),
        h("dd", {}, explanation.ambiguity),
      ),
      h("div", { class: "actions" }, next, share, status),
    );
    resultSlot.replaceChildren(result);
    if (live) live.textContent = `${judgement.correct ? "Correct." : "Not this time."} ${explanation.headline}`;
    next.focus({ preventScroll: true });
    result.scrollIntoView?.({ behavior: prefersReduced() ? "auto" : "smooth", block: "nearest" });
  }

  showIntro();

  return {
    startRound,
    destroy() {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onGlobalKey);
    },
  };
}
