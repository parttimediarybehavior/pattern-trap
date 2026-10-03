// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HIDDEN_STEPS, VISIBLE_STEPS } from "../src/game/round";

/** When set, createRound shifts every hidden point by +1000 (visible part untouched). */
const tamper = { on: false };
vi.mock("../src/game/round", async (orig) => {
  const real = await orig<typeof import("../src/game/round")>();
  return {
    ...real,
    createRound(seed: string) {
      const r = real.createRound(seed);
      if (!tamper.on) return r;
      return {
        ...r,
        charts: r.charts.map((c) => ({
          ...c,
          points: c.points.map((v, k) => (k > real.VISIBLE_STEPS ? v + 1000 : v)),
        })),
      };
    },
  };
});

const { mountApp } = await import("../src/ui/app");

let root: HTMLElement;
let app: ReturnType<typeof mountApp> | null = null;

beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
  root = document.getElementById("app")!;
  tamper.on = false;
  window.scrollTo = () => {};
});
afterEach(() => {
  app?.destroy();
  app = null;
});

const pointCount = (d: string | null) => (d ? (d.match(/[ML]/g) ?? []).length : 0);
const press = (key: string, target: EventTarget = document.activeElement ?? document.body) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

function play(seed: string, reducedMotion = true) {
  app = mountApp(root, { seed, reducedMotion, updateUrl: false });
  const button = root.querySelector<HTMLButtonElement>(".intro button.primary")!;
  expect(button.textContent).toBe("Play challenge");
  button.click();
}

describe("opening screen", () => {
  it("shows a Play button and no charts", () => {
    app = mountApp(root, { seed: null, reducedMotion: true, updateUrl: false });
    expect(root.querySelector(".intro button")!.textContent).toBe("Play");
    expect(root.querySelectorAll(".chart")).toHaveLength(0);
  });
});

describe("before the choice", () => {
  it("draws nine charts with only the visible steps", () => {
    play("ui-seed-1");
    const charts = root.querySelectorAll(".chart");
    expect(charts).toHaveLength(9);
    for (const c of charts) {
      expect(pointCount(c.querySelector(".seen")!.getAttribute("d"))).toBe(VISIBLE_STEPS + 1);
      expect(c.querySelector(".unseen")!.getAttribute("d")).toBeNull();
    }
    expect(root.textContent).not.toMatch(/noise|drift|answer|your pick/i);
    expect(root.querySelector(".result")).toBeNull();
  });

  it("the board does not depend on hidden data at all (scale included)", () => {
    play("ui-seed-2");
    const honest = root.querySelector(".board")!.outerHTML;
    app!.destroy();
    tamper.on = true;
    root.replaceChildren();
    play("ui-seed-2");
    const tampered = root.querySelector(".board")!.outerHTML;
    expect(tampered).toBe(honest);
  });

  it("Lock in stays disabled until something is selected", () => {
    play("ui-seed-3");
    const lock = root.querySelector<HTMLButtonElement>(".lock")!;
    expect(lock.disabled).toBe(true);
    press("Enter", document.body);
    expect(root.querySelector(".result")).toBeNull();
    expect(root.querySelector(".chart .unseen")!.getAttribute("d")).toBeNull();
  });
});

describe("selecting and revealing", () => {
  it("keyboard: number selects, arrows move, 0 picks none, Enter locks in", () => {
    play("ui-seed-4");
    const radios = [...root.querySelectorAll<HTMLElement>("[role=radio]")];
    expect(radios).toHaveLength(10);
    press("5", document.body);
    expect(radios[4].getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radios[4]);
    press("ArrowRight");
    expect(radios[5].getAttribute("aria-checked")).toBe("true");
    expect(radios[4].getAttribute("aria-checked")).toBe("false");
    press("ArrowDown");
    expect(radios[8].getAttribute("aria-checked")).toBe("true");
    press("ArrowDown");
    expect(radios[9].getAttribute("aria-checked")).toBe("true");
    press("c", document.body);
    expect(radios[2].getAttribute("aria-checked")).toBe("true");
    press("0", document.body);
    expect(radios[9].getAttribute("aria-checked")).toBe("true");
    expect(radios.filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
    press("Enter");
    expect(root.querySelector(".result")).not.toBeNull();
  });

  it("reveals the continuation, the rule, the verdict and the answer", () => {
    play("ui-seed-5");
    root.querySelectorAll<HTMLElement>(".chart")[0].click();
    root.querySelector<HTMLButtonElement>(".lock")!.click();
    for (const c of root.querySelectorAll(".chart")) {
      expect(pointCount(c.querySelector(".unseen")!.getAttribute("d"))).toBe(HIDDEN_STEPS + 1);
      expect(c.querySelector(".chart-tag")!.textContent).toMatch(/noise|steady drift|drift ended/);
    }
    const result = root.querySelector(".result")!;
    expect(result.querySelector(".verdict")!.textContent).toMatch(/Correct|Not this time/);
    expect(result.textContent).toMatch(/How they were made/);
    expect(result.textContent).toMatch(/Could you have known/);
    expect(root.querySelectorAll(".badge-answer")).toHaveLength(1);
    expect(root.querySelectorAll(".badge-pick")).toHaveLength(1);
    expect(root.querySelector(".score")!.textContent).toMatch(/\d \/ 1 right/);
  });

  it("choices are frozen after the reveal", () => {
    play("ui-seed-6");
    press("2", document.body);
    press("Enter");
    press("7", document.body);
    const radios = [...root.querySelectorAll<HTMLElement>("[role=radio]")];
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    expect(radios[6].getAttribute("aria-checked")).toBe("false");
    radios[6].click();
    expect(radios[6].getAttribute("aria-checked")).toBe("false");
  });

  it("animates when motion is allowed and lands on the same final drawing", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    play("ui-seed-7", false);
    press("1", document.body);
    press("Enter");
    expect(root.querySelector(".result")).toBeNull(); // result waits for the animation
    const t0 = performance.now();
    frames.shift()!(t0 + 400);
    const mid = pointCount(root.querySelector(".chart .unseen")!.getAttribute("d"));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(HIDDEN_STEPS + 1);
    while (frames.length) frames.shift()!(t0 + 10_000);
    const animated = [...root.querySelectorAll(".chart .unseen")].map((p) => p.getAttribute("d"));
    expect(root.querySelector(".result")).not.toBeNull();
    vi.unstubAllGlobals();

    app!.destroy();
    root.replaceChildren();
    play("ui-seed-7", true);
    press("1", document.body);
    press("Enter");
    const instant = [...root.querySelectorAll(".chart .unseen")].map((p) => p.getAttribute("d"));
    expect(animated).toEqual(instant);
  });

  it("next round starts a fresh, unrevealed board", () => {
    play("ui-seed-8");
    press("0", document.body);
    press("Enter");
    root.querySelector<HTMLButtonElement>(".result .primary")!.click();
    expect(root.querySelector(".result")).toBeNull();
    expect(root.querySelector(".seed code")!.textContent).not.toBe("ui-seed-8");
    expect(root.querySelector(".chart .unseen")!.getAttribute("d")).toBeNull();
  });
});
