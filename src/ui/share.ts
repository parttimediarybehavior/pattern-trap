/** Challenge links: the seed is the whole challenge. */

export function challengeUrl(seed: string, base: string = window.location.href): string {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set("seed", seed);
  return url.toString();
}

/** Share or copy a link. Resolves to a short status message for the UI. */
export async function shareChallenge(seed: string): Promise<string> {
  const url = challengeUrl(seed);
  const text = `Nine charts. Is one of them real? Try Pattern Trap challenge ${seed}.`;
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  if (nav.share && coarse) {
    try {
      await nav.share({ title: "Pattern Trap", text, url });
      return "Shared.";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "";
      // fall through to copy
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "Link copied.";
  } catch {
    window.prompt("Copy this challenge link:", url);
    return "";
  }
}
