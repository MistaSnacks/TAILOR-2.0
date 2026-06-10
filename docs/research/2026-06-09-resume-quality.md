# What "Resume Quality" Means in TAILOR

*Status: spec / founding definition — 2026-06-09*
*Scope: end-to-end (corpus → the Form → tailored output). Both doctrine (what good means) and an operational rubric (how we score and gate it).*

Related: `docs/specs/2026-05-29-tailor-design.html`, `docs/plans/2026-06-03-tailor-convex-foundation.md`. Builds on the "best-version" guarantee and the §7 verification gate / §16 coverage loop referenced there.

---

## 1. Quality is defined in service of the moat

TAILOR's moat is **defensible truthfulness at speed**.

The market splits into two failure modes that bracket us:

- **Generic LLM resume tools hallucinate** to fit the job description. They produce confident, JD-shaped bullets that the candidate cannot defend in an interview and that misrepresent their history. Fast, but a liability.
- **Manual tailoring is honest but slow.** Doing it right for every application — re-reading your own history, deciding what's relevant, reframing for the role — costs 30–60 minutes per job. It does not scale to a real job hunt.

TAILOR's quality bar lives in the gap neither side fills: **the best *defensible* resume for this specific JD given the candidate's real corpus, produced fast, and holding up across many applications — including ones the candidate isn't an obvious fit for.**

Every quality dimension in this document is downstream of that sentence. When a dimension trades off against another, the tiebreaker is: *does it protect defensible truthfulness, and does it preserve speed at volume?*

---

## 2. The ICP makes quality *harder*, not easier

Our ICP is a job-hunter with a rich, multi-document career corpus — typically **20–30k tokens** across resumes, CVs, brag docs, and project write-ups — who wants to apply quickly to many roles, **whether or not those roles are domain-relevant**, because the modern hunt demands a tailored resume per application. The center of mass: **laid-off mid-to-senior tech workers looking to pivot** to their next role. Early-career users with a single resume are supported and welcome, but they are not who we optimize the quality bar around.

Three properties of this ICP raise the quality difficulty beyond what a generic resume generator faces:

1. **Large multi-doc corpus → ingestion quality is load-bearing.** With 20–30k tokens spread across overlapping documents, the same job appears multiple times with different titles, date ranges, and bullet phrasings. If canonicalization drops a real experience, mis-merges two employers, or double-counts, *every downstream resume inherits the error*. Quality starts at the Form, not the output.

2. **Pivoters apply off-domain → quality lives in truthful transferable reframing.** The defining ICP case is a candidate whose corpus does **not** obviously match the target JD. A keyword-matching tool produces a weak or empty resume here. TAILOR's quality is measured precisely by how well it surfaces *defensible transferable* evidence and reframes it for the new domain **without lying** — generalizing, re-emphasizing, and re-wording within the bounds of what the evidence entails.

3. **Volume + speed → quality must hold at low per-application effort.** The user is applying to many roles. Quality that requires manual cleanup per application is not quality for this ICP; it's homework. The bar must be met automatically, repeatably, and fast.

---

## 3. The quality bar, stated precisely

> **A finished generation must be the best *defensible* resume for the given JD, given the candidate's corpus.**

"Best defensible" is not aspirational language — it is operationalized as the **fixed point of the bounded coverage loop**:

- **No corpus-defensible JD requirement is left uncovered.** For every requirement in the JD that the corpus *can* defensibly support, the resume surfaces the strongest available evidence for it.
- **No included claim is undefensible.** Every bullet on the page traces to real evidence in the Form, directly or as a defensible entailment.

The loop runs `plan → generate → coverage-diff → targeted revise → fixed point` — bounded, not open-ended refinement. The gap set `{JD requirements} − {corpus-defensible coverage}` is not papered over; it is surfaced to the user as **improvement suggestions** (skills to gain, experience to highlight elsewhere). Selection under the resume's length budget is a submodular/knapsack problem: maximize JD-relevant defensible coverage within the space available.

This bar is **agnostic across users**. It is a property of the (corpus, JD) pair and the rubric below — never tuned to make any one person's resume look better (see §8).

---

## 4. Part A — Form quality (the corpus canonicalization)

The Form is the canonical structured model (JSON-Resume-aligned: `profile`, `experiences`, `skills`, `education`) built by a single LLM canonicalization pass over all parsed document texts. **Garbage in caps output quality**, so the Form has its own quality dimensions.

| Dimension | Definition | Primary failure modes |
|---|---|---|
| **Completeness / recall** | Every real experience, role, skill, and credential present in the corpus is captured in the Form. Nothing the candidate actually did is silently dropped. | Dropped jobs, lost early-career roles, skills mentioned only in a project doc never surfaced. |
| **Dedup correctness** | The same employer/role appearing across documents is merged into one experience; canonical title = most frequent; date range = widest defensible span; bullets unioned under `highlights[]`. | Wrong merges (two different employers collapsed), missed merges (one job listed twice), wrong canonical title, truncated date ranges. |
| **Inference defensibility** | Any attribute not stated verbatim is a defensible entailment of stated evidence (e.g. "used Tableau" → "data visualization"). Nothing fabricated. | Inflated seniority, invented metrics, skills the corpus does not support. |
| **Source fidelity** | Dates, titles, employers, and metrics in the Form match their source documents. No drift introduced during canonicalization. | Date drift, title paraphrase that changes meaning, metric rounding/inflation. |
| **Structural integrity** | JSON-Resume-aligned shape; experiences in reverse-chronological `order`; skills categorized with keywords; education well-formed. | Mis-ordered experiences, uncategorized skill soup, malformed records that break downstream generation. |

---

## 5. Part B — Tailored-output quality (per-job generation)

| Dimension | Definition | Primary failure modes |
|---|---|---|
| **Grounding / truthfulness** | *(Hard gate.)* Every bullet traces to Form evidence — directly or as a defensible entailment. Zero fabrication. This is the moat; it never bends to fit a JD. | Hallucinated achievements, JD-shaped claims with no corpus basis. |
| **Coverage** | For each JD requirement the corpus can defensibly support, the resume surfaces the strongest available evidence. | Defensible evidence left on the cutting-room floor; a requirement the candidate *could* answer goes unaddressed. |
| **Relevance / selection under budget** | Within the length budget, the selected bullets maximize JD relevance. Best defensible resume, not the candidate's entire history. | Page padded with low-relevance bullets; strong-but-generic content crowding out JD-specific evidence. |
| **Transferability framing** | *(Pivot-critical.)* For off-domain JDs, transferable evidence is reframed truthfully via allowed transformations (generalize, re-emphasize, re-word) so its relevance to the new domain is legible. | Off-domain corpus rendered as a weak literal dump; OR over-reach that crosses from reframing into misrepresentation. |
| **Faithful reframing** | Transformations stay inside defensible entailment. Scope, seniority, team size, and metrics are never inflated by the reframing. | "Contributed to" → "led"; "helped analyze" → "owned analytics for"; quantities invented to sound concrete. |
| **ATS-readiness** | Output renders into a parseable template (classic / compact), uses standard sections, and aligns to JD vocabulary without keyword stuffing. | Unparseable layout, JD keywords jammed in unnaturally, non-standard section names. |
| **Impact & clarity** | Strong, specific action verbs; quantified where — and only where — the corpus supports it; concise; free of filler and AI-slop phrasing. | Weak verbs, vague responsibilities-not-achievements, generic "results-driven professional" boilerplate. |
| **Internal consistency** | *(Hard gate.)* No contradictions within the resume or against the Form (dates, titles, employers align). | Overlapping date ranges, title that disagrees with the Form, two bullets that contradict each other. |

### Defensible inference is aggressive, not timid

When a JD requirement is not literally present in the corpus, the generator must **exhaust defensible entailment and transferable framing before declaring a gap**. The truthfulness guarantee is absolute — we never fabricate — but within that hard constraint the generator should push to surface every claim the evidence *legitimately supports*. The goal is the fullest resume that is still 100% defensible, not the most conservative one. Only requirements that survive this exhaustion as genuinely unsupported become gaps (and thus improvement suggestions, §3).

---

## 6. The rubric — gates and grades

Quality is enforced as a mix of **hard gates** (binary; any failure blocks release) and **graded** dimensions (0–100; tracked, regression-gated, surfaced to the user as a quality read-out).

### Hard gates (binary — a failing gen is not shippable)

| Gate | Pass condition | How measured |
|---|---|---|
| **Truthfulness** | 0 undefensible claims — every bullet maps to Form evidence or a defensible entailment. | Verifier pass enumerates each bullet → required evidence link; any unlinked claim fails the gen. |
| **Fidelity** | 0 factual errors vs source — dates, titles, employers, metrics match the corpus. | Verifier cross-checks each factual token against the Form / source docs. |
| **Consistency** | 0 internal contradictions and 0 disagreements with the Form. | Verifier checks date-range overlap, title/employer agreement, bullet-vs-bullet contradiction. |

A hard-gate failure does not get "scored low" — it routes back into the bounded coverage/revise loop and must be resolved before the gen is presented as finished.

### Graded dimensions (0–100, tracked over time)

| Dimension | What a high score looks like | What a low score looks like |
|---|---|---|
| **Coverage** | Every corpus-defensible JD requirement is addressed with its strongest evidence. | Defensible requirements unaddressed; obvious evidence omitted. |
| **Relevance / selection** | The length budget is spent on the most JD-relevant defensible bullets. | Budget wasted on low-relevance content. |
| **Transferability handling** | Off-domain evidence is reframed so its relevance is immediately legible — truthfully. | Literal dump (relevance invisible) or over-reach (caught by the Truthfulness gate). |
| **ATS-readiness** | Clean parse, standard sections, natural JD-vocabulary alignment. | Parse risk, stuffing, non-standard structure. |
| **Impact & clarity** | Specific action verbs, corpus-supported quantification, tight prose, no slop. | Weak verbs, vague duties, boilerplate, AI-slop. |

Each graded dimension is defined by its row plus the failure modes in §5, so two evaluators score it the same way.

---

## 7. Measurement & eval methodology

- **Independent verification.** The verifier is a **separate pass from the generator, ideally a different model vendor**, so the check is independent of the thing it's checking. The generator optimizes; the verifier adjudicates the hard gates and scores the graded dimensions.
- **Synthetic fixtures with ground truth.** Quality is measured against **LLM-synthetic multi-document profiles with authored ground-truth match labels** (chosen for privacy and label control; realism seeded from CC0/MIT datasets). Fixtures span the ICP and beyond: multi-doc senior pivoters, single-doc early-career users, off-domain (JD, corpus) pairs, and adversarial corpora designed to tempt fabrication.
- **Per-dimension scoring + regression gate.** Each generation is scored per §6. Aggregate scores per fixture cohort form the regression baseline; a change that drops a graded dimension or breaks a hard gate on any cohort is a regression and blocks merge.
- **Gaps are first-class output, not failures.** A resume that honestly leaves an unsupported JD requirement uncovered (and surfaces it as an improvement suggestion) is *correct*, not low-quality. The eval rewards honest gaps over fabricated coverage.

---

## 8. Anti-overfitting constraint (non-negotiable)

The rubric, the thresholds, and the generation/verification logic must **never be tuned to make any single corpus look better — including the owner's own resume and generations.** TAILOR is a real product for many users; logic fit to one person's history is invisible bias that degrades everyone else and invalidates eval results.

Operationally: every change that improves a specific profile must answer *"does this generalize?"* and be validated against the diverse seeded fixtures, not one corpus. The owner's resume is just one more test profile, never the target. Any change that only makes sense for one profile is flagged and rejected.

---

## 9. Non-goals (YAGNI)

This spec defines resume quality. It deliberately does **not** cover:

- Visual / graphic design beyond the supported ATS templates (classic, compact).
- Cover letters, LinkedIn profile sync, or other artifact types.
- Multi-language output.
- Interview prep, application tracking, or job-board integrations.

These are out of scope for the quality definition unless and until separately specified.
