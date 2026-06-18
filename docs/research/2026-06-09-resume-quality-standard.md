# TAILOR — Résumé Quality Standard

> **Purpose.** A research-backed, quantitative definition of what a high-quality résumé looks like, and how TAILOR should enforce it during generation. Compiled 2026-06-09 from a 10-agent web research sweep of authoritative career sources (Harvard/MIT/Penn/Berkeley career services, Jobscan, Resume Worded, Indeed, Monster, Google/Laszlo Bock, recruiter eye-tracking studies). Numbers are rules of thumb a generator can enforce — relevance to the target job always overrides defaults.
>
> Pairs with the design spec (`docs/specs/2026-05-29-tailor-design.html`) — this becomes the numeric rulebook behind §16 (best-version), §17 (selection/ranking), and the generation prompt (§18).
>
> **Companion doc:** `2026-06-09-resume-quality.md` defines the *doctrine* (moat/mission/ICP) and the **verification gates + rubric** (truthfulness, fidelity, consistency) that adjudicate output quality. This standard supplies the *numeric content rules*; that doc supplies the *gate definitions*. Both are enforced by the verification pass in `docs/plans/2026-06-10-verification-and-rubric.md`.

---

## 1. Overall shape

| Dimension | Rule |
|---|---|
| **Pages** | <10 yrs → 1 page · 10–15 yrs → 1–2 · senior/exec 15+ → 2 (never 3). ~1 page per 10 yrs. |
| **Word count** | ~400–800 words/page (≈600–1000 for two pages). |
| **Format** | Reverse-chronological (preferred by 90%+ of recruiters & ATS). Functional only for career-change/gaps. |
| **Section order** | Contact → Summary → Experience → Skills → Education → optional. Promote **Skills above Experience** for technical/entry-level; **Education above Experience** only for current students / recent grads. |
| **Recruiter scan** | ~6–7.4 s initial scan; ~80% of gaze on name, current + previous title/company, dates, education. F-pattern. |
| **Typography** | Body 10–11pt, name 16–18pt, headings 12–14pt; margins 0.75″ (clamp 0.5–1″); single column; PDF; never split a job across a page break; page 2 repeats name + page #. |

Sources: [Jobscan — how-long-should-a-resume-be], [Recruiteze one vs two page], [Purdue OWL two pages], [TheLadders eye-tracking study], [Indeed resume-format-guide].

## 2. Summary / headline

- **Include a summary if ≥2 yrs relevant experience** (objective only for zero-experience / career change). Summaries → ~340% more callbacks than objectives.
- **Length: 2–4 sentences / 3–5 lines / ~40–60 words.**
- **Anatomy:** `[Title] + [X]+ yrs in [domain]` → 1–2 **quantified** signature achievements → 2–3 hard skills mirrored verbatim from the JD → optional target-role signal. **Tailor per job.**
- **Headline** (1 line, ≤15 words) under the name: `Target Role | distinguishing qualifier` (e.g. `Senior Product Manager | B2B SaaS`).
- **Ban clichés:** hardworking, team player, results-driven, detail-oriented, passionate, go-getter. No first-person pronouns.

Sources: [Mirrai objective-vs-summary], [Indeed summary-vs-objective], [JobScoutly headline], [ATSFixer intro], [WhatJobs recruiter guide].

## 3. Work history depth

- **Role count:** entry 1–3 · mid 3–5 · senior 4–6 (overall band **3–6**).
- **How far back:** focus on the **last 10–15 years**; older roles → drop or roll into a **dateless "Earlier Experience"** one-liner.
- **Depth taper:** top 2–3 most-relevant roles get full bullets; the rest condensed. **Relevance overrides recency.**
- **Special cases:** same-employer promotions → stack titles separately under one company; short/contract stints → group under one heading; employment gaps → label honestly as a dated entry (don't hide).
- **Length caps count:** ≤4 roles for a 1-pager; 5+ only on 2 pages.

Sources: [Monster how-many-jobs], [Jobscan how-far-back].

## 4. Bullet allocation (counts)

```
Most recent / most relevant : 4–6   (6–8 only senior/exec)
Second role                 : 3–4
Third role                  : 2–3
Roles 4+                    : 1–2   (or title-only)
>12–15 yrs old / irrelevant : title-only or omit
Min per kept role = 2  ·  Max = 6 (8 hard ceiling)
Each bullet = 1–2 lines (≤25 words)
TOTAL CAP  ≈ 18 bullets (1 page) / 28 (2 pages)
Overrides: relevance=high → +1–2 (cap 6) ; relevance=low → cap 2 / title-only
Entry-level exception: with 1–3 roles, give all roles fuller 4–5-bullet treatment.
```

Sources: [Adobe how-many-bullets], [Resume Worded], [Extern bullet guide], [Kickresume], [AiApply].

## 5. Bullet anatomy / quality

- **Formula (Google / Laszlo Bock):** "Accomplished **X** as measured by **Y** by doing **Z**" → action verb + scope/keyword + **quantified result**.
- **Metric density: ≥80% of bullets contain a number / % / $ / measurable result.**
- **Length:** 15–25 words (~19), ≤2 lines. Front-load impact into the first ~8 words (first bullet of the most-recent role is read ~3.5× more than the fourth).
- **Verbs:** strong past-tense (Led, Built, Launched, Reduced, Automated, Designed); present tense only for ongoing duties in the current role; consistent within a job; vary verbs.
- **Bans:** "Responsible for / Duties included / Helped / Assisted / Participated in / Worked on / Handled"; personal pronouns; full sentences; passive voice; 3-line bullets; unproven superlatives.
- **No hard numbers?** quantify with team size, timeframe, scope, frequency, scale, stakeholders.
- **Three honesty tests per bullet:** (1) Could I defend every number in an interview? (2) Is the verb a specific action, not a duty? (3) Would the outcome matter to a stranger reading 50 résumés?

Examples — weak → strong:
- "Responsible for managing social media" → "Grew Instagram following 2K→18K in 6 months via a 3×-weekly content calendar."
- "Worked on the checkout flow" → "Rebuilt the checkout flow in React, cutting cart-abandonment 31%→22% over Q3."

Sources: [Quartz Google formula], [Harvard action verbs + bullet template], [ResumeXrays bullet length], [VitaeKit quantified bullets], [KINETK ATS bullets].

## 6. Skills

> **Revised 2026-06-13**, **corroborated & corrected 2026-06-14** via a deeper firecrawl + exa sweep that reached the underlying primary studies and ~8 university career-center pages. Count and core structure held; the numeric hard/soft ratio and the fixed category scheme were dropped; one earlier number was **corrected** and one separator rule **changed**. Changes flagged inline.

- **15–20 total** (cap ~22 for grouped tech stacks); the **first 5 must match the JD**. **⚖️ Product decision (Camren, 2026-06-14) — deliberately raised from the research-implied 8–15** because users want to see fuller, more complete résumés; a richer skills inventory reads as more substantive. This **knowingly diverges from the descriptive data** (Zety 2024, 93k résumés: avg **9.65** / median **8.81**; Kickresume 2026, 2.1M CVs: median **5** / avg **9** — real-world central tendency ~**5–10**). We accept that tradeoff for perceived completeness. *(Note: an earlier draft cited a "study optimum 13" — that was a secondary-source distortion; the primary figures above supersede it.)*
- **🔒 Guardrail (non-negotiable, overrides the count):** 15–20 is a **target filled only with corpus-defensible skills, NOT a floor to pad toward.** If the profile genuinely supports fewer, the résumé shows fewer — the truthfulness/fidelity hard gates (`2026-06-09-resume-quality.md` §6) win over hitting the number. Never invent or pad generic skills (Git, MS Office, "communication") to reach 15. Watch the high end for keyword-stuffing penalties (scale.jobs) and impact dilution.
- **Within the band, scale by seniority** (data-backed: Zety directors avg **19** vs developers avg **9**). Mid-to-senior tech ICP → fill the full **15–20** where defensible; thinner/early corpora → expect the low end or below (**~10–15**, and fewer if that's all the corpus supports). Derive from the profile, never pad.
- **Hard-dominant** — the section is primarily hard skills + tools + methodologies (Agile, Scrum, Lean Six Sigma, OKRs count as hard). Include a soft skill **only if the JD explicitly names it**; otherwise demonstrate soft skills in experience bullets. *(Replaces the old "~70/30" rule — every 70/30 claim was refuted 0-3.)* **Strong primary backing:** UPenn ("only objective, measurable skills… softer skills should be illustrated, not stated, through experience"), Auburn Engineering ("Don't list soft skills in this area — soft skills need to be expressed in your bullet points"), UNC CS, UCSF. Pitt data: hard skills match at ~60% vs ~28% for soft — another reason the section leans hard.
- **Categorize when ≥8** into 2–4 groups; most-relevant group first. **Derive group names from the candidate's actual skills + the JD**, not a fixed template (fixed scheme refuted 0-3). Heavily confirmed by primary tech career centers: Virginia Tech 2026 (Programming / Tools / Cloud / Cyber / IT), UVA Engineering (Languages / Tools / OS / Software / Hardware), UC Davis (laboratory / computer / research / language). Max 5–7 languages.
- **Separator — CHANGED:** use **commas or bullets, NEVER pipes / vertical bars**. Auburn Engineering: a pipe-separated list is parsed by ATS as *one single skill*. *(Prior text said "comma/pipe-separated" — pipes are now explicitly banned.)* No tables, bars, icons, columns (ATS-breaking + reads as stuffing).
- Top-5 hard skills should **also appear woven into experience bullets** — now **strongly confirmed by primary sources**, not just 3-0 in our sweep: Virginia Tech ("anything listed in skills will be looked for in the bullets — recruiters check when/where it was last used and how"), UVA, Auburn ("provide a timeframe"), Pitt ("validates/demonstrates the skill"). *(The stronger claim that the section outweighs bullets was refuted — it's duplication-helps, not section-wins.)*
- Mirror JD spelling ("JavaScript" not "JS", "PostgreSQL" not "Postgres"). Modern ATS catch exact + some related phrases but synonym/abbreviation matching is **unreliable**, so exact phrasing is the safe hedge. **For acronym-heavy skills, include both forms** — e.g. "AWS (Amazon Web Services)", "SIEM (Security Information and Event Management)" (Virginia Tech) — so the résumé matches whichever the JD uses. Drop universal assumptions (Git, MS Office) unless named.
- **Avoid keyword stuffing:** a long padded skills block helps a machine match but hurts human readers and trips stuffing penalties (scale.jobs; confirmed 3-0). Never dump every ATS-suggested keyword. The cap exists for this reason.
- **Proficiency levels — optional, low-priority.** Some career centers (UC Davis, Auburn) allow "proficient / expert" labels *only when a genuinely high level is an advantage*. TAILOR generally **skips** these — proficiency isn't reliably derivable from the corpus and inventing it violates the truthfulness gate.
- **⏳ Time-sensitive:** ATS are moving toward semantic/LLM matching, but as of 2026 it remains unreliable, so exact-mirroring still wins *today*. Most likely rule to change — revisit.

Sources (2026-06-14 firecrawl+exa sweep, primary-weighted): [Zety 2024 — 93k-résumé study, avg 9.65/median 8.81, directors 19 vs devs 9], [Kickresume 2026 — 2.1M-CV study, median 5/avg 9], [UPenn Career Services], [Auburn Engineering CDCR — soft-skills-out, pipe-breaks-ATS], [Virginia Tech Career 2026 — grouping, acronym+full-term, skills-in-bullets], [UVA Engineering], [UC Davis Career Center], [UNC CS], [Harvard FAS — named grouping, primary], [UCSF Career — hard-dominant, primary], [scale.jobs — ATS scoring/stuffing], [Pitt Career Central — hard 60% vs soft 28% match]. Earlier 6-angle deep-research run + refuted-claims log: workflow `wf_30a119c9-306`.

## 7. Education (by career stage)

| Stage | Placement | Grad year | GPA | Coursework / honors |
|---|---|---|---|---|
| Student / 0–2 yr | Top (after summary) | Yes (or "Expected") | if ≥3.5 | ≤5 courses if relevant; honors |
| 2–5 yr | Below experience | Yes | No | No |
| 5–15 yr | Below experience | Yes | No | No |
| 15+ yr | Bottom, one line | **Omit** | No | No |

- Drop grad year on degrees **>15 yrs old** (age-bias). Exceptions: terminal/regulated degrees (MD, JD, PhD, CPA fields) keep dates/placement.
- Never list high school if any college exists. Multiple degrees → reverse-chron; undergrad becomes one line once a grad degree exists.
- In-progress → "Expected Mon Year" (never "incomplete"); "Coursework toward [Degree]" for partial.
- **Certs / MOOCs → separate "Certifications" section**, not Education.

Sources: [Indeed education section], [Mirrai education], [PassTheScan 20-years], [CNBC grad-year], [Monster unfinished degree].

## 8. Projects

- **Include** for: new grads / students, career-changers, self-taught/bootcamp, sparse or gapped work history, OR an experienced engineer with a **specific skill gap** / a flagship OSS or shipped product.
- **Omit** for senior/staff with strong relevant work history (unless one project beats the next work bullet you'd cut).
- **2–4 entries** (cap 5; new grads 2–3). Each: descriptive name + tech stack (mirror JD keywords) + 1 context line + 2–3 outcome bullets + working link + optional dates.
- **Placement:** above Experience when projects are the central proof (common new-grad order: Education → Projects → Experience → Skills); below Experience when they merely reinforce.
- Reject tutorial clones, generic CRUD, "participated in a hackathon."

Sources: [CoreCV tech projects], [techinterview new-grad], [GetNewResume projects], [ResumeFwd SWE guide], [Rejectless Jake's resume].

## 9. Certifications / Awards / Publications

**Certifications**
- Include if required/preferred in the JD, relevant to the target role, or offsetting thin experience. **3–7 entries** (group into subsections if >7).
- Placement: early-career = under summary; mid = after experience; senior = bottom. Required licenses (CPA, PMP, RN, Bar) go **post-nominal by the name** + summary.
- Format (one line, reverse-chron): full name + acronym · issuer · date earned · expiry/"Active through". In-progress only with a date ≤6 months out. Gating in IT/security/PM/finance/healthcare.

**Awards / Honors**
- Only recent, verifiable, relevant, with **rarity context** ("1 of 12 from 4,200 applicants," "top 1% of 15,000"). 1–2 → fold into bullets; 3+ → own section. Within ~5–10 yrs for non-marquee. Drop high-school / vague internal awards.

**Publications / Patents**
- For academic/research/senior-technical only. Academic CV: list all after Education. Industry: "Selected Publications/Patents," 3–5, link to Scholar/USPTO if long. Patents: USPTO format, header "Patents" (not "Intellectual Property").

Sources: [Harvard certifications], [HBS credentials], [Mirrai certs], [Resume Optimizer Pro awards/patents], [LockedInAI publications].

## 10. Volunteer & optional sections

- **Volunteer:** include if relevant, gap-filling, transferable for a change, leadership, or thin paid experience. Relevant → treat as a job with 2–6 bullets; unrelated-but-worth-keeping → bottom "Volunteer Experience" list (cap 2–4). Avoid political/religious/controversial.
- **Languages:** CEFR/ILR levels or precise labels (not "fluent/conversational"); one relevant → summary; multiple → own section; else fold into Skills.
- **Professional affiliations:** only with active leadership/contribution (3–5); spell out full names; drop passive "member since."
- **Interests/hobbies:** default OMIT; include only if JD-relevant or entry-level (specific, 3–5, non-controversial).
- **Cut order when tight:** hobbies → unrelated volunteer → generic affiliations → non-required languages → old awards. **Never cut:** contact, experience, education, role-relevant skills.

Principle: **every line must earn its place.**

Sources: [Indeed volunteer], [CareerAddict volunteer], [Jobscan languages/interests/sections], [Teal affiliations], [Columbia what to include].

---

## TAILOR generator configuration (enforceable)

A single config the generation prompt + §17 selection can enforce. Seniority is derived from the profile's total years of experience.

```yaml
length:
  pages: { "<10yr": 1, "10-15yr": "1-2", "15yr+": 2 }
  total_bullets_cap: { one_page: 18, two_page: 28 }

summary:
  include_if_years_experience: ">= 2"
  words: [40, 60]
  must: [title_plus_years, "1-2 quantified achievements", "2-3 JD hard-skill keywords"]
  ban_words: [hardworking, "team player", results-driven, detail-oriented, passionate, go-getter, motivated]
  headline_line: true   # "Target Role | qualifier", <= 15 words

experiences:
  count_by_seniority: { entry: [1,3], mid: [3,5], senior: [4,6] }
  window_years: 15
  bullets_per_role: { most_recent: [4,6], second: [3,4], third: [2,3], older: [1,2] }
  bullets_ceiling: 6           # 8 only senior/exec
  bullets_floor_kept_role: 2
  older_than_window: "title-only or roll into 'Earlier Experience'"
  relevance_override: { high: "+1-2 (cap 6)", low: "cap 2 / title-only" }

bullets:
  formula: "action_verb + scope/keyword + quantified_result"
  metric_density_min: 0.80     # >=80% of bullets carry a number/%/$/measure
  words: [15, 25]
  max_lines: 2
  banned_openers: ["Responsible for","Duties included","Helped","Assisted","Worked on","Participated in","Handled"]
  no_pronouns: true
  tense: { current_role: present_ok, past_roles: past }

skills:
  total: [15, 20]              # ⚖️ PRODUCT DECISION 2026-06-14 (Camren): raised from 8-15 for fuller resumes
  # diverges from data (Zety 93k avg 9.65/median 8.81; Kickresume 2.1M median 5/avg 9). accepted tradeoff.
  hard_cap: 22                 # grouped tech only
  fill_rule: target_not_floor  # 🔒 fill 15-20 ONLY with corpus-defensible skills; truthfulness gate overrides count. NEVER pad.
  target_by_seniority:         # scale within band (Zety: directors 19 vs devs 9). derive from profile; never pad.
    thin_or_early: [10, 15]    # or fewer if that's all the corpus defensibly supports
    mid_to_senior_tech: [15, 20]   # TAILOR ICP center
  categories: [2, 4]
  category_scheme: derived_from_corpus_and_jd   # NOT a fixed template
  composition: hard_dominant   # was ~70/30; no numeric ratio supported. strong primary backing (UPenn/Auburn/UNC)
  soft_skill_rule: "include only if named in JD; else demonstrate in bullets"
  first_n_match_jd: 5
  duplicate_top5_in_bullets: true       # duplication section<->bullets is beneficial (VT/UVA/Auburn/Pitt)
  mirror_jd_spelling: true     # safe hedge; ATS synonym matching unreliable (not absolute)
  acronym_and_full_term: true  # e.g. "AWS (Amazon Web Services)" — match whichever the JD uses
  separators: [comma, bullet]  # NEVER pipes/vertical bars — ATS reads a piped list as ONE skill (Auburn)
  proficiency_labels: false    # skip — not reliably derivable from corpus; inventing it breaks truthfulness gate
  no_bars_or_tables: true
  no_keyword_stuffing: true    # padded list helps machine, hurts human reader
  # ⏳ revisit mirror_jd_spelling as ATS adopt semantic/LLM matching (2026+)

education:
  placement_by_stage: { student: top, "2-5yr": below_exp, "5-15yr": below_exp, "15yr+": bottom_one_line }
  show_gpa_if: "gpa >= 3.5 AND years_experience < 3"
  hide_grad_year_if: "degree_age_years > 15 (unless terminal/regulated)"
  certs_separate_section: true

optional_sections:                       # include only when the trigger fires
  projects:    { include_if: ["new_grad","career_change","self_taught","sparse_history","skill_gap","flagship_oss"], count: [2,4] }
  certifications: { include_if: ["required_in_jd","relevant","offsets_thin_experience"], count: [3,7] }
  awards:      { include_if: ["recent_relevant_with_rarity_context"], fold_if_le: 2 }
  publications:{ include_if: ["academic","research","senior_technical"] }
  volunteer:   { include_if: ["relevant","gap_fill","leadership","thin_experience"], count: [2,4] }
  languages:   { include_if: ["jd_relevant","multilingual"], format: "CEFR/ILR" }
cut_order_when_tight: [hobbies, unrelated_volunteer, generic_affiliations, non_required_languages, old_awards]
never_cut: [contact, experience, education, role_relevant_skills]
```

---

## Recommendations for TAILOR (build plan)

1. **Spec — add §20 "Résumé Quality Standard"** to `2026-05-29-tailor-design.html` referencing this doc as the numeric source of truth (done as a sibling: this .md is the canonical rulebook).
2. **Generation prompt (§18)** — inject the hard rules: bullet formula, **≥80% metric density**, 15–25-word length, verb bans, summary 40–60 words + headline, skills 8–15 categorized, and the per-role bullet taper. (Biggest single quality lever; pairs with the §16 best-version loop.)
3. **§17 Selection/Ranking** — encode the bullet-allocation taper, total caps (18/28), role-count-by-seniority, the 10–15-yr window, and relevance overrides as the selection objective's constraints.
4. **Profile schema (v3)** — extend to capture the sections that make a résumé "the whole thing": **projects, certifications, awards, volunteer, languages** (JSON Resume already defines all). Generation then applies the include/omit triggers above.
5. **Seniority-aware rendering** — derive seniority from total experience; drive education placement, grad-year hiding, and skills-above-experience for technical roles in the ATS templates.
6. **Fit score (§9) tie-in** — metric-density and per-role bullet-count compliance can feed a "résumé quality" sub-score alongside keyword/requirement coverage.

**Suggested order:** #2 (prompt rules) → #3 (selection caps) → #4 (schema sections) → #5 (seniority rendering). #2 alone moves output from "looks like a résumé" toward "genuinely well-built."
