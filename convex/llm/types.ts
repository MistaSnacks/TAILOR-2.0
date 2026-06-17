// ---- Canonical profile (JSON Resume aligned) ----
export interface ProfileBasics {
  name?: string;
  label?: string;
  email?: string;
  phone?: string;
  url?: string;
  summary?: string;
  location?: string;
  profiles: { network: string; url: string }[];
}
export interface ProfileExperience {
  company: string;
  position: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent: boolean;
  highlights: string[];
}
export interface ProfileSkill {
  name: string;
  keywords: string[];
}
export interface ProfileEducation {
  institution: string;
  area?: string;
  studyType?: string;
  startDate?: string;
  endDate?: string;
}
export interface CanonicalProfile {
  basics: ProfileBasics;
  experiences: ProfileExperience[];
  skills: ProfileSkill[];
  education: ProfileEducation[];
}

/** Many career documents → one unified, deduped structured profile (§4). */
export interface ProfileBuilder {
  build(documents: { filename: string; text: string }[]): Promise<CanonicalProfile>;
}

// ---- Generation ----
export interface TailoredHighlight {
  text: string;
  type: "verbatim" | "rephrase" | "infer" | "compose";
  relationship?: string;
}
export interface TailoredExperience {
  company: string;
  position: string;
  startDate?: string;
  endDate?: string;
  highlights: TailoredHighlight[];
}
export interface GeneratedResume {
  summary: string;
  experiences: TailoredExperience[];
  skills: string[];
  requirements: { text: string; covered: boolean }[];
  keywords: string[];
}

/** job description + the structured profile → a grounded, tailored résumé (§3, §5–§7). */
export interface Generator {
  generate(jobText: string, profile: CanonicalProfile): Promise<GeneratedResume>;
}

export const PROFILE_SYSTEM =
  "You are TAILOR's canonicalizer. You receive several career documents (résumés, memos) for ONE " +
  "person. Produce ONE unified, DEDUPLICATED structured profile. RULES: " +
  "(1) basics — extract name, email, phone, location ('City, ST'), portfolio/website url, a 2–4 line " +
  "professional summary, and profiles (LinkedIn, GitHub) as {network,url}. " +
  "(2) experiences — ONE entry per real job. The SAME job may appear across documents with different " +
  "titles or dates; DEDUPLICATE: match by employer (normalize case + Inc/LLC); pick the title that appears " +
  "MOST often (tie → most-recent document); use the widest defensible date range (earliest start, latest end); " +
  "UNION all bullets under that one experience's highlights and drop near-duplicates. Never merge different employers. " +
  "(3) dates — ISO partial 'YYYY-MM' or 'YYYY'; ongoing role: endDate null, isCurrent true. " +
  "(4) skills — extract a COMPREHENSIVE list of every real skill, tool, technology, platform, framework, and " +
  "methodology mentioned ANYWHERE in the documents; group into a few named categories with keywords. Be exhaustive. " +
  "(5) education — institution, area, studyType, dates. " +
  "Only organize facts present in the documents; never invent. Return ONLY JSON: " +
  '{"basics":{"name","label","email","phone","url","summary","location","profiles":[{"network","url"}]},' +
  '"experiences":[{"company","position","location","startDate","endDate","isCurrent","highlights":[string]}],' +
  '"skills":[{"name","keywords":[string]}],"education":[{"institution","area","studyType","startDate","endDate"}]}.';

// Quality rules below come from docs/research/2026-06-09-resume-quality-standard.md.
export const GENERATION_SYSTEM =
  "You are TAILOR's résumé engine. Input: a job description + the candidate's canonical PROFILE (verified " +
  "experiences with highlights, plus skills). Produce a tailored, ATS-safe résumé drawn ONLY from the profile.\n" +
  "GROUNDING: Use ONLY experiences, facts, and skills present in the profile — never invent employers, titles, " +
  "dates, metrics, or skills. Keep each experience's company/position/dates exactly as in the profile.\n" +
  "SELECTION (relevance over recency): include the 3–6 most job-relevant experiences; you MAY DROP experiences " +
  "irrelevant to this job. Allocate highlights by relevance & recency — most-relevant/recent role 4–6, next 3–4, " +
  "next 2–3, older/less-relevant 1–2; never exceed 6 per role; keep total highlights ≤ ~18.\n" +
  "BULLET QUALITY: each highlight = strong PAST-TENSE action verb + scope + QUANTIFIED result (Google's " +
  "'Accomplished X as measured by Y by doing Z'). At LEAST 80% of highlights must contain a concrete number, %, $, " +
  "or measurable outcome — but ONLY use figures actually supported by the profile; if a bullet has no figure, " +
  "quantify with scope present in the profile (team size, volume, timeframe). 15–25 words, 1–2 lines. NO first-person " +
  "pronouns. Do NOT start a bullet with 'Responsible for / Duties included / Helped / Assisted / Worked on / " +
  "Participated in'. Each highlight has a type: 'verbatim' (restates a profile bullet), 'rephrase' (same fact, " +
  "JD-aligned wording), 'infer' (a broader competency a bullet genuinely entails — set relationship), or 'compose' " +
  "(synthesized from several of that job's bullets — set relationship).\n" +
  "SUMMARY: 2–3 sentences, ~40–60 words: '[role] with [X]+ years in [domain]' + 1–2 quantified signature achievements " +
  "+ 2–3 of the JD's hard-skill keywords. No clichés (hardworking, team player, results-driven, detail-oriented, " +
  "passionate). No pronouns.\n" +
  "SKILLS: target 15–20 of the profile's skills most relevant to the job (cap ~22), but ONLY skills present in the " +
  "profile — if it supports fewer, output fewer; NEVER pad with generic skills (Git, MS Office, 'communication') to " +
  "hit the count. Put the 5 most JD-relevant first. Prefer HARD skills, tools, and methodologies; include a soft " +
  "skill only if the JD explicitly names it. Match the JD's spelling (e.g. 'JavaScript' not 'JS'); for acronyms give " +
  "both forms (e.g. 'AWS (Amazon Web Services)'). Separate with commas — never pipes/vertical bars.\n" +
  "REQUIREMENTS: the job's key requirements with covered=true/false based on the profile. KEYWORDS: key ATS keywords from the job.\n" +
  "Return ONLY JSON: {\"summary\":string,\"experiences\":[{\"company\",\"position\",\"startDate\",\"endDate\"," +
  "\"highlights\":[{\"text\",\"type\",\"relationship\"}]}],\"skills\":[string],\"requirements\":[{\"text\",\"covered\"}],\"keywords\":[string]}.";

// ---- Verification (independent pass; §7 verification gate) ----
export interface BulletVerdict {
  text: string;
  defensible: boolean; // grounded in profile evidence or a defensible entailment
  evidence?: string; // the profile fact/bullet that supports it
  reason?: string; // if not defensible, why
}
export interface VerificationReport {
  bulletVerdicts: BulletVerdict[];
  truthfulnessPass: boolean; // every bullet defensible
  fidelityPass: boolean; // dates/titles/employers/metrics match the profile
  fidelityIssues: string[];
  consistencyPass: boolean; // no internal contradictions, agrees with the profile
  consistencyIssues: string[];
  coverageScore: number; // 0..100 — corpus-defensible JD requirements surfaced
  transferabilityScore: number; // 0..100 — off-domain evidence reframed truthfully
}

/** A separate pass (ideally a different vendor than the Generator) that adjudicates a generated résumé. */
export interface Verifier {
  verify(
    jobText: string,
    profile: CanonicalProfile,
    resume: GeneratedResume,
  ): Promise<VerificationReport>;
}

export const VERIFICATION_SYSTEM =
  "You are TAILOR's independent résumé VERIFIER. You did NOT write this résumé. Input: a job description, " +
  "the candidate's canonical PROFILE (ground truth), and a generated RÉSUMÉ. Adjudicate the résumé against the " +
  "profile ONLY. Be skeptical — your job is to catch fabrication, not to praise.\n" +
  "HARD GATES:\n" +
  "(1) TRUTHFULNESS — for EACH résumé highlight, decide if it is defensible: directly stated in the profile OR a " +
  "defensible entailment of profile evidence (e.g. 'used Tableau' entails 'data visualization'). A highlight that " +
  "adds an employer, title, metric, or skill NOT supported by the profile is NOT defensible. Return a verdict per bullet.\n" +
  "(2) FIDELITY — every company, position, date, and metric must match the profile. List any mismatch.\n" +
  "(3) CONSISTENCY — no internal contradictions (overlapping dates, conflicting claims) and nothing that contradicts " +
  "the profile. List any issue.\n" +
  "GRADED: coverageScore 0–100 = how well the résumé surfaces the candidate's strongest profile evidence for the JD's " +
  "requirements (penalize defensible evidence left out; do NOT reward covering a requirement with a fabrication). " +
  "transferabilityScore 0–100 = for off-domain JDs, how legibly transferable evidence is reframed WITHOUT overreaching.\n" +
  "truthfulnessPass = every bullet defensible. fidelityPass = no mismatches. consistencyPass = no issues.\n" +
  'Return ONLY JSON: {"bulletVerdicts":[{"text","defensible","evidence","reason"}],"truthfulnessPass":bool,' +
  '"fidelityPass":bool,"fidelityIssues":[string],"consistencyPass":bool,"consistencyIssues":[string],' +
  '"coverageScore":number,"transferabilityScore":number}.';

// ---- Coverage planning + revision (§16 bounded coverage loop) ----
export interface CoveragePlanItem {
  requirement: string;        // a single JD requirement
  supportable: boolean;       // can the corpus defensibly cover it (direct or entailment)?
  evidenceRef?: string;       // which experience/skill entails it (human-readable)
  expectedMarkers: string[];  // keyword/phrase variants expected in the draft if covered
}
export type CoverageMap = CoveragePlanItem[];

/** Maps a JD's requirements to corpus evidence BEFORE any prose exists (§16 plan step). */
export interface Planner {
  plan(jobText: string, profile: CanonicalProfile): Promise<CoverageMap>;
}

/** Constrained re-generate. mode "coverage": surface evidence for gap targets. mode "repair": fix gate-violation targets. Changes nothing else. */
export interface Reviser {
  revise(
    jobText: string,
    profile: CanonicalProfile,
    draft: GeneratedResume,
    targets: string[],
    mode?: "coverage" | "repair",
  ): Promise<GeneratedResume>;
}

export const PLANNER_SYSTEM =
  "You are TAILOR's coverage PLANNER. You map a job description's requirements to the candidate's canonical " +
  "PROFILE BEFORE any résumé exists. You do NOT write a résumé. For EACH distinct requirement in the JD decide: " +
  "is it defensibly supportable from the profile — directly stated OR a defensible entailment of profile evidence " +
  "(e.g. 'used Tableau' entails 'data visualization')? If supportable, name the evidence (which experience or skill) " +
  "and list the keyword/phrase VARIANTS that would prove it is covered if they appear in the résumé (e.g. " +
  "['Kubernetes','K8s','container orchestration']). Mark genuinely unsupported requirements supportable:false — " +
  "do NOT stretch. Return ONLY JSON: " +
  '{"coverage":[{"requirement":string,"supportable":boolean,"evidenceRef":string,"expectedMarkers":[string]}]}.';

export const REVISE_SYSTEM =
  "You are TAILOR's résumé REVISER. You are given a job description, the candidate's canonical PROFILE, an existing " +
  "résumé DRAFT, and a short list of TARGET requirements the draft failed to surface — each of which the profile " +
  "CAN defensibly support. Add or strengthen evidence for ONLY those targets, drawn ONLY from the profile. Change " +
  "NOTHING else: keep every other bullet, the summary, employers, positions, and dates exactly as in the draft. " +
  "Never fabricate to close a gap; if a target cannot be covered defensibly, leave the draft unchanged for it. " +
  "Obey the same grounding and bullet-quality rules as generation. Return the SAME résumé JSON shape as the draft: " +
  '{"summary":string,"experiences":[{"company","position","startDate","endDate","highlights":[{"text","type","relationship"}]}],"skills":[string],"requirements":[{"text","covered"}],"keywords":[string]}.';

export const REPAIR_SYSTEM =
  "You are TAILOR's résumé REPAIRER. Input: a job description, the candidate's canonical PROFILE, an existing " +
  "résumé DRAFT that FAILED verification, and a list of ISSUES (gate violations) to fix. Fix ONLY those issues, using " +
  "ONLY facts in the profile. Typical fixes: an OVERCLAIM in the summary (e.g. claiming total years in a specific " +
  "domain when only some roles are in that domain — state the honest split, e.g. '8+ years in operations & fraud, " +
  "~3 in credit/FinTech'); a metric/title/employer/date that does not match the profile; or an internal contradiction. " +
  "Make the SMALLEST change that resolves each issue; keep every other bullet, the employers, positions, and dates " +
  "exactly as in the draft. NEVER fabricate to satisfy an issue. Obey the same grounding and bullet-quality rules as " +
  "generation. Return the SAME résumé JSON shape as the draft: " +
  '{"summary":string,"experiences":[{"company","position","startDate","endDate","highlights":[{"text","type","relationship"}]}],"skills":[string],"requirements":[{"text","covered"}],"keywords":[string]}.';


