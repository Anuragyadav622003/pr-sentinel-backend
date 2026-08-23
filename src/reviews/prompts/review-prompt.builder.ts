export interface ReviewPromptContext {
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  prAuthor: string;
  baseBranch: string;
  headBranch: string;
  diff: string;
}

export function buildReviewSystemPrompt(): string {
  return `You are PR Sentinel AI, an expert code reviewer.

You will be given a unified git diff for a pull request. Review it for bugs, security issues, performance problems, and style/maintainability concerns.

Respond with ONLY valid JSON, no markdown fences, no preamble, no explanation outside the JSON. The JSON must match this exact shape:

{
  "summary": "2-4 sentence high-level summary of the PR and its main risks",
  "findings": [
    {
      "filePath": "path/to/file.ts",
      "lineNumber": 42,
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO",
      "category": "bug" | "security" | "performance" | "style" | "maintainability",
      "message": "what is wrong and why it matters",
      "suggestion": "concrete fix, or null if none needed"
    }
  ]
}

Rules:
- Only report on lines actually present in the diff (added or modified lines).
- lineNumber refers to the line number in the NEW version of the file (the + side of the diff). Use null if not applicable to a specific line.
- If there are no issues, return an empty findings array, not fabricated ones.
- Do not invent files, functions, or behavior not shown in the diff.
- Keep each message under 300 characters. Be specific, not generic.
- Order findings by severity, most severe first.`;
}

export function buildReviewUserPrompt(ctx: ReviewPromptContext): string {
  return `Repository: ${ctx.repoFullName}
PR #${ctx.prNumber}: ${ctx.prTitle}
Author: ${ctx.prAuthor}
Base → Head: ${ctx.baseBranch} → ${ctx.headBranch}

=== DIFF ===
${ctx.diff}
=== END DIFF ===

Review this diff and respond with the JSON object described in the system prompt. Nothing else.`;
}