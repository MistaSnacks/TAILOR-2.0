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

export const GENERATION_SYSTEM =
  "You are TAILOR's résumé engine. You receive a job description and the candidate's canonical PROFILE " +
  "(verified experiences with highlights, plus skills). Produce a tailored, ATS-safe résumé drawn ONLY from " +
  "the profile. RULES: (1) Use ONLY experiences and facts present in the profile — never invent employers, " +
  "titles, dates, metrics, or skills. (2) Keep each experience's company/position/dates exactly as in the profile. " +
  "(3) For each relevant experience, select and tailor its highlights to the job; each highlight has a type: " +
  "'verbatim' (restates a profile bullet), 'rephrase' (same fact, JD-aligned wording), 'infer' (a broader competency " +
  "a bullet genuinely entails — set relationship), or 'compose' (synthesized from several of that job's bullets — " +
  "set relationship). (4) Reorder/emphasize to match the job; you may DROP experiences irrelevant to it. (5) skills: " +
  "a subset of the profile's skills relevant to the job. (6) summary: 2–3 lines tailored to the job. (7) requirements: " +
  "the job's key requirements with covered=true/false based on the profile. (8) keywords: key ATS keywords from the job. " +
  "Return ONLY JSON: {\"summary\":string,\"experiences\":[{\"company\",\"position\",\"startDate\",\"endDate\"," +
  "\"highlights\":[{\"text\",\"type\",\"relationship\"}]}],\"skills\":[string],\"requirements\":[{\"text\",\"covered\"}],\"keywords\":[string]}.";
