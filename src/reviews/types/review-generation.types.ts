export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface ParsedFinding {
  filePath: string;
  lineNumber: number | null;
  severity: FindingSeverity;
  category: string;
  message: string;
  suggestion: string | null;
}

export interface ParsedReviewResult {
  summary: string;
  findings: ParsedFinding[];
}