import { Client } from "pg";
import type { CanonicalProfile } from "../convex/llm/types";

export interface EvalFixture {
  id: string;
  source: "real" | "hf";
  profile: CanonicalProfile;
  jobText: string;
  meta: { email?: string };
}

function client(): Client {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (expected in .env.local)");
  // Strip ?sslmode=... from the URL so we can pass the ssl object directly.
  // pg v8 treats sslmode=require as verify-full, causing self-signed cert errors on Supabase.
  const cleanUrl = connectionString.replace(/([?&])sslmode=[^&]*(&|$)/, (_m, pre, post) =>
    post === "&" ? pre : "",
  );
  return new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
}

/** HF-seeded detection: seeded users have domain @tailor-eval.test and prefix hf-eval-. */
function sourceOf(email: string | null, _isLegacy: boolean | null): "real" | "hf" {
  if (email && /@tailor-eval\.test$/i.test(email)) return "hf";
  if (email && /(\+hf|@example\.|huggingface|seed)/i.test(email)) return "hf";
  return "real";
}

export async function loadFixtures(limit: number): Promise<EvalFixture[]> {
  const db = client();
  await db.connect();
  try {
    const users = await db.query(
      `select u.id, u.email, u.is_legacy from users u
       where exists (select 1 from canonical_experiences ce where ce.user_id = u.id)
         and exists (select 1 from jobs j where j.user_id = u.id and char_length(j.description) >= 200)
       order by u.created_at desc limit $1`,
      [limit],
    );

    const fixtures: EvalFixture[] = [];
    for (const u of users.rows) {
      const exps = await db.query(
        `select id, coalesce(display_company, company) company,
                coalesce(primary_title, title) position, primary_location location,
                start_date, end_date, is_current
         from canonical_experiences where user_id = $1
         order by is_current desc, end_date desc nulls first`,
        [u.id],
      );
      const experiences = [];
      for (const e of exps.rows) {
        const bullets = await db.query(
          `select coalesce(text, content) txt from canonical_experience_bullets
           where canonical_experience_id = $1 order by created_at`,
          [e.id],
        );
        experiences.push({
          company: e.company ?? "",
          position: e.position ?? "",
          location: e.location ?? undefined,
          startDate: e.start_date ?? undefined,
          endDate: e.end_date ?? undefined,
          isCurrent: !!e.is_current,
          highlights: bullets.rows.map((b) => b.txt).filter((t: string) => t && t.trim()),
        });
      }

      const skillRows = await db.query(
        `select coalesce(category, 'Skills') category, coalesce(label, canonical_name, name) label
         from canonical_skills where user_id = $1`,
        [u.id],
      );
      const byCat = new Map<string, string[]>();
      for (const s of skillRows.rows) {
        if (!s.label) continue;
        const arr = byCat.get(s.category) ?? [];
        arr.push(s.label);
        byCat.set(s.category, arr);
      }
      const skills = [...byCat.entries()].map(([name, keywords]) => ({ name, keywords }));

      const edu = await db.query(
        `select institution, field_of_study, degree, start_date, end_date
         from canonical_education where user_id = $1`,
        [u.id],
      );
      const education = edu.rows.map((d) => ({
        institution: d.institution ?? "",
        area: d.field_of_study ?? undefined,
        studyType: d.degree ?? undefined,
        startDate: d.start_date ?? undefined,
        endDate: d.end_date ?? undefined,
      }));

      const job = await db.query(
        `select description from jobs where user_id = $1 and char_length(description) >= 200
         order by created_at desc limit 1`,
        [u.id],
      );
      const jobText = job.rows[0]?.description;
      if (!jobText || experiences.length === 0) continue;

      const profile: CanonicalProfile = { basics: { profiles: [] }, experiences, skills, education };
      fixtures.push({ id: u.id, source: sourceOf(u.email, u.is_legacy), profile, jobText, meta: { email: u.email ?? undefined } });
    }
    return fixtures;
  } finally {
    await db.end();
  }
}
