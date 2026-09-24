import express from "express";
import crypto from "node:crypto";
import { authenticate, originGuard } from "../middleware/auth.js";
import Kit from "../models/Kit.js";
import { buildFullKit } from "../core/orchestrator.js";
import { createSchedule } from "../core/scheduler.impl.js";
import { validateKitSemantics } from "../core/schema.js";
import { checkCoverage } from "../core/coverage.js";
import {
  generateCompanyBrief,
  generateFlashcards,
  generateQuestions
} from "../core/llm.js";
import { researchCompany } from "../core/scraper.js";

const router = express.Router();
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
router.use(authenticate);
router.use(originGuard);

function hashInput(companyUrl, jobDescription, days) {
  return crypto
    .createHash("sha256")
    .update(`${companyUrl.trim()}\n${jobDescription.trim()}\n${days}`)
    .digest("hex");
}

async function runGeneration(kitId, userId, payload) {
  try {
    const update = (stage, progress) => {
      Kit.updateOne(
        { _id: kitId, userId },
        { $set: { stage, progress } }
      ).catch(() => {});
    };

    update("queued", 2);
    const kitData = await buildFullKit({
      ...payload,
      onProgress: update
    });

    await Kit.updateOne(
      { _id: kitId, userId },
      {
        $set: {
          status: "completed",
          stage: "completed",
          progress: 100,
          kitData,
          error: null
        }
      }
    );
  } catch (error) {
    console.error(`[generation failed] kit=${kitId} code=${error?.code || "PIPELINE_ERROR"} message=${error?.message || error}`);
    await Kit.updateOne(
      { _id: kitId, userId },
      {
        $set: {
          status: "failed",
          stage: "failed",
          progress: 100,
          error: {
            code: error.code || "PIPELINE_ERROR",
            message: error.message
          }
        }
      }
    );
  }
}

router.get("/", asyncHandler(async (req, res) => {
  const kits = await Kit.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .select("-jobDescription")
    .lean();
  return res.json(kits);
}));

router.post("/", asyncHandler(async (req, res) => {
  const companyUrl = String(req.body?.companyUrl || "").trim();
  const jobDescription = String(req.body?.jobDescription || "").trim();
  const days = Number.parseInt(req.body?.days, 10);

  if (!companyUrl || jobDescription.length < 2 || !Number.isInteger(days) || days < 1 || days > 60) {
    return res.status(400).json({
      error: "companyUrl, jobDescription and days (1-60) are required."
    });
  }

  const inputHash = hashInput(companyUrl, jobDescription, days);
  const existing = await Kit.findOne({ userId: req.user.id, inputHash });
  if (existing) {
    if (existing.status === "completed" || existing.status === "processing") {
      return res.status(200).json(existing);
    }

    if (existing.status === "failed") {
      existing.status = "processing";
      existing.stage = "queued";
      existing.progress = 0;
      existing.error = null;
      await existing.save();
      void runGeneration(existing._id, req.user.id, { companyUrl, jobDescription, days });
      return res.status(202).json(existing);
    }
  }

  let kit;
  try {
    kit = await Kit.create({
      userId: req.user.id,
      inputHash,
      companyUrl,
      jobDescription,
      days,
      status: "processing",
      stage: "queued",
      progress: 0
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicate = await Kit.findOne({ userId: req.user.id, inputHash });
      if (duplicate) return res.status(200).json(duplicate);
    }
    throw error;
  }

  void runGeneration(kit._id, req.user.id, { companyUrl, jobDescription, days });

  return res.status(202).json(kit);
}));

router.post("/batch", asyncHandler(async (req, res) => {
  const cases = req.body?.cases;
  if (!Array.isArray(cases) || cases.length === 0 || cases.length > 20) {
    return res.status(400).json({ error: "cases must be a non-empty array of at most 20 items." });
  }

  const queued = [];
  for (const item of cases) {
    const companyUrl = String(item?.company_url || "").trim();
    const jobDescription = String(item?.jd || "").trim();
    const days = Number.parseInt(item?.days, 10);
    if (!item?.id || !companyUrl || jobDescription.length < 2 || !Number.isInteger(days) || days < 1 || days > 60) continue;

    const inputHash = hashInput(companyUrl, jobDescription, days);
    let kit = await Kit.findOne({ userId: req.user.id, inputHash });
    if (!kit) {
      kit = await Kit.create({
        userId: req.user.id,
        inputHash,
        companyUrl,
        jobDescription,
        days,
        status: "processing",
        stage: "queued",
        progress: 0
      });
      void runGeneration(kit._id, req.user.id, { companyUrl, jobDescription, days });
    }
    queued.push({ input_id: item.id, kit_id: kit._id, status: kit.status });
  }

  return res.status(202).json({ queued });
}));

router.post("/:id/retry", asyncHandler(async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.user.id });
  if (!kit) return res.status(404).json({ error: "Kit not found." });
  if (kit.status === "processing") return res.status(202).json(kit);

  kit.status = "processing";
  kit.stage = "queued";
  kit.progress = 0;
  kit.error = null;
  await kit.save();

  void runGeneration(kit._id, req.user.id, {
    companyUrl: kit.companyUrl,
    jobDescription: kit.jobDescription,
    days: kit.days
  });

  return res.status(202).json(kit);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  try {
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.user.id }).lean();
    if (!kit) return res.status(404).json({ error: "Kit not found." });
    return res.json(kit);
  } catch {
    return res.status(404).json({ error: "Kit not found." });
  }
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const current = await Kit.findOne({ _id: req.params.id, userId: req.user.id });
  if (!current) return res.status(404).json({ error: "Kit not found." });
  if (!req.body?.kitData) return res.status(400).json({ error: "kitData is required." });

  try {
    const validated = validateKitSemantics(req.body.kitData);
    current.kitData = validated;
    await current.save();
    return res.json(current);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const deleted = await Kit.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  if (!deleted) return res.status(404).json({ error: "Kit not found." });
  return res.json({ ok: true });
}));

router.post("/:id/regenerate", asyncHandler(async (req, res) => {
  const kitDoc = await Kit.findOne({ _id: req.params.id, userId: req.user.id });
  if (!kitDoc) return res.status(404).json({ error: "Kit not found." });

  const section = req.body?.section;
  const allowedSections = new Set(["brief", "category", "schedule"]);
  if (!allowedSections.has(section)) return res.status(400).json({ error: "Invalid regeneration section." });
  if (!kitDoc.kitData) return res.status(400).json({ error: "Kit is not generated yet." });

  const kit = structuredClone(kitDoc.kitData);
  try {
    const research = await researchCompany(kit.source.company_url, {
      allowPrivate: process.env.NODE_ENV !== "production"
    });

    if (section === "brief") {
      if (kit.company_brief?._state !== "edited" && kit.company_brief?._state !== "pinned") {
        const brief = await generateCompanyBrief(
          research.companyData.companyNameCandidate,
          research.combinedResearchText,
          [...research.companyData.pagesUsed, ...research.discussionData.sources]
        );
        kit.company_brief = {
          summary: brief.summary || "",
          what_they_do: brief.what_they_do || "",
          sources: [...research.companyData.pagesUsed, ...research.discussionData.sources],
          _state: "generated"
        };
      }
    }

    if (section === "category") {
      const category = String(req.body?.category || "");
      if (!["technical", "behavioural", "system-design", "company-fit"].includes(category)) {
        return res.status(400).json({ error: "Invalid question category." });
      }

      const regenerateFor = kit.role.requirements.filter((req) => {
        const target =
          req.kind === "behavioural" ? "behavioural" :
          req.kind === "domain" ? "company-fit" :
          /scalab|architect|distributed|system|performance/i.test(req.text) ? "system-design" :
          "technical";
        return target === category;
      });

      const drafts = await generateQuestions(regenerateFor, research.combinedResearchText, category);
      const regenerated = drafts
        .filter((q) => q.category === category)
        .filter((q) => regenerateFor.some((req) => req.id === q.requirement_id))
        .map((q) => ({
          id: `regen_${crypto.randomUUID()}`,
          requirement_ids: [q.requirement_id],
          category: q.category,
          prompt: String(q.prompt || "").trim(),
          answer_outline: String(q.answer_outline || "").trim(),
          difficulty: Number.parseInt(q.difficulty, 10),
          _state: "generated"
        }))
        .filter((q) => q.prompt && q.answer_outline && q.difficulty >= 1 && q.difficulty <= 3);

      kit.questions = [
        ...kit.questions.filter((q) => q.category !== category || q._state !== "generated"),
        ...regenerated
      ];

      let coveragePasses = Math.max(1, kit.coverage?.passes || 1);
      let gaps = checkCoverage(kit.role.requirements, kit.questions);
      while (gaps.length && coveragePasses < 3) {
        coveragePasses += 1;
        const gapDrafts = await generateQuestions(gaps, research.combinedResearchText, category);
        const additions = gapDrafts
          .filter((q) => q.category === category)
          .filter((q) => gaps.some((req) => req.id === q.requirement_id))
          .map((q) => ({
            id: `regen_${crypto.randomUUID()}`,
            requirement_ids: [q.requirement_id],
            category: q.category,
            prompt: String(q.prompt || "").trim(),
            answer_outline: String(q.answer_outline || "").trim(),
            difficulty: Number.parseInt(q.difficulty, 10),
            _state: "generated"
          }))
          .filter((q) => q.prompt && q.answer_outline && q.difficulty >= 1 && q.difficulty <= 3);
        kit.questions.push(...additions);
        gaps = checkCoverage(kit.role.requirements, kit.questions);
      }

      if (gaps.length) {
        const error = new Error(`COVERAGE_INCOMPLETE:${gaps.map((req) => req.id).join(",")}`);
        error.code = "COVERAGE_INCOMPLETE";
        throw error;
      }

      kit.coverage = {
        uncovered_requirement_ids: [],
        passes: coveragePasses
      };

      // Rebuild schedule because question IDs may have changed; preserve all edited content in other sections.
      const scheduleQuestions = kit.questions.map((q) => ({
        ...q,
        requirement_priority: kit.role.requirements.find((r) => q.requirement_ids.includes(r.id))?.priority || "nice"
      }));
      kit.schedule = createSchedule(scheduleQuestions, kit.schedule.days_available);
    }

    if (section === "schedule") {
      const scheduleQuestions = kit.questions.map((q) => ({
        ...q,
        requirement_priority: kit.role.requirements.find((r) => q.requirement_ids.includes(r.id))?.priority || "nice"
      }));
      kit.schedule = createSchedule(scheduleQuestions, kit.schedule.days_available);
    }

    kit.research = {
      warnings: [...(kit.research?.warnings || []), ...research.companyData.warnings, ...research.discussionData.warnings],
      public_sources: research.discussionData.sources
    };

    const validated = validateKitSemantics({
      ...kit,
      coverage: {
        ...kit.coverage,
        uncovered_requirement_ids: checkCoverage(kit.role.requirements, kit.questions).map((req) => req.id)
      }
    });

    kitDoc.kitData = validated;
    await kitDoc.save();
    return res.json(kitDoc);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}));

router.put("/:id/progress", asyncHandler(async (req, res) => {
  const kitDoc = await Kit.findOne({ _id: req.params.id, userId: req.user.id });
  if (!kitDoc || !kitDoc.kitData) return res.status(404).json({ error: "Kit not found." });

  try {
    const progress = req.body?.flashcards;
    if (!Array.isArray(progress)) return res.status(400).json({ error: "flashcards array is required." });

    const kit = structuredClone(kitDoc.kitData);
    const byId = new Map(progress.map((card) => [card.id, card]));
    kit.flashcards = kit.flashcards.map((card) => ({
      ...card,
      confidence: byId.get(card.id)?.confidence ?? card.confidence,
      last_reviewed: byId.get(card.id)?.last_reviewed ?? card.last_reviewed
    }));
    kitDoc.kitData = validateKitSemantics(kit);
    await kitDoc.save();
    return res.json(kitDoc);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}));

export default router;
