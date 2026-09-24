import { z } from "zod";

const StateSchema = z.enum(["generated", "edited", "pinned"]);

export const RequirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: z.enum(["technical", "behavioural", "domain"]),
  priority: z.enum(["must", "nice"])
});

export const QuestionSchema = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string()).min(1),
  category: z.enum(["technical", "behavioural", "system-design", "company-fit"]),
  prompt: z.string().min(1),
  answer_outline: z.string().min(1),
  difficulty: z.number().int().min(1).max(3),
  _state: StateSchema.optional()
});

export const FlashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string()).min(1),
  confidence: z.number().int().min(1).max(4).optional(),
  last_reviewed: z.string().optional(),
  _state: StateSchema.optional()
});

export const KitSchema = z.object({
  source: z.object({
    company: z.string(),
    company_url: z.string().url(),
    role: z.string(),
    location: z.string(),
    jd_chars: z.number().int().nonnegative(),
    researched_at: z.string(),
    pages_used: z.array(z.string().url())
  }),
  company_brief: z.object({
    summary: z.string(),
    what_they_do: z.string(),
    sources: z.array(z.string().url()),
    _state: StateSchema.optional()
  }),
  role: z.object({
    title: z.string(),
    seniority: z.string(),
    responsibilities: z.array(z.string()),
    requirements: z.array(RequirementSchema)
  }),
  questions: z.array(QuestionSchema),
  flashcards: z.array(FlashcardSchema),
  schedule: z.object({
    days_available: z.number().int().min(1),
    days: z.array(
      z.object({
        day: z.number().int().min(1),
        focus: z.string(),
        question_ids: z.array(z.string()),
        minutes: z.number().int().nonnegative()
      })
    )
  }),
  coverage: z.object({
    uncovered_requirement_ids: z.array(z.string()),
    passes: z.number().int().min(1)
  }),
  research: z.object({
    warnings: z.array(z.string()),
    public_sources: z.array(z.string().url())
  }).optional()
});

export function validateKitSemantics(kit) {
  const parsed = KitSchema.parse(kit);
  const requirementIds = new Set(parsed.role.requirements.map((req) => req.id));
  const questionIds = new Set(parsed.questions.map((question) => question.id));

  if (new Set(parsed.role.requirements.map((req) => req.id)).size !== parsed.role.requirements.length) {
    throw new Error("Requirement IDs must be stable and unique within a kit.");
  }
  if (new Set(parsed.questions.map((question) => question.id)).size !== parsed.questions.length) {
    throw new Error("Question IDs must be unique within a kit.");
  }
  if (new Set(parsed.flashcards.map((card) => card.id)).size !== parsed.flashcards.length) {
    throw new Error("Flashcard IDs must be unique within a kit.");
  }

  for (const question of parsed.questions) {
    for (const id of question.requirement_ids) {
      if (!requirementIds.has(id)) throw new Error(`Question ${question.id} references unknown requirement ${id}.`);
    }
  }

  for (const card of parsed.flashcards) {
    for (const id of card.requirement_ids) {
      if (!requirementIds.has(id)) throw new Error(`Flashcard ${card.id} references unknown requirement ${id}.`);
    }
  }

  const scheduledQuestionIds = new Set(parsed.schedule.days.flatMap((day) => day.question_ids));
  for (const id of scheduledQuestionIds) {
    if (!questionIds.has(id)) throw new Error(`Schedule references unknown question ${id}.`);
  }

  if (parsed.schedule.days_available !== parsed.schedule.days.length) {
    throw new Error("Schedule day count does not match days_available.");
  }

  const mustIds = parsed.role.requirements
    .filter((req) => req.priority === "must")
    .map((req) => req.id);

  const coveredIds = new Set(parsed.questions.flatMap((question) => question.requirement_ids));
  const uncoveredMust = mustIds.filter((id) => !coveredIds.has(id));
  if (uncoveredMust.length > 0) {
    throw new Error(`Uncovered must-have requirements: ${uncoveredMust.join(", ")}`);
  }
  if (JSON.stringify(parsed.coverage.uncovered_requirement_ids) !== JSON.stringify(uncoveredMust)) {
    throw new Error("Coverage metadata does not match the deterministic coverage check.");
  }

  const scheduledMust = new Set(
    parsed.questions
      .filter((question) => question.requirement_ids.some((id) => mustIds.includes(id)))
      .filter((question) => scheduledQuestionIds.has(question.id))
      .flatMap((question) => question.requirement_ids)
  );
  const unscheduledMust = mustIds.filter((id) => !scheduledMust.has(id));
  if (unscheduledMust.length > 0) {
    throw new Error(`Must-have requirements missing from schedule: ${unscheduledMust.join(", ")}`);
  }

  return parsed;
}
