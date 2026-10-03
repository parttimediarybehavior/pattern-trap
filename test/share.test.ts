// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { challengeUrl } from "../src/ui/share";
import { parseSeed } from "../src/game/rng";

describe("challenge links", () => {
  it("carry only the seed and round-trip", () => {
    const url = challengeUrl("k3f92xqa", "https://pattern-trap.example/?seed=old&x=1#frag");
    expect(url).toBe("https://pattern-trap.example/?seed=k3f92xqa");
    expect(parseSeed(new URL(url).searchParams.get("seed"))).toBe("k3f92xqa");
  });
});
