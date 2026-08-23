import { BadRequestException } from '@nestjs/common';
import { ParsedReviewResult, FindingSeverity } from '../types/review-generation.types';

const VALID_SEVERITIES: FindingSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

export function parseReviewResponse(raw: string): ParsedReviewResult {
  const cleaned = raw
    .trim()
    .replace(/^```(json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new BadRequestException('LLM did not return valid JSON for the review');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('summary' in parsed) ||
    !('findings' in parsed) ||
    !Array.isArray((parsed as any).findings)
  ) {
    throw new BadRequestException('LLM response missing required summary/findings shape');
  }

  const result = parsed as { summary: unknown; findings: unknown[] };

  const summary = typeof result.summary === 'string' ? result.summary : '';

  const findings = result.findings
    .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
    .map((f) => {
      const severity = VALID_SEVERITIES.includes(f.severity as FindingSeverity)
        ? (f.severity as FindingSeverity)
        : 'INFO';

      return {
        filePath: typeof f.filePath === 'string' ? f.filePath : 'unknown',
        lineNumber: typeof f.lineNumber === 'number' ? f.lineNumber : null,
        severity,
        category: typeof f.category === 'string' ? f.category : 'general',
        message: typeof f.message === 'string' ? f.message : '',
        suggestion: typeof f.suggestion === 'string' ? f.suggestion : null,
      };
    });

  return { summary, findings };
}