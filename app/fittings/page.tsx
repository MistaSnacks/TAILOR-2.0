"use client";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function FittingsPage() {
  const fittings = useQuery(api.fittings.listFittings);
  return (
    <>
      <div className="eyebrow">resumes</div>
      <h1><em>Fittings</em></h1>
      <p className="lede">
        Each Pattern you tailor becomes a saved Fitting — revisit it, re-export it, or duplicate it.
        Every one carries a fit score and shows what changed and why.
      </p>
      {!fittings || fittings.length === 0 ? (
        <div className="empty">
          <div className="mark">No fittings yet.</div>
          <p>Bring a Pattern to cut your first one.</p>
        </div>
      ) : (
        <div className="rows" style={{ marginTop: 8 }}>
          {fittings.map((f) => (
            <Link key={f.id} href={`/fittings/${f.id}`} className="row">
              <span className="fit-pill">{f.overall}%</span>
              <span style={{ fontFamily: "var(--serif)", fontSize: 17 }}>{f.title}</span>
              <span className="meta">{f.bulletCount} bullets</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
