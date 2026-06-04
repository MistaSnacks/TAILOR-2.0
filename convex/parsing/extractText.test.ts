import { describe, expect, test, vi } from "vitest";
import { extractText } from "./extractText";

describe("extractText", () => {
  test("returns decoded text for text/plain", async () => {
    const bytes = new TextEncoder().encode("Built Tableau dashboards.");
    const text = await extractText("text/plain", bytes.buffer as ArrayBuffer);
    expect(text).toBe("Built Tableau dashboards.");
  });

  test("delegates PDFs to the pdf parser", async () => {
    const pdf = vi.fn(async () => ({ text: "pdf text" }));
    const text = await extractText("application/pdf", new ArrayBuffer(8), { pdf });
    expect(text).toBe("pdf text");
    expect(pdf).toHaveBeenCalledOnce();
  });

  test("throws on an unsupported mime type", async () => {
    await expect(extractText("image/png", new ArrayBuffer(1))).rejects.toThrow(/unsupported/i);
  });
});
