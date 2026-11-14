export interface IconViolation { file: string; line: number; reason: string }
export function inspectIconSource(source: string, file: string): IconViolation[];
export function checkIcons(root?: string): IconViolation[];
