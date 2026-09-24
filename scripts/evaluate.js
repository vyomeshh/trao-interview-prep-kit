import "dotenv/config";
import fs from "node:fs/promises";
import { buildFullKit } from "../core/orchestrator.js";

function parseArgs(argv) {
  const getValue = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : null;
  };
  return { input: getValue("--input"), output: getValue("--output") };
}

const { input, output } = parseArgs(process.argv.slice(2));
if (!input || !output) {
  console.error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
  process.exit(2);
}

async function run() {
  const raw = await fs.readFile(input, "utf8");
  const cases = JSON.parse(raw);
  if (!Array.isArray(cases)) throw new Error("Input must be an array.");

  const results = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits: []
  };

  for (const testCase of cases) {
    const started = Date.now();
    try {
      if (!testCase?.id || typeof testCase.jd !== "string" || !testCase.company_url) {
        throw new Error("CASE_INPUT_INVALID");
      }

      const kit = await buildFullKit({
        companyUrl: testCase.company_url,
        jobDescription: testCase.jd,
        days: testCase.days
      });

      results.kits.push({
        id: testCase.id,
        status: "ok",
        kit,
        error: null
      });
      console.log(`[${testCase.id}] ok (${Date.now() - started}ms)`);
    } catch (error) {
      results.kits.push({
        id: testCase.id,
        status: "failed",
        kit: null,
        error: {
          code: error.code || "PIPELINE_ERROR",
          message: error.message
        }
      });
      console.error(`[${testCase.id}] failed: ${error.message}`);
    }
  }

  await fs.writeFile(output, JSON.stringify(results, null, 2), "utf8");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
