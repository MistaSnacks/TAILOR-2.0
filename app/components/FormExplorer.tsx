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
    return <p>No threads yet. Upload some cloth to build your Form.</p>;
  }
  return (
    <div>
      <h2>Threads</h2>
      <ul>
        {threads.map((t) => (
          <li key={t.id}>
            <span>{t.text}</span>{" "}
            {t.sources.length > 0 && (
              <small style={{ color: "#888" }}>— from {t.sources.join(", ")}</small>
            )}
          </li>
        ))}
      </ul>
      {skills.length > 0 && (
        <>
          <h2>Skills</h2>
          <ul>
            {skills.map((s) => (
              <li key={s.name}>
                {s.name} <small style={{ color: "#888" }}>({s.variants.join(", ")})</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
