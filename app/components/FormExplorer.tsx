export interface FormThread {
  id: string;
  text: string;
  sources: string[];
}
export interface FormSkill {
  name: string;
  variants: string[];
}

export function FormExplorer({ threads, skills }: { threads: FormThread[]; skills: FormSkill[] }) {
  if (threads.length === 0) {
    return (
      <div className="empty">
        <div className="mark">No threads yet.</div>
        <p>Upload some cloth to build your Form.</p>
      </div>
    );
  }
  return (
    <>
      <h2 className="section-title">
        Threads{" "}
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-faint)" }}>
          {threads.length}
        </span>
      </h2>
      <div className="threads">
        {threads.map((t) => (
          <div className="thread" key={t.id}>
            <div className="claim">{t.text}</div>
            {t.sources.length > 0 && (
              <div className="prov">
                from <b>{t.sources.join(", ")}</b>
              </div>
            )}
          </div>
        ))}
      </div>
      {skills.length > 0 && (
        <>
          <h2 className="section-title">Skills</h2>
          <div className="chips">
            {skills.map((s) => (
              <span className="chip" key={s.name}>
                {s.name}
                {s.variants.length > 0 && <small>{s.variants.join(" · ")}</small>}
              </span>
            ))}
          </div>
        </>
      )}
    </>
  );
}
