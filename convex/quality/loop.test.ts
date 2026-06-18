// convex/quality/loop.test.ts
import { describe, it, expect } from "vitest";
import { nextLoopState, runCoverageLoop, gateRepairTargets } from "./loop";
import type {
  CoveragePlanItem,
  CanonicalProfile,
  CoverageMap,
  GeneratedResume,
  Planner,
  Generator,
  Reviser,
  Verifier,
  VerificationReport,
} from "../llm/types";

const gap = (requirement: string): CoveragePlanItem => ({ requirement, supportable: true, expectedMarkers: [requirement.toLowerCase()] });

describe("nextLoopState", () => {
  it("converged when there are no gaps (even at the round cap)", () => {
    expect(nextLoopState({ gaps: [], prevGapCount: 5, round: 3, maxRounds: 3 })).toEqual({ kind: "converged" });
  });

  it("exhausted when rounds already hit the cap and gaps remain", () => {
    expect(nextLoopState({ gaps: [gap("a")], prevGapCount: 99, round: 3, maxRounds: 3 })).toEqual({ kind: "exhausted" });
  });

  it("stalled when this round did not reduce the gap count", () => {
    expect(nextLoopState({ gaps: [gap("a"), gap("b")], prevGapCount: 2, round: 1, maxRounds: 3 })).toEqual({ kind: "stalled" });
  });

  it("continues with target requirement strings when gaps shrank and rounds remain", () => {
    const d = nextLoopState({ gaps: [gap("a")], prevGapCount: 3, round: 1, maxRounds: 3 });
    expect(d).toEqual({ kind: "continue", targets: ["a"] });
  });

  it("first round (prevGapCount = Infinity) continues", () => {
    const d = nextLoopState({ gaps: [gap("a"), gap("b")], prevGapCount: Number.POSITIVE_INFINITY, round: 0, maxRounds: 3 });
    expect(d).toEqual({ kind: "continue", targets: ["a", "b"] });
  });
});

describe("gateRepairTargets", () => {
  it("collects undefensible bullets (with reason), fidelity and consistency issues", () => {
    const ver: VerificationReport = {
      bulletVerdicts: [
        { text: "Led a $50M deal", defensible: false, reason: "no such metric in profile" },
        { text: "Cut latency 40%", defensible: true },
      ],
      truthfulnessPass: false,
      fidelityPass: false, fidelityIssues: ["title 'VP' not in profile"],
      consistencyPass: false, consistencyIssues: ["dates overlap TD Bank / Possible Finance"],
      coverageScore: 0, transferabilityScore: 0,
    };
    expect(gateRepairTargets(ver)).toEqual([
      "Led a $50M deal — no such metric in profile",
      "title 'VP' not in profile",
      "dates overlap TD Bank / Possible Finance",
    ]);
  });

  it("labels an undefensible bullet with no reason generically", () => {
    const ver: VerificationReport = {
      bulletVerdicts: [{ text: "Owned the roadmap", defensible: false }],
      truthfulnessPass: false,
      fidelityPass: true, fidelityIssues: [],
      consistencyPass: true, consistencyIssues: [],
      coverageScore: 0, transferabilityScore: 0,
    };
    expect(gateRepairTargets(ver)).toEqual(["Undefensible: Owned the roadmap"]);
  });

  it("returns [] when nothing is wrong", () => {
    expect(gateRepairTargets(PASS)).toEqual([]);
  });
});

const PROFILE = { basics: { profiles: [] }, experiences: [], skills: [], education: [] } as unknown as CanonicalProfile;
const bulletDraft = (texts: string[]): GeneratedResume => ({
  summary: "engineer",
  experiences: [{ company: "Acme", position: "SWE", highlights: texts.map((t) => ({ text: t, type: "rephrase" as const })) }],
  skills: [],
  requirements: [],
  keywords: [],
});
const PASS: VerificationReport = {
  bulletVerdicts: [], truthfulnessPass: true, fidelityPass: true, fidelityIssues: [],
  consistencyPass: true, consistencyIssues: [], coverageScore: 80, transferabilityScore: 70,
};
const FAIL: VerificationReport = { ...PASS, truthfulnessPass: false };

const planner = (map: CoverageMap): Planner => ({ plan: async () => map });
const generator = (draft: GeneratedResume): Generator => ({ generate: async () => draft });
// Verifier fails any draft whose text contains the sentinel "fabricated".
const verifier = (): Verifier => ({ verify: async (_j, _p, r) => (JSON.stringify(r).includes("fabricated") ? FAIL : PASS) });

const SUPPORTABLE_K8S: CoverageMap = [{ requirement: "Kubernetes", supportable: true, expectedMarkers: ["kubernetes"] }];

describe("runCoverageLoop", () => {
  it("closes a supportable-but-absent requirement in exactly one revise round", async () => {
    const reviser: Reviser = { revise: async (_j, _p, d) => bulletDraft([...d.experiences[0].highlights.map((h) => h.text), "Ran kubernetes in prod"]) };
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE,
      planner: planner(SUPPORTABLE_K8S), generator: generator(bulletDraft(["Cut latency 40%"])),
      reviser, verifier: verifier(),
    });
    expect(res.rounds).toBe(1);
    expect(draftTextHas(res.draft, "kubernetes")).toBe(true);
    expect(res.improvementSuggestions).toEqual([]);
  });

  it("treats a JD-term-anchored requirement as a gap when only a paraphrase is present, and surfaces the literal term", async () => {
    // Contract behind the soft-skill ATS fix: a marker is the JD's OWN literal term ("analytical"),
    // not a corpus paraphrase. A draft that shows the evidence ("analyzed patterns") but not the JD
    // term must still be a gap, and the revise surfaces the literal term. Agnostic tokens only.
    const softReq: CoverageMap = [{ requirement: "Strong analytical skills", supportable: true, expectedMarkers: ["analytical"] }];
    const base = bulletDraft(["Analyzed transaction patterns to flag anomalies"]); // paraphrase present, JD term absent
    const reviser: Reviser = {
      revise: async (_j, _p, d) => bulletDraft([...d.experiences[0].highlights.map((h) => h.text), "Applied analytical judgment to assess case risk"]),
    };
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE,
      planner: planner(softReq), generator: generator(base), reviser, verifier: verifier(),
    });
    expect(res.rounds).toBe(1); // the paraphrase-only draft was correctly seen as uncovered
    expect(draftTextHas(res.draft, "analytical")).toBe(true);
    expect(res.improvementSuggestions).toEqual([]);
  });

  it("reverts a revise that trips the gate and records a gate-rejected suggestion", async () => {
    const base = bulletDraft(["Cut latency 40%"]);
    const reviser: Reviser = { revise: async () => bulletDraft(["Cut latency 40%", "Led a fabricated $50M deal"]) };
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE,
      planner: planner(SUPPORTABLE_K8S), generator: generator(base), reviser, verifier: verifier(),
    });
    expect(res.rounds).toBe(0);
    expect(res.draft).toEqual(base); // reverted to the pre-revise draft
    expect(res.improvementSuggestions).toContainEqual({ requirement: "Kubernetes", reason: "gate-rejected" });
  });

  it("halts (stalls) when a revise closes no gaps", async () => {
    const base = bulletDraft(["Cut latency 40%"]);
    const reviser: Reviser = { revise: async (_j, _p, d) => d }; // never adds the marker
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE,
      planner: planner(SUPPORTABLE_K8S), generator: generator(base), reviser, verifier: verifier(),
    });
    expect(res.rounds).toBe(1); // one revise applied (gate passed), then stalled
    // A stalled SUPPORTABLE gap is intentionally NOT surfaced as a suggestion —
    // the candidate genuinely has that evidence; suggestions are only for
    // unsupportable / budget-blocked / gate-rejected requirements.
    expect(res.improvementSuggestions).toEqual([]);
  });

  it("surfaces unsupportable requirements as suggestions and does not loop on them", async () => {
    const map: CoverageMap = [{ requirement: "PhD", supportable: false, expectedMarkers: ["phd"] }];
    const reviser: Reviser = { revise: async (_j, _p, d) => d };
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE,
      planner: planner(map), generator: generator(bulletDraft(["Cut latency 40%"])), reviser, verifier: verifier(),
    });
    expect(res.rounds).toBe(0);
    expect(res.improvementSuggestions).toEqual([{ requirement: "PhD", reason: "unsupportable" }]);
  });

  it("degrades to single-shot (no rounds, no suggestions) when the planner throws", async () => {
    const throwingPlanner: Planner = { plan: async () => { throw new Error("planner boom"); } };
    const base = bulletDraft(["Cut latency 40%"]);
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE,
      planner: throwingPlanner, generator: generator(base),
      reviser: { revise: async (_j, _p, d) => d }, verifier: verifier(),
    });
    expect(res.coverageMap).toEqual([]);
    expect(res.rounds).toBe(0);
    expect(res.improvementSuggestions).toEqual([]);
    expect(res.draft).toEqual(base);
  });

  it("repairs a gate-failing base draft and proceeds (status ready)", async () => {
    const failing = bulletDraft(["Led a fabricated $50M deal"]);
    const clean = bulletDraft(["Led a major enterprise deal"]);
    // FAIL only while the draft still contains the sentinel; supply a repair target.
    const repairVerifier: Verifier = {
      verify: async (_j, _p, r) =>
        JSON.stringify(r).includes("fabricated")
          ? { ...FAIL, bulletVerdicts: [{ text: "Led a fabricated $50M deal", defensible: false, reason: "metric not in profile" }] }
          : PASS,
    };
    const reviser: Reviser = { revise: async (_j, _p, _d, _t, mode) => (mode === "repair" ? clean : failing) };
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE,
      planner: planner([]), generator: generator(failing), reviser, verifier: repairVerifier,
    });
    expect(res.status).toBe("ready");
    expect(draftTextHas(res.draft, "fabricated")).toBe(false);
  });

  it("marks not-ready when the base draft cannot be repaired within budget", async () => {
    const failing = bulletDraft(["Led a fabricated $50M deal"]);
    const stillBad: Verifier = {
      verify: async () => ({ ...FAIL, bulletVerdicts: [{ text: "Led a fabricated $50M deal", defensible: false, reason: "metric not in profile" }] }),
    };
    const reviser: Reviser = { revise: async (_j, _p, d) => d }; // never fixes the issue
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE, maxRepairs: 2,
      planner: planner([]), generator: generator(failing), reviser, verifier: stillBad,
    });
    expect(res.status).toBe("not-ready");
    expect(res.rounds).toBe(0);
  });

  it("a passing base draft is status ready", async () => {
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE,
      planner: planner([]), generator: generator(bulletDraft(["Cut latency 40%"])),
      reviser: { revise: async (_j, _p, d) => d }, verifier: verifier(),
    });
    expect(res.status).toBe("ready");
  });
});

function draftTextHas(d: GeneratedResume, needle: string): boolean {
  return [d.summary, ...d.experiences.flatMap((e) => e.highlights.map((h) => h.text)), ...d.skills]
    .join(" ").toLowerCase().includes(needle);
}
