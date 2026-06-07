"use client";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const TYPE_LABEL: Record<string, string> = {
  verbatim: "verbatim",
  rephrase: "rephrased",
  infer: "inferred",
  compose: "composed",
};

export default function FittingRoom() {
  const params = useParams();
  const f = useQuery(api.fittings.getFitting, { fittingId: params.id as Id<"fittings"> });

  if (f === undefined) return <p style={{ color: "var(--ink-dim)" }}>Loading the fitting…</p>;
  if (f === null) return <div className="empty"><div className="mark">Fitting not found.</div></div>;

  const inferred = f.bullets.filter((b) => b.type === "infer" || b.type === "compose").length;
  const bars = [
    { label: "Overall fit", v: f.fit.overall },
    { label: "Keyword coverage", v: f.fit.keyword },
    { label: "Requirement coverage", v: f.fit.requirement },
    { label: "Format parseability", v: f.fit.format },
  ];

  return (
    <>
      <Link href="/fittings" style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-faint)" }}>
        ← fittings
      </Link>
      <div className="eyebrow" style={{ marginTop: 14 }}>a fitting</div>
      <h1 style={{ fontSize: 38 }}>{f.title}</h1>

      <div className="card" style={{ marginTop: 22 }}>
        {bars.map((b) => (
          <div className="fit" key={b.label}>
            <span className="fit-label">{b.label}</span>
            <span className="fit-track"><span className="fit-bar" style={{ width: `${b.v}%` }} /></span>
            <span className="fit-pct">{b.v}%</span>
          </div>
        ))}
      </div>

      <p className="note">
        <b>{f.bullets.length} bullets surfaced — {inferred} you didn’t state outright.</b> Every line
        is grounded in your cloth; inferred &amp; composed lines show what they were derived from.
      </p>

      {f.summary && (
        <>
          <h2 className="section-title">Summary</h2>
          <p style={{ color: "var(--ink)", fontSize: 15.5 }}>{f.summary}</p>
        </>
      )}

      <h2 className="section-title">Tailored bullets</h2>
      <div className="threads">
        {f.bullets.map((b, i) => (
          <div className="thread" key={i}>
            <div className="claim">{b.text}</div>
            <div className="prov">
              <span className={"btype " + b.type}>{TYPE_LABEL[b.type] || b.type}</span>
              {b.relationship ? <span> · {b.relationship}</span> : null}
              {b.grounds.length > 0 && (
                <span> · from “{b.grounds[0].slice(0, 80)}{b.grounds[0].length > 80 ? "…" : ""}”</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {f.requirements.length > 0 && (
        <>
          <h2 className="section-title">Requirement coverage</h2>
          <div className="rows">
            {f.requirements.map((r, i) => (
              <div className="row" key={i}>
                <span className={"badge " + (r.covered ? "parsed" : "failed")}>{r.covered ? "met" : "gap"}</span>
                <span style={{ fontSize: 14 }}>{r.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
