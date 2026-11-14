export interface ComposerTextareaHeightRequest {
  scrollHeight: number;
  containerHeight: number;
  minHeight: number;
}

export interface ComposerTextareaHeightResult {
  height: number;
  overflowY: 'auto' | 'hidden';
}

export function composerTextareaHeight(request: ComposerTextareaHeightRequest): ComposerTextareaHeightResult {
  const maxHeight = Math.max(request.minHeight, Math.min(200, Math.floor(request.containerHeight * 0.3)));
  const height = Math.max(request.minHeight, Math.min(request.scrollHeight, maxHeight));
  return {
    height,
    overflowY: request.scrollHeight > maxHeight ? 'auto' : 'hidden'
  };
}
