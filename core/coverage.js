export function checkCoverage(requirements = [], questions = []) {
  const coveredIds = new Set(
    questions.flatMap((question) => Array.isArray(question.requirement_ids) ? question.requirement_ids : [])
  );
  return requirements.filter((req) => req.priority === "must" && !coveredIds.has(req.id));
}
