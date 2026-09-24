const clampDays = (value) => Math.min(60, Math.max(1, Number.parseInt(value, 10) || 1));

const minutesFor = (question) => {
  if (question.difficulty === 3) return 30;
  if (question.difficulty === 2) return 20;
  return 15;
};

export function createSchedule(questions = [], daysAvailable = 5) {
  const daysCount = clampDays(daysAvailable);
  const days = Array.from({ length: daysCount }, (_, index) => ({
    day: index + 1,
    focus: "Review and preparation",
    question_ids: [],
    minutes: 20
  }));

  const sorted = [...questions].sort((a, b) => {
    const priorityA = a.requirement_priority === "must" ? 2 : 1;
    const priorityB = b.requirement_priority === "must" ? 2 : 1;
    return priorityB - priorityA || (b.difficulty || 2) - (a.difficulty || 2);
  });

  if (sorted.length === 0) {
    return { days_available: daysCount, days };
  }

  const chunkSize = Math.max(1, Math.ceil(sorted.length / daysCount));
  let cursor = 0;

  for (let dayIndex = 0; dayIndex < daysCount && cursor < sorted.length; dayIndex += 1) {
    const chunk = sorted.slice(cursor, cursor + chunkSize);
    cursor += chunk.length;
    days[dayIndex].question_ids = chunk.map((question) => question.id);
    days[dayIndex].minutes = chunk.reduce((total, question) => total + minutesFor(question), 0);

    const counts = chunk.reduce((acc, question) => {
      acc[question.category] = (acc[question.category] || 0) + 1;
      return acc;
    }, {});
    const mainCategory = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "mixed";
    days[dayIndex].focus = `${mainCategory} focus`;
  }

  for (let index = cursor; index < days.length; index += 1) {
    days[index].focus = "Review weakest flashcards";
    days[index].minutes = 20;
  }

  return { days_available: daysCount, days };
}
