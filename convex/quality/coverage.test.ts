// convex/quality/coverage.test.ts
import { describe, it, expect } from "vitest";
import { draftText, diffCoverage } from "./coverage";
import type { CoverageMap } from "../llm/types";
import type { GeneratedResume } from "../llm/types";

const draft: GeneratedResume = {
  summary: "Backend engineer scaling Kubernetes clusters",
  experiences: [
    { company: "Acme", position: "SWE", highlights: [
      { text: "Cut p99 latency 40% with Redis caching", type: "rephrase" },
    ] },
  ],
  skills: ["PostgreSQL", "Go"],
  requirements: [],
  keywords: [],
};

describe("draftText", () => {
  it("concatenates summary + bullets + skills, lowercased", () => {
    const t = draftText(draft);
    expect(t).toContain("kubernetes");
    expect(t).toContain("redis caching");
    expect(t).toContain("postgresql");
    expect(t).toBe(t.toLowerCase());
  });
});

describe("diffCoverage", () => {
  const map: CoverageMap = [
    { requirement: "Container orchestration", supportable: true, expectedMarkers: ["kubernetes", "k8s"] },
    { requirement: "Message queues", supportable: true, expectedMarkers: ["kafka", "rabbitmq"] },
    { requirement: "PhD in physics", supportable: false, expectedMarkers: ["phd"] },
  ];

  it("covered = supportable item with a marker present; gap = supportable item with none", () => {
    const { covered, gaps } = diffCoverage(map, draftText(draft));
    expect(covered.map((i) => i.requirement)).toEqual(["Container orchestration"]);
    expect(gaps.map((i) => i.requirement)).toEqual(["Message queues"]);
  });

  it("never treats an unsupportable item as a gap (gaps are supportable-only)", () => {
    const { covered, gaps } = diffCoverage(map, draftText(draft));
    expect([...covered, ...gaps].some((i) => i.supportable === false)).toBe(false);
  });

  it("matches markers case-insensitively", () => {
    const { covered } = diffCoverage(
      [{ requirement: "Orchestration", supportable: true, expectedMarkers: ["KUBERNETES"] }],
      draftText(draft),
    );
    expect(covered.length).toBe(1);
  });

  it("does not fuse adjacent segments into a false-positive match", () => {
    // "deep learn" + "ing" must NOT read as "deep learning" across the segment boundary
    const d = {
      summary: "deep learn",
      experiences: [{ company: "C", position: "P", highlights: [{ text: "ing frameworks", type: "rephrase" }] }],
      skills: [],
      requirements: [],
      keywords: [],
    } as unknown as import("../llm/types").GeneratedResume;
    const { covered, gaps } = diffCoverage(
      [{ requirement: "ML", supportable: true, expectedMarkers: ["deep learning"] }],
      draftText(d),
    );
    expect(covered.length).toBe(0);
    expect(gaps.length).toBe(1);
  });

  it("matches a multi-word marker within a single segment", () => {
    const d = {
      summary: "",
      experiences: [{ company: "C", position: "P", highlights: [{ text: "Cut latency 40% with Redis caching", type: "rephrase" }] }],
      skills: [],
      requirements: [],
      keywords: [],
    } as unknown as import("../llm/types").GeneratedResume;
    const { covered } = diffCoverage(
      [{ requirement: "Caching", supportable: true, expectedMarkers: ["redis caching"] }],
      draftText(d),
    );
    expect(covered.length).toBe(1);
  });

  it("keys coverage on atsTerms (the JD's literal term), not on a paraphrase in expectedMarkers", () => {
    // The soft-skill ATS fix: "analytical skills" must show the JD term itself. A draft that has the
    // evidence paraphrase ("data analysis") but not the literal ATS term ("analytical") is a GAP,
    // because an external scanner credits the JD's word — not our paraphrase.
    const d = {
      summary: "Led data analysis and root cause analysis of fraud trends",
      experiences: [{ company: "C", position: "P", highlights: [{ text: "Analyzed transaction patterns", type: "rephrase" }] }],
      skills: [],
      requirements: [],
      keywords: [],
    } as unknown as import("../llm/types").GeneratedResume;
    const map: CoverageMap = [
      { requirement: "Strong analytical skills", supportable: true, atsTerms: ["analytical"], expectedMarkers: ["data analysis", "root cause analysis", "fraud trends"] },
    ];
    const { covered, gaps } = diffCoverage(map, draftText(d));
    expect(covered.length).toBe(0); // paraphrases present, but the JD term "analytical" is not
    expect(gaps.map((i) => i.requirement)).toEqual(["Strong analytical skills"]);
  });

  it("atsTerms are OR-alternatives of one concept: any one (stem-tolerant) covers it", () => {
    // Real false-negative the eval surfaced: a teamwork requirement marked uncovered though the résumé
    // clearly shows it. atsTerms are synonyms — ANY appearing should cover — and "coordinating" must
    // match "coordinated" (stemming). "collaboratively" appears verbatim; "coordinating"~"coordinated".
    const d = {
      summary: "",
      experiences: [{ company: "C", position: "P", highlights: [
        { text: "Coordinated with kitchen and floor staff and worked collaboratively with the team", type: "rephrase" },
      ] }],
      skills: [],
      requirements: [],
      keywords: [],
    } as unknown as import("../llm/types").GeneratedResume;
    const map: CoverageMap = [
      { requirement: "Coordinating with staff / teamwork", supportable: true, atsTerms: ["coordinating", "teamwork", "collaboratively"], expectedMarkers: [] },
    ];
    const { covered } = diffCoverage(map, draftText(d));
    expect(covered.length).toBe(1);
  });

  it("stem matching tolerates inflections but not near-homographs (analytical != analysis)", () => {
    const mk = (text: string) => ({ summary: text, experiences: [], skills: [], requirements: [], keywords: [] }) as unknown as import("../llm/types").GeneratedResume;
    const item = (t: string): CoverageMap => [{ requirement: "x", supportable: true, atsTerms: [t], expectedMarkers: [] }];
    // inflection: 'communication' should match 'communicated'
    expect(diffCoverage(item("communication"), draftText(mk("communicated findings to leadership"))).covered.length).toBe(1);
    // near-homograph: 'analytical' must NOT be satisfied by 'analysis' alone (they diverge at 5 chars)
    expect(diffCoverage(item("analytical"), draftText(mk("led data analysis of fraud trends"))).covered.length).toBe(0);
    // acronym (<6 chars) is exact-only: 'aml' present, 'kyc' absent
    expect(diffCoverage(item("aml"), draftText(mk("handled aml investigations"))).covered.length).toBe(1);
    expect(diffCoverage(item("kyc"), draftText(mk("handled aml investigations"))).covered.length).toBe(0);
  });

  it("with atsTerms present, the JD term itself satisfies coverage", () => {
    const d = {
      summary: "Applied analytical judgment to fraud cases",
      experiences: [{ company: "C", position: "P", highlights: [{ text: "x", type: "rephrase" }] }],
      skills: [],
      requirements: [],
      keywords: [],
    } as unknown as import("../llm/types").GeneratedResume;
    const map: CoverageMap = [
      { requirement: "Strong analytical skills", supportable: true, atsTerms: ["analytical"], expectedMarkers: ["data analysis"] },
    ];
    const { covered } = diffCoverage(map, draftText(d));
    expect(covered.length).toBe(1);
  });

  it("handles empty draft and empty map without error", () => {
    const empty = { summary: "", experiences: [], skills: [], requirements: [], keywords: [] } as unknown as import("../llm/types").GeneratedResume;
    expect(draftText(empty)).toBe("");
    expect(diffCoverage([], "anything")).toEqual({ covered: [], gaps: [] });
  });
});
