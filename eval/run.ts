import { loadEnvLocal } from "./env";
import { loadFixtures } from "./fixtures";
import { scoreFixture } from "./runner";
import { aggregate, diffBaseline, writeScorecard, readBaseline, type FixtureRow } from "./scorecard";

function arg(name: string, def: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`)) ?? "";
  const flagIdx = process.argv.indexOf(`--${name}`);
  if (hit) return hit.split("=")[1];
  if (flagIdx >= 0 && process.argv[flagIdx + 1]) return process.argv[flagIdx + 1];
  return def;
}

async function main() {
  loadEnvLocal();
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set (add to .env.local for the live runner)");
  const n = parseInt(arg("n", "10"), 10);
  const ranAt = arg("at", "manual-run"); // caller passes a timestamp; scripts must not call Date.now()

  console.log(`Loading ${n} fixtures...`);
  const fixtures = await loadFixtures(n);
  console.log(`Running pipeline over ${fixtures.length} fixtures (this is slow)...`);

  const rows: FixtureRow[] = [];
  for (const [i, fx] of fixtures.entries()) {
    process.stdout.write(`  [${i + 1}/${fixtures.length}] ${fx.id} (${fx.source})... `);
    const row = await scoreFixture(fx);
    rows.push(row);
    console.log(row.status === "error" ? "ERROR" : `gate=${row.gatePass} cov=${row.coverageHitRate.toFixed(2)} echo=${row.jdEchoRate.toFixed(2)} rubric=${row.rubricScore}`);
  }

  const agg = aggregate(rows);
  const path = writeScorecard({ ranAt, aggregate: agg, perFixture: rows });
  console.log("\n=== AGGREGATE ===");
  console.table(agg);

  const base = readBaseline();
  if (!base) {
    console.log("\nNo baseline.json yet. Promote this run: cp '" + path + "' eval/results/baseline.json");
  } else {
    const flags = diffBaseline(agg, base);
    console.log(flags.length ? "\nREGRESSIONS:\n - " + flags.join("\n - ") : "\nNo regressions vs baseline.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
