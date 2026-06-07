"use client";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useSession } from "./SessionProvider";

export default function Atelier() {
  const { session } = useSession();
  const documents = useQuery(api.documents.list);
  const profile = useQuery(api.profile.getProfile);
  const jobs = useQuery(api.fittings.listJobs);
  const fittings = useQuery(api.fittings.listFittings);

  const stats = [
    { num: documents?.length ?? 0, label: "Bolts of cloth", tech: "corpus_documents", href: "/cloth" },
    { num: profile?.experiences.length ?? 0, label: "Experiences", tech: "experiences", href: "/form" },
    { num: jobs?.length ?? 0, label: "Patterns", tech: "jobs", href: "/patterns" },
    { num: fittings?.length ?? 0, label: "Fittings", tech: "tailorings", href: "/fittings" },
  ];

  return (
    <>
      <div className="eyebrow">workspace</div>
      <h1>The <em>Atelier</em></h1>
      <p className="lede">
        Welcome back, {session?.name}. Your cloth is uploaded once and the Form is built once —
        every Pattern you bring is cut from it.
      </p>
      <p className="creed">“A tailor alters the cloth you bring. They never weave fabric you don’t own.”</p>

      <div className="grid cols-4" style={{ marginTop: 30 }}>
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card stat">
            <span className={"num" + (s.num === 0 ? " zero" : "")}>{s.num}</span>
            <span className="label">{s.label}</span>
            <span className="tech">{s.tech}</span>
          </Link>
        ))}
      </div>

      <h2 className="section-title">Start here</h2>
      <div className="grid cols-2">
        <Link href="/cloth" className="card">
          <h3 style={{ fontSize: 20 }}>Upload your cloth →</h3>
          <p style={{ color: "var(--ink-dim)", marginTop: 8, fontSize: 14 }}>
            Résumés, memos, a LinkedIn export. TAILOR parses each one into threads and unifies them.
          </p>
        </Link>
        <Link href="/patterns" className="card">
          <h3 style={{ fontSize: 20 }}>Bring a Pattern →</h3>
          <p style={{ color: "var(--ink-dim)", marginTop: 8, fontSize: 14 }}>
            Paste a job description and cut a Fitting — a tailored résumé scored against it.
          </p>
        </Link>
      </div>
    </>
  );
}
