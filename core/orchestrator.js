import { researchCompany } from "./scraper.js";
import {
  extractRequirements,
  generateQuestions,
  generateCompanyBrief,
  generateFlashcards
} from "./llm.js";
import { checkCoverage } from "./coverage.js";
import { createSchedule } from "./scheduler.impl.js";
import { validateKitSemantics } from "./schema.js";

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function requirementCategory(requirement) {
  if (requirement.kind === "behavioural") return "behavioural";
  if (requirement.kind === "domain") return "company-fit";
  if (/scalab|architect|distributed|system design|performance/i.test(requirement.text)) return "system-design";
  return "technical";
}

function sanitizeQuestion(draft, requirementMap, id, expectedCategory) {
  const requirement = requirementMap.get(draft.requirement_id);
  if (!requirement || !draft.prompt || !draft.answer_outline || draft.category !== expectedCategory) return null;

  return {
    id,
    requirement_ids: [draft.requirement_id],
    category: draft.category,
    prompt: String(draft.prompt).trim(),
    answer_outline: String(draft.answer_outline).trim(),
    difficulty: Number.parseInt(draft.difficulty, 10),
    _state: "generated"
  };
}

export async function buildFullKit({
  companyUrl,
  jobDescription,
  days,
  onProgress = () => {}
}) {
  const normalizedDays = Math.min(60, Math.max(1, Number.parseInt(days, 10) || 1));
  const trimmedJD = String(jobDescription || "").trim();
  if (trimmedJD.length < 2) throw new Error("JOB_DESCRIPTION_TOO_SHORT");

  onProgress("researching_company", 5);
  const research = await researchCompany(companyUrl, {
    allowPrivate: process.env.NODE_ENV !== "production"
  });

  onProgress("extracting_requirements", 15);
  const role = await extractRequirements(trimmedJD, onProgress);
  const requirementMap = new Map(role.requirements.map((req) => [req.id, req]));

  let questions = [];
  const categories = ["technical", "behavioural", "system-design", "company-fit"];

  for (const category of categories) {
    const categoryRequirements = role.requirements.filter(
      (req) => requirementCategory(req) === category
    );
    if (!categoryRequirements.length) continue;

    const drafts = await generateQuestions(
      categoryRequirements,
      research.combinedResearchText,
      category,
      onProgress
    );

    questions.push(
      ...drafts
        .filter((draft) => draft.category === category)
        .map((draft, index) =>
          sanitizeQuestion(draft, requirementMap, `q${questions.length + index + 1}`, category)
        )
        .filter(Boolean)
    );
  }

  let pass = 1;
  let gaps = checkCoverage(role.requirements, questions);

  while (gaps.length > 0 && pass < 3) {
    pass += 1;
    onProgress(`coverage_pass_${pass}`, 50);

    for (const category of categories) {
      const categoryGaps = gaps.filter((req) => requirementCategory(req) === category);
      if (!categoryGaps.length) continue;

      const drafts = await generateQuestions(
        categoryGaps,
        research.combinedResearchText,
        category,
        onProgress
      );

      for (const draft of drafts) {
        const requirement = requirementMap.get(draft.requirement_id);
        if (!requirement) continue;
        const question = sanitizeQuestion(
          draft,
          requirementMap,
          `q${questions.length + 1}`,
          category
        );
        if (question) questions.push(question);
      }
    }

    questions = uniqueBy(
      questions,
      (q) => `${q.requirement_ids.join(",")}|${q.category}|${q.prompt.toLowerCase()}`
    );
    gaps = checkCoverage(role.requirements, questions);
  }

  const finalGaps = checkCoverage(role.requirements, questions);
  if (finalGaps.length) {
    const error = new Error(`COVERAGE_INCOMPLETE:${finalGaps.map((req) => req.id).join(",")}`);
    error.code = "COVERAGE_INCOMPLETE";
    throw error;
  }

  const brief = await generateCompanyBrief(
    research.companyData.companyNameCandidate,
    research.combinedResearchText,
    [...research.companyData.pagesUsed, ...research.discussionData.sources],
    onProgress
  );

  const flashcardDrafts = await generateFlashcards(role.requirements, onProgress);
  const flashcards = uniqueBy(
    flashcardDrafts
      .filter((card) => requirementMap.has(card.requirement_id))
      .map((card, index) => ({
        id: `f${index + 1}`,
        front: card.front.trim(),
        back: card.back.trim(),
        requirement_ids: [card.requirement_id],
        _state: "generated"
      })),
    (card) => `${card.requirement_ids[0]}|${card.front.toLowerCase()}`
  );

  const scheduleQuestions = questions.map((question) => ({
    ...question,
    requirement_priority: role.requirements.find(
      (req) => question.requirement_ids.includes(req.id)
    )?.priority || "nice"
  }));
  const schedule = createSchedule(scheduleQuestions, normalizedDays);

  const kit = {
    source: {
      company: brief.company || research.companyData.companyNameCandidate || "Unknown",
      company_url: companyUrl,
      role: role.title || "Unspecified role",
      location: role.location || "Unspecified",
      jd_chars: trimmedJD.length,
      researched_at: new Date().toISOString(),
      pages_used: research.companyData.pagesUsed
    },
    company_brief: {
      summary: brief.summary || "",
      what_they_do: brief.what_they_do || "",
      sources: uniqueBy(
        [...research.companyData.pagesUsed, ...research.discussionData.sources],
        (url) => url
      ),
      _state: "generated"
    },
    role: {
      title: role.title || "Unspecified role",
      seniority: role.seniority || "Unspecified",
      responsibilities: role.responsibilities || [],
      requirements: role.requirements
    },
    questions,
    flashcards,
    schedule,
    coverage: {
      uncovered_requirement_ids: [],
      passes: pass
    },
    research: {
      warnings: uniqueBy(
        [...research.companyData.warnings, ...research.discussionData.warnings],
        (warning) => warning
      ),
      public_sources: research.discussionData.sources
    }
  };

  onProgress("validating_kit", 95);
  return validateKitSemantics(kit);
}
