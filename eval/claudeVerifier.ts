import { spawn } from "node:child_process";
import { VERIFICATION_SYSTEM, type CanonicalProfile, type GeneratedResume, type VerificationReport, type Verifier } from "../convex/llm/types";
import { firstJsonValue } from "./json";

const MODEL = process.env.EVAL_VERIFIER_MODEL ?? "claude-haiku-4-5-20251001";

/** Run `claude -p` in JSON mode, sending the prompt via STDIN (no arg-length limit). */
function claudeJson(systemPrompt: string, userContent: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", "--model", MODEL, "--system-prompt", systemPrompt, "--output-format", "json"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("claude CLI timeout")); }, 180_000);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`claude CLI exited ${code}: ${err.slice(0, 500)}`));
    });
    child.stdin.write(userContent);
    child.stdin.end();
  });
}

/** Verifier that drives Claude Haiku through the local `claude` CLI (no Anthropic API key). */
export class ClaudeCliVerifier implements Verifier {
  async verify(jobText: string, profile: CanonicalProfile, resume: GeneratedResume): Promise<VerificationReport> {
    const user = JSON.stringify({ jobDescription: jobText, profile, resume });
    const stdout = await claudeJson(VERIFICATION_SYSTEM, user);
    // --output-format json wraps the reply: { type, subtype, result: "<assistant text>", ... }
    const envelope = JSON.parse(stdout) as { result?: string };
    const text = envelope.result ?? stdout;
    return JSON.parse(firstJsonValue(text)) as VerificationReport;
  }
}
