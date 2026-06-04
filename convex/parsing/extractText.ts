// Pure, Convex-free text extraction so it is unit-testable without a runtime.
// Parsers are injectable for tests; the action (parse.ts) passes the real ones.
type PdfParser = (buf: Buffer) => Promise<{ text: string }>;
type DocxParser = (input: { buffer: Buffer }) => Promise<{ value: string }>;

export interface Parsers {
  pdf?: PdfParser;
  docx?: DocxParser;
}

export async function extractText(
  mimeType: string,
  bytes: ArrayBuffer,
  parsers: Parsers = {},
): Promise<string> {
  const buf = Buffer.from(bytes);
  if (mimeType === "text/plain" || mimeType.startsWith("text/")) {
    return new TextDecoder().decode(bytes).trim();
  }
  if (mimeType === "application/pdf") {
    if (!parsers.pdf) throw new Error("no pdf parser provided");
    return (await parsers.pdf(buf)).text.trim();
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    if (!parsers.docx) throw new Error("no docx parser provided");
    return (await parsers.docx({ buffer: buf })).value.trim();
  }
  throw new Error(`unsupported mime type: ${mimeType}`);
}
