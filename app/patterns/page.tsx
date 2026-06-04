"use client";
import { useState } from "react";

export default function PatternsPage() {
  const [jd, setJd] = useState("");
  const words = jd.trim() ? jd.trim().split(/\s+/).length : 0;
  return (
    <>
      <div className="eyebrow">jobs</div>
      <h1>The <em>Pattern</em></h1>
      <p className="lede">
        Paste a job description. TAILOR reads its requirements, finds the threads on your Form that
        match, infers the defensible ones you’d never have listed, and cuts a Fitting.
      </p>
      <div style={{ marginTop: 24 }}>
        <textarea
          className="pattern"
          placeholder="Paste the job description here…"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
        />
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}>
          <button className="btn" disabled>Cut a Fitting</button>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-faint)" }}>
            {words ? `${words} words` : "awaiting a pattern"}
          </span>
        </div>
      </div>
      <div className="note">
        <b>The engine arrives in Plan 3.</b> Pattern parsing, defensible inference, the verification
        gate, and the best-version coverage loop (spec §5–§7, §16–§18) aren’t wired yet — this is
        where you’ll generate a Fitting once that lands.
      </div>
    </>
  );
}
