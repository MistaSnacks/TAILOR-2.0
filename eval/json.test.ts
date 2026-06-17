import { describe, it, expect } from "vitest";
import { firstJsonValue } from "./json";

describe("firstJsonValue", () => {
  it("returns the object and ignores trailing prose", () => {
    expect(firstJsonValue('{"a":1}\n\nNote: done')).toBe('{"a":1}');
  });
  it("ignores a second appended object", () => {
    expect(firstJsonValue('{"a":1}{"b":2}')).toBe('{"a":1}');
  });
  it("is not fooled by braces inside strings", () => {
    expect(firstJsonValue('{"a":"}{"}')).toBe('{"a":"}{"}');
  });
  it("throws when no JSON value is present", () => {
    expect(() => firstJsonValue("no json here")).toThrow();
  });
});
