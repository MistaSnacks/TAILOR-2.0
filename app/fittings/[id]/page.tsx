"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { dateRange } from "../../components/ProfileView";

const TYPE_LABEL: Record<string, string> = {
  verbatim: "verbatim",
  rephrase: "rephrased",
  infer: "inferred",
  compose: "composed",
};

export default function FittingRoom() {
  const params = useParams();
  const f = useQuery(api.fittings.getFitting, { fittingId: params.id as Id<"fittings"> });
  const profile = useQuery(api.profile.getProfile);
  const [tpl, setTpl] = useState<string | null>(null);

  if (f === undefined) return <p style={{ color: "var(--ink-dim)" }}>Loading the fitting…</p>;
  if (f === null) return <div className="empty"><div className="mark">Fitting not found.</div></div>;

  const template = tpl ?? f.template ?? "classic";
  const basics = profile?.basics ?? null;
  const inferred = f.experiences.reduce(
    (n, e) => n + e.highlights.filter((h) => h.type === "infer" || h.type === "compose").length,
    0,
  );
  const totalBullets = f.experiences.reduce((n, e) => n + e.highlights.length, 0);
  const bars = [
    { label: "Overall fit", v: f.fit.overall },
    { label: "Keyword coverage", v: f.fit.keyword },
    { label: "Requirement coverage", v: f.fit.requirement },
    { label: "Format parseability", v: f.fit.format },
  ];

  const SkillsBlock = f.skills.length > 0 && (
    <section className="paper-sec">
      <h3>Skills</h3>
      <p className="paper-skills">{f.skills.join(" · ")}</p>
    </section>
  );

  const EducationBlock = f.education.length > 0 && (
    <section className="paper-sec">
      <h3>Education</h3>
      {f.education.map((ed, i) => (
        <div className="paper-xp" key={i}>
          <div className="paper-xp-head">
            <span className="paper-co">{ed.institution}</span>
            <span className="paper-dates">{dateRange(ed.startDate, ed.endDate)}</span>
          </div>
          {(ed.studyType || ed.area) && (
            <div className="paper-role">{[ed.studyType, ed.area].filter(Boolean).join(", ")}</div>
          )}
        </div>
      ))}
    </section>
  );

  const ExperienceBlock = (
    <section className="paper-sec">
      <h3>Experience</h3>
      {f.experiences.map((e, i) => (
        <div className="paper-xp" key={i}>
          <div className="paper-xp-head">
            <span className="paper-co">{e.company}</span>
            <span className="paper-dates">{dateRange(e.startDate, e.endDate)}</span>
          </div>
          <div className="paper-role">{e.position}</div>
          <ul>
            {e.highlights.map((h, j) => (
              <li key={j} title={`${TYPE_LABEL[h.type] || h.type}${h.relationship ? " — " + h.relationship : ""}`}>
                {h.text}
                {(h.type === "infer" || h.type === "compose") && <span className="paper-tag">{TYPE_LABEL[h.type]}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );

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
        <b>{totalBullets} bullets surfaced — {inferred} you didn’t state outright.</b> Every line is
        drawn from your Form; inferred &amp; composed lines are tagged.
      </p>

      <div className="tpl-bar">
        <span className="tpl-label">Template</span>
        {["classic", "compact"].map((t) => (
          <button key={t} className={"tpl-btn" + (template === t ? " active" : "")} onClick={() => setTpl(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className={"paper " + template}>
        <header className="paper-head">
          <div className="paper-name">{basics?.name ?? "Your Name"}</div>
          <div className="paper-contact">
            {[basics?.email, basics?.phone, basics?.location].filter(Boolean).join("  ·  ")}
            {basics?.url ? `  ·  ${basics.url.replace(/^https?:\/\//, "")}` : ""}
            {(basics?.profiles ?? []).map((p) => `  ·  ${p.network}`).join("")}
          </div>
        </header>
        {f.summary && (
          <section className="paper-sec">
            <h3>Summary</h3>
            <p>{f.summary}</p>
          </section>
        )}
        {template === "compact" ? (
          <>
            {SkillsBlock}
            {ExperienceBlock}
            {EducationBlock}
          </>
        ) : (
          <>
            {ExperienceBlock}
            {EducationBlock}
            {SkillsBlock}
          </>
        )}
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
