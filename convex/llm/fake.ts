import type { Canonicalizer, CanonicalResult, Extractor, RawEvidence } from "./types";

/** Splits text into one evidence unit per non-empty line. */
export class FakeExtractor implements Extractor {
  async extract(documentText: string): Promise<RawEvidence[]> {
    return documentText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((text) => ({ text }));
  }
}

/** Merges exact-duplicate evidence texts into one thread (deterministic dedup). */
export class FakeCanonicalizer implements Canonicalizer {
  async canonicalize(evidence: { text: string }[]): Promise<CanonicalResult> {
    const byText = new Map<string, number[]>();
    evidence.forEach((e, i) => {
      const key = e.text.trim();
      byText.set(key, [...(byText.get(key) ?? []), i]);
    });
    const threads = [...byText.entries()].map(([text, sourceIndices]) => ({ text, sourceIndices }));
    return { threads, roles: [], skills: [] };
  }
}
