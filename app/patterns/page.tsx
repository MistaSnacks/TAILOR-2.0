"use client";
import { useAction } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

export default function PatternsPage() {
  const generate = useAction(api.generate.generateFitting);
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const words = jd.trim() ? jd.trim().split(/\s+/).length : 0;

  const onCut = async () => {
    setBusy(true);
    setErr("");
    try {
      const { fittingId } = await generate({ title: title.trim() || "Untitled role", rawText: jd });
      router.push(`/fittings/${fittingId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "generation failed");
      setBusy(false);
    }
  };

  return (
    <>
      <div className="eyebrow">jobs</div>
      <h1>The <em>Pattern</em></h1>
      <p className="lede">
        Paste a job description. TAILOR reads its requirements, finds the threads on your Form that
        match, infers the defensible ones you’d never have listed, and cuts a Fitting.
      </p>
      <div style={{ marginTop: 24 }}>
        <input
          className="title-input"
          placeholder="Role title (e.g. Senior Fraud Analyst)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="pattern"
          placeholder="Paste the job description here…"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
        />
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}>
          <button className="btn" disabled={busy || jd.trim().length < 20} onClick={onCut}>
            {busy ? "Cutting…" : "Cut a Fitting"}
          </button>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-faint)" }}>
            {busy ? "matching threads & tailoring…" : words ? `${words} words` : "paste a pattern to begin"}
          </span>
        </div>
        {err && (
          <div className="note" style={{ borderLeftColor: "var(--bad)" }}>
            Couldn’t generate: {err}
          </div>
        )}
      </div>
    </>
  );
}
