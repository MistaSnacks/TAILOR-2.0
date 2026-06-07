export interface PVBasics {
  name?: string;
  label?: string;
  email?: string;
  phone?: string;
  url?: string;
  summary?: string;
  location?: string;
  profiles?: { network: string; url: string }[];
}
export interface PVExperience {
  company: string;
  position: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  highlights: string[];
}
export interface PVSkill { name: string; keywords: string[] }
export interface PVEducation {
  institution: string;
  area?: string;
  studyType?: string;
  startDate?: string;
  endDate?: string;
}

export function dateRange(start?: string, end?: string, current?: boolean) {
  const e = current ? "Present" : end ?? "";
  if (!start && !e) return "";
  return `${start ?? ""}${start && e ? " – " : ""}${e}`;
}

export function ProfileView({
  basics,
  experiences,
  skills,
  education,
}: {
  basics: PVBasics | null;
  experiences: PVExperience[];
  skills: PVSkill[];
  education: PVEducation[];
}) {
  const hasBasics = !!basics && (basics.name || basics.summary || basics.email);
  if (!hasBasics && experiences.length === 0) {
    return (
      <div className="empty">
        <div className="mark">No profile yet.</div>
        <p>Upload some cloth — the Form builds automatically.</p>
      </div>
    );
  }
  return (
    <>
      {hasBasics && basics && (
        <div className="contact">
          {basics.name && <div className="cname">{basics.name}</div>}
          {basics.label && <div className="clabel">{basics.label}</div>}
          <div className="cmeta">
            {[basics.email, basics.phone, basics.location].filter(Boolean).join("  ·  ")}
            {basics.url && (
              <>
                {" · "}
                <a href={basics.url} target="_blank" rel="noreferrer">{basics.url.replace(/^https?:\/\//, "")}</a>
              </>
            )}
            {(basics.profiles ?? []).map((p) => (
              <span key={p.url}>
                {" · "}
                <a href={p.url} target="_blank" rel="noreferrer">{p.network}</a>
              </span>
            ))}
          </div>
          {basics.summary && <p className="csummary">{basics.summary}</p>}
        </div>
      )}

      {experiences.length > 0 && (
        <>
          <h2 className="section-title">Experience</h2>
          {experiences.map((e, i) => (
            <div className="xp" key={i}>
              <div className="xp-head">
                <span className="xp-co">{e.company}</span>
                <span className="xp-dates">{dateRange(e.startDate, e.endDate, e.isCurrent)}</span>
              </div>
              <div className="xp-role">
                {e.position}
                {e.location ? ` · ${e.location}` : ""}
              </div>
              <ul className="xp-bullets">
                {e.highlights.map((h, j) => (
                  <li key={j}>{h}</li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      {skills.length > 0 && (
        <>
          <h2 className="section-title">Skills</h2>
          <div className="skillcats">
            {skills.map((s, i) => (
              <div className="skillcat" key={i}>
                <div className="skillcat-name">{s.name}</div>
                <div className="chips">
                  {s.keywords.map((k) => (
                    <span className="chip" key={k}>{k}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {education.length > 0 && (
        <>
          <h2 className="section-title">Education</h2>
          <div className="rows">
            {education.map((ed, i) => (
              <div className="row" key={i}>
                <span style={{ fontWeight: 600 }}>{ed.institution}</span>
                <span className="meta">
                  {[ed.studyType, ed.area].filter(Boolean).join(", ")} {dateRange(ed.startDate, ed.endDate)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
