export const rendererRoot: string;
export const appearanceDataExceptions: Record<string, string[]>;
export interface PaintHit { value: string; line: number }
export function findRawPaints(source: string, fileName: string): PaintHit[];
export function checkRendererPaints(root?: string): {
  violations: Array<PaintHit & { file: string }>;
  exceptionsUsed: Array<PaintHit & { file: string }>;
};
