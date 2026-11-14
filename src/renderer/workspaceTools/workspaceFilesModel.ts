export const DEFAULT_FILES_PREVIEW_RATIO = 60;
export type WorkspaceFileIconName = 'image' | 'pdf' | 'markdown' | 'json' | 'table' | 'code-review' | 'file';

export function parseFilesPreviewRatio(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 100
    ? parsed
    : DEFAULT_FILES_PREVIEW_RATIO;
}

export function clampFilesPreviewRatio(
  ratio: number,
  availableWidth: number,
  minimumPreviewWidth: number,
  minimumExplorerWidth: number
): number {
  if (!Number.isFinite(ratio) || availableWidth <= minimumPreviewWidth + minimumExplorerWidth) {
    return DEFAULT_FILES_PREVIEW_RATIO;
  }
  const minimum = (minimumPreviewWidth / availableWidth) * 100;
  const maximum = 100 - (minimumExplorerWidth / availableWidth) * 100;
  return Math.max(minimum, Math.min(maximum, ratio));
}

export function isMarkdownFile(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

export function workspaceFileIcon(name: string): WorkspaceFileIconName {
  const extension = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif', 'tif', 'tiff'].includes(extension ?? '')) return 'image';
  if (extension === 'pdf') return 'pdf';
  if (extension === 'md' || extension === 'markdown') return 'markdown';
  if (extension === 'json') return 'json';
  if (extension === 'csv' || extension === 'tsv' || extension === 'xls' || extension === 'xlsx') return 'table';
  if (['ts', 'tsx', 'js', 'jsx', 'css', 'html', 'py', 'rs', 'go', 'sh', 'yml', 'yaml'].includes(extension ?? '')) return 'code-review';
  return 'file';
}
