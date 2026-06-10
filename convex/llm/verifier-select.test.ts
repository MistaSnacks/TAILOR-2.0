import { describe, it, expect } from "vitest";
import { pickVerifierProvider } from "./verifier-select";

describe("pickVerifierProvider", () => {
  const bothKeys = { GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" };

  it("defaults to the OTHER vendor for independence", () => {
    expect(pickVerifierProvider("gemini", bothKeys)).toBe("anthropic");
    expect(pickVerifierProvider("anthropic", bothKeys)).toBe("gemini");
  });

  it("honors an explicit VERIFIER_PROVIDER override", () => {
    expect(pickVerifierProvider("gemini", { ...bothKeys, VERIFIER_PROVIDER: "gemini" })).toBe("gemini");
  });

  it("falls back to the generator vendor when the other vendor's key is missing", () => {
    expect(pickVerifierProvider("gemini", { GEMINI_API_KEY: "g" })).toBe("gemini");
  });
});
