# Pattern Trap

A small browser game about spotting patterns, and getting fooled by noise.

You see nine short charts. Maybe one of them has a real trend that will keep going. Maybe one *had* a trend that already ran out. Maybe they are all noise. Pick a chart, or say "No persistent pattern". Then watch the next 40 steps and see how every chart was actually made.

The point is to make **selection bias** something you feel: when you look at nine random lines, one of them will look like it's going somewhere, and the most dramatic chart is not usually the real one.

No accounts, no analytics, no network calls, no backend. It is a static site. The production Content-Security-Policy sets `connect-src 'none'`.

## Play locally

Requires Node 18 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm test           # game-logic + DOM tests (Vitest, jsdom)
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ at http://localhost:4173
npm run check      # test + build
```

### Controls

| Key | Action |
| --- | --- |
| `1`–`9` or `A`–`I` | pick a chart |
| `0` or `N` | No persistent pattern |
| Arrow keys | move between choices |
| `Enter` | lock in |

The charts form a standard ARIA radio group. The reveal animation is skipped when the system asks for reduced motion.

### Challenge links

Every round comes from a seed, and `?seed=k3f92xqa` replays exactly that round. The address bar always holds the current challenge, and "Share this challenge" copies the link (or opens the share sheet on phones). The link carries only the seed, never the player's answer.

## Deploy to Vercel

The repo deploys as-is. `vercel.json` sets the Vite build, the `dist` output, and strict security headers.

- **Dashboard:** push to GitHub, then *Add New → Project → Import*. The defaults are correct; no environment variables are needed.
- **CLI:** `npx vercel` (preview) then `npx vercel --prod`.

Any other static host works too. Serve `dist/` after `npm run build`.

## How it works

```
src/game/   pure logic, no DOM
  rng.ts       seeded PRNG (xmur3 → sfc32), Box–Muller normals, seed parsing
  round.ts     generates a complete round, including the unseen part, from the seed
  judge.ts     scores an answer against the generating rule
  explain.ts   the short plain-language explanation
  session.ts   hands the UI only the visible part until the player locks in
src/ui/     presentation
  chart.ts     SVG chart cards and reveal drawing
  app.ts       screens, input, animation
  share.ts     challenge links
test/       logic, statistical and DOM tests
```

### Round rules

Every chart is a 100-step random walk starting at 0. Each step adds a standard-normal nudge (sd = 1). The first 60 steps are shown. The last 40 are revealed after you answer.

| Round type | Frequency | What's in it | Correct answer |
| --- | --- | --- | --- |
| Persistent | 50% | one chart gets +0.35 or −0.35 per step on **every** step, shown and hidden | that chart |
| Temporary | 25% | one chart drifts 17 units in total, starting at step 0–10 and **ending at step 36–54**, before the reveal | No persistent pattern |
| Noise | 25% | nothing; all nine are zero-drift walks | No persistent pattern |

The drifting chart's position and direction are random.

Half the rounds have a real persistent drift. With an even split, always answering "none" would win two rounds in three and beat any attempt to read the charts. With these weights, simulation gives roughly:
- **Always answering "none":** 50%.
- **Always picking the chart that moved most:** 40%.
- **Picking the biggest mover only if it moved a lot and hasn't stalled:** about 67%.

No strategy gets close to 100%, because the charts are genuinely ambiguous.

### Guarantees (all tested)

- **Seeds reproduce rounds.** The same seed gives an identical round, and a pinned "golden" round guards old links against accidental generator changes.
- **Generation happens before the choice.** The seed alone produces the whole round, with a fixed sequence of random draws, before anything is drawn on screen. Locking in only reads that round, and every possible answer yields the identical round.
- **The continuation stays hidden.** Before the choice, the UI receives only the first 61 points of each chart and no rules. A DOM test renders the board twice, once with the hidden data shifted by +1000, and requires byte-identical HTML. That proves nothing on screen, including the y-axis scale, depends on unseen data.
- **Answers are judged by the rule, not by the outcome.** A persistent chart that happens to dip during the reveal is still the right answer.
- **The rules behave as described.** Statistical tests over 3,000 seeds check:
  - drift is present in the shown and hidden steps of persistent charts;
  - drift is present while a temporary drift is active, and absent after the line;
  - drift is absent everywhere else;
  - round-type frequencies and chart positions come out as configured.

The tests were checked against deliberate defects to make sure they can fail. Each of these broke at least one test:
- leaking one hidden point;
- scaling the board from the full data;
- letting temporary drift run past the reveal;
- stopping persistent drift at the reveal;
- letting the choice affect the revealed data;
- scoring the temporary chart as correct.

## Statistical simplifications (honest version)

This is a teaching toy, not a model of any real data.

- **Idealized noise.** Steps are independent, Gaussian and the same size everywhere. Real series have fat tails, changing volatility, autocorrelation and regime changes, so they are much harder than this.
- **One clean signal.** A round has at most one drifting chart, with a fixed size and a sharp on/off switch. Real trends fade, reverse and overlap.
- **Generous base rates.** Half of all rounds contain a real persistent pattern, chosen for game balance (see above). In most real settings, true lasting patterns are far rarer than that, which makes selection bias *worse* than the game shows.
- **"Persistent" means "within this game".** A drift counts as persistent if it continues through the 40 revealed steps. The game says nothing about forever.
- **Judged by the rule, not the data.** The correct answer is defined by how the round was generated. Even after the reveal, the revealed data alone could not prove which chart was real.
- **The "biggest mover" odds are approximate.** The figure after each round ("at least one of nine noise charts moves that far X% of the time") uses only each chart's net change over 60 steps. It is exact for Gaussian steps, but the player also reacts to shape, smoothness and late momentum, which the number ignores.
- **Shared scale.** All nine charts share one vertical scale, so sizes are comparable. The scale widens during the reveal if the continuation leaves the original range.
- **Float reproducibility.** Seeds fix round type, positions, directions and windows exactly. Chart values depend on `Math.log`/`Math.cos`, which browsers may round differently in the last bits, so a value may differ around the 15th decimal place. That is invisible on screen.
- **Not secret.** The generator is in the page, so anyone with the seed and the source can compute the answer. It is a game, not a test.

## Not included

No accounts, payments, leaderboards, persistence, analytics, API calls or trading features. Scores live in memory for the current tab only.
