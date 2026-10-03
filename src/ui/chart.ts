/**
 * SVG chart cards. Before the reveal a card is built from the public view
 * only, so the DOM never holds a hidden point. The continuation is passed in
 * after the player locks in.
 */
import type { PublicChart } from "../game/session";

const SVG_NS = "http://www.w3.org/2000/svg";
const W = 300;
const H = 200;
const PAD_Y = 14;

export interface Domain {
  lo: number;
  hi: number;
}

/** Shared vertical range for a set of series, padded, with a minimum span. */
export function domainOf(series: readonly (readonly number[])[], minSpan = 24): Domain {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) for (const v of s) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = Math.max(hi - lo, minSpan);
  const mid = (hi + lo) / 2;
  return { lo: mid - span * 0.55, hi: mid + span * 0.55 };
}

export function pathFor(points: readonly number[], fromStep: number, totalSteps: number, d: Domain): string {
  let out = "";
  for (let i = 0; i < points.length; i++) {
    const x = ((fromStep + i) / totalSteps) * W;
    const y = PAD_Y + (1 - (points[i] - d.lo) / (d.hi - d.lo)) * (H - 2 * PAD_Y);
    out += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return out;
}

function yOf(v: number, d: Domain): number {
  return PAD_Y + (1 - (v - d.lo) / (d.hi - d.lo)) * (H - 2 * PAD_Y);
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export interface ChartCard {
  root: HTMLElement;
  /** Draw at the given domain; `hidden` (if any) is drawn up to `progress` steps. */
  draw(d: Domain, hidden?: readonly number[], progress?: number): void;
  setTag(text: string, tone: "plain" | "accent"): void;
  markWindow(fromStep: number, toStep: number): void;
}

function describe(points: readonly number[]): string {
  const end = points[points.length - 1];
  const r = Math.round(end);
  const where = r === 0 ? "back where it started" : `${Math.abs(r)} ${r > 0 ? "above" : "below"} its start`;
  return `ends ${where}`;
}

export function createChartCard(chart: PublicChart, index: number, visibleSteps: number, totalSteps: number): ChartCard {
  const root = document.createElement("div");
  root.className = "chart";
  root.setAttribute("role", "radio");
  root.setAttribute("aria-checked", "false");
  root.dataset.choice = String(index);
  root.tabIndex = -1;
  const label = `Chart ${chart.id}`;
  root.setAttribute("aria-label", `${label}, ${describe(chart.points)}`);

  const head = document.createElement("div");
  head.className = "chart-head";
  head.innerHTML = `<span class="chart-id">${chart.id}</span><kbd aria-hidden="true">${index + 1}</kbd>`;

  const plot = document.createElement("div");
  plot.className = "plot";
  const nowPct = (visibleSteps / totalSteps) * 100;
  plot.style.setProperty("--now", `${nowPct}%`);

  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: "none",
    "aria-hidden": "true",
    focusable: "false",
  });
  const base = svgEl("line", { class: "baseline", x1: "0", x2: String(W), "vector-effect": "non-scaling-stroke" });
  const now = svgEl("line", {
    class: "now",
    x1: String((visibleSteps / totalSteps) * W),
    x2: String((visibleSteps / totalSteps) * W),
    y1: "0",
    y2: String(H),
    "vector-effect": "non-scaling-stroke",
  });
  const seen = svgEl("path", { class: "seen", "vector-effect": "non-scaling-stroke" });
  const unseen = svgEl("path", { class: "unseen", "vector-effect": "non-scaling-stroke" });
  svg.append(base, now, seen, unseen);

  const future = document.createElement("div");
  future.className = "future";
  future.innerHTML = `<span>?</span>`;
  const band = document.createElement("div");
  band.className = "band";
  band.hidden = true;

  plot.append(band, svg, future);

  const tag = document.createElement("div");
  tag.className = "chart-tag";
  tag.setAttribute("aria-hidden", "true");

  root.append(head, plot, tag);

  return {
    root,
    draw(d, hidden, progress = 0) {
      const y0 = yOf(0, d).toFixed(2);
      base.setAttribute("y1", y0);
      base.setAttribute("y2", y0);
      seen.setAttribute("d", pathFor(chart.points, 0, totalSteps, d));
      if (hidden && progress > 0) {
        // hidden[0] is the last visible point, so the line continues seamlessly.
        const whole = Math.floor(progress);
        const pts = hidden.slice(0, whole + 1);
        const frac = progress - whole;
        if (frac > 0 && whole + 1 < hidden.length) {
          pts.push(hidden[whole] + (hidden[whole + 1] - hidden[whole]) * frac);
        }
        unseen.setAttribute("d", pathFor(pts, visibleSteps, totalSteps, d));
      } else {
        unseen.removeAttribute("d");
      }
    },
    setTag(text, tone) {
      tag.textContent = text;
      tag.dataset.tone = tone;
    },
    markWindow(fromStep, toStep) {
      band.hidden = false;
      band.style.left = `${(fromStep / totalSteps) * 100}%`;
      band.style.width = `${((toStep - fromStep) / totalSteps) * 100}%`;
    },
  };
}
