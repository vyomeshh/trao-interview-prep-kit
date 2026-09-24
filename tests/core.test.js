import test from "node:test";
import assert from "node:assert/strict";
import { createSchedule } from "../core/scheduler.impl.js";
import { checkCoverage } from "../core/coverage.js";
import { KitSchema, validateKitSemantics } from "../core/schema.js";
import { validateExternalUrl } from "../core/scraper.js";

test("coverage only reports uncovered must-have requirements", () => {
  const requirements = [
    { id: "r1", text: "React", kind: "technical", priority: "must" },
    { id: "r2", text: "Mentoring", kind: "behavioural", priority: "must" },
    { id: "r3", text: "Cloud", kind: "domain", priority: "nice" }
  ];
  const questions = [{ id: "q1", requirement_ids: ["r1"] }];
  assert.deepEqual(checkCoverage(requirements, questions).map((r) => r.id), ["r2"]);
});

test("schedule has exactly requested days and puts higher priority/harder questions earlier", () => {
  const questions = [
    { id: "q1", requirement_ids: ["r1"], category: "technical", difficulty: 1, requirement_priority: "nice" },
    { id: "q2", requirement_ids: ["r2"], category: "system-design", difficulty: 3, requirement_priority: "must" },
    { id: "q3", requirement_ids: ["r3"], category: "technical", difficulty: 2, requirement_priority: "must" }
  ];
  const schedule = createSchedule(questions, 5);
  assert.equal(schedule.days.length, 5);
  assert.deepEqual(schedule.days[0].question_ids, ["q2"]);
  assert.deepEqual(schedule.days[1].question_ids, ["q3"]);
  assert.equal(schedule.days.flatMap((d) => d.question_ids).length, 3);
  assert.ok(schedule.days.every((d) => Number.isInteger(d.minutes)));
});

test("structure validation rejects dangling schedule question ids", () => {
  const kit = {
    source: {
      company: "Acme",
      company_url: "https://example.com/",
      role: "Engineer",
      location: "Remote",
      jd_chars: 20,
      researched_at: new Date().toISOString(),
      pages_used: ["https://example.com/"]
    },
    company_brief: {
      summary: "Acme.",
      what_they_do: "Builds software.",
      sources: ["https://example.com/"]
    },
    role: {
      title: "Engineer",
      seniority: "Senior",
      responsibilities: ["Build software"],
      requirements: [{ id: "r1", text: "Node.js", kind: "technical", priority: "must" }]
    },
    questions: [{
      id: "q1",
      requirement_ids: ["r1"],
      category: "technical",
      prompt: "Explain Node.js event loop.",
      answer_outline: "Discuss the event loop.",
      difficulty: 2
    }],
    flashcards: [{
      id: "f1",
      front: "What is Node.js?",
      back: "A JavaScript runtime.",
      requirement_ids: ["r1"]
    }],
    schedule: {
      days_available: 1,
      days: [{ day: 1, focus: "technical", question_ids: ["q999"], minutes: 20 }]
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 }
  };

  assert.throws(() => validateKitSemantics(kit), /Schedule references unknown question/);
});

test("external URL validation blocks loopback addresses in production mode", async () => {
  await assert.rejects(
    validateExternalUrl("http://127.0.0.1:8099/acme/", { allowPrivate: false }),
    /COMPANY_URL_PRIVATE_BLOCKED/
  );
});

test("structure validation accepts a complete kit with empty uncovered requirements", () => {
  const kit = {
    source: {
      company: "Acme",
      company_url: "https://example.com/",
      role: "Engineer",
      location: "Remote",
      jd_chars: 20,
      researched_at: new Date().toISOString(),
      pages_used: ["https://example.com/"]
    },
    company_brief: {
      summary: "Acme.",
      what_they_do: "Builds software.",
      sources: ["https://example.com/"]
    },
    role: {
      title: "Engineer",
      seniority: "Senior",
      responsibilities: ["Build software"],
      requirements: [{ id: "r1", text: "Node.js", kind: "technical", priority: "must" }]
    },
    questions: [{
      id: "q1",
      requirement_ids: ["r1"],
      category: "technical",
      prompt: "Explain Node.js event loop.",
      answer_outline: "Discuss the event loop.",
      difficulty: 2
    }],
    flashcards: [{
      id: "f1",
      front: "What is Node.js?",
      back: "A JavaScript runtime.",
      requirement_ids: ["r1"]
    }],
    schedule: {
      days_available: 1,
      days: [{ day: 1, focus: "technical focus", question_ids: ["q1"], minutes: 20 }]
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 }
  };

  assert.doesNotThrow(() => validateKitSemantics(kit));
  assert.equal(KitSchema.parse(kit).coverage.uncovered_requirement_ids.length, 0);
});
