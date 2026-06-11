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
});
