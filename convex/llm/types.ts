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

/** A Form thread offered to the generator (id so a bullet can cite it). */
export interface GenThread {
  id: string;
  text: string;
}

export interface GeneratedBullet {
  text: string;
  type: "verbatim" | "rephrase" | "infer" | "compose";
  evidenceIds: string[];
  relationship?: string;
}

export interface GeneratedResume {
  summary: string;
  requirements: { text: string; covered: boolean }[];
  keywords: string[];
  bullets: GeneratedBullet[];
}

/** job description + the Form → a grounded, tailored résumé (§3, §5–§7). */
export interface Generator {
  generate(jobText: string, threads: GenThread[], skills: string[]): Promise<GeneratedResume>;
}

export const GENERATION_SYSTEM =
  "You are TAILOR's résumé engine. You receive a job description and the candidate's VERIFIED " +
  "career threads (each with an id) plus their skills. Produce a tailored, ATS-safe résumé drawn " +
  "ONLY from those threads. RULES: (1) Every bullet MUST cite one or more thread ids in evidenceIds — " +
  "a bullet with no citation is forbidden. (2) Never invent facts, metrics, numbers, employers, titles, " +
  "dates, or skills not present in the cited threads. (3) Each bullet has a type: 'verbatim' (restates a " +
  "thread), 'rephrase' (same fact, JD-aligned wording), 'infer' (a broader competency a thread genuinely " +
  "entails — e.g. used Tableau ⇒ data visualization; set relationship), or 'compose' (one claim synthesized " +
  "from several cited threads; set relationship). (4) Prefer bullets matching the job's requirements, and " +
  "surface defensible matches the candidate didn't state explicitly. Write in third-person-free résumé voice " +
  "(start with strong verbs; no 'I' or the candidate's name). Return ONLY JSON: " +
  '{"summary": string, "requirements": [{"text": string, "covered": boolean}], "keywords": [string], ' +
  '"bullets": [{"text": string, "type": string, "evidenceIds": [string], "relationship": string}]}.';
