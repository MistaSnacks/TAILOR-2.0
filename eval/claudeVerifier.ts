import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { VERIFICATION_SYSTEM, type CanonicalProfile, type GeneratedResume, type VerificationReport, type Verifier } from "../convex/llm/types";
import { firstJsonValue } from "./json";

const run = promisify(execFile);
const MODEL = process.env.EVAL_VERIFIER_MODEL ?? "claude-haiku-4-5-20251001";

/** Verifier that drives Claude Haiku through the local `claude` CLI (no Anthropic API key). */
export class ClaudeCliVerifier implements Verifier {
  async verify(jobText: string, profile: CanonicalProfile, resume: GeneratedResume): Promise<VerificationReport> {
    const user = JSON.stringify({ jobDescription: jobText, profile, resume });
    const { stdout } = await run(
      "claude",
      ["-p", user, "--model", MODEL, "--system-prompt", VERIFICATION_SYSTEM, "--output-format", "json"],
      { maxBuffer: 16 * 1024 * 1024, timeout: 180_000 },
    );
    // --output-format json wraps the reply: { type, subtype, result: "<assistant text>", ... }
    const envelope = JSON.parse(stdout) as { result?: string };
    const text = envelope.result ?? stdout;
    return JSON.parse(firstJsonValue(text)) as VerificationReport;
  }
}
