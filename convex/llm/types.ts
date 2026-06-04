/** One atomic claim the Extractor pulls from a single document's text. */
export interface RawEvidence {
  text: string;
}

/** A merged thread the Canonicalizer produced from many RawEvidence items. */
export interface CanonicalThread {
  text: string;
  // 0-based indices into the input evidence array that this thread merges.
  sourceIndices: number[];
  employer?: string;
  title?: string;
}

export interface CanonicalSkill {
  name: string;
  variants: string[];
}

export interface CanonicalResult {
  threads: CanonicalThread[];
  roles: { employer: string; title: string; startDate?: string; endDate?: string }[];
  skills: CanonicalSkill[];
}

/** text → atomic evidence units. Provider-agnostic (Gemini/Claude per §18). */
export interface Extractor {
  extract(documentText: string): Promise<RawEvidence[]>;
}

/** many evidence units (across docs) → the canonical Form (§4). */
export interface Canonicalizer {
  canonicalize(evidence: { text: string }[]): Promise<CanonicalResult>;
}
