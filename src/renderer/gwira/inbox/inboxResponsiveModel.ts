/** Layout decisions use the Inbox pane after the global shell, never the host viewport. */
export const CONVERSATION_NAVIGATOR_WIDTH = 270;
export const INBOX_CONTEXT_WIDTH = 320;
export const MINIMUM_CONVERSATION_WIDTH = 480;
export const CONVERSATION_MASTER_DETAIL_WIDTH = 700;
/** Main-pane width below which the Needs review queue and source stack as master/detail. */
export const ACTIVITY_SPLIT_WIDTH = 560;
export const INLINE_CONTEXT_WIDTH = 1100;
const PANE_BORDER_BUDGET = 2;

export interface InboxResponsiveInput {
  contentWidth: number;
  activityMode: boolean;
  contextOpen: boolean;
}

export interface InboxResponsiveLayout {
  isMasterDetail: boolean;
  /** Context uses an overlay instead of sharing the message feed's width. */
  isNarrow: boolean;
  navigatorWidth: number;
  contextMode: 'closed' | 'overlay' | 'inline';
  contextWidth: number;
}

export function getInboxResponsiveLayout({ contentWidth, activityMode, contextOpen }: InboxResponsiveInput): InboxResponsiveLayout {
  const width = Number.isFinite(contentWidth) ? Math.max(0, contentWidth) : 0;
  // The navigator is permanent: destination never changes its width or the master/detail threshold.
  const navigatorWidth = CONVERSATION_NAVIGATOR_WIDTH;
  const isMasterDetail = width < CONVERSATION_MASTER_DETAIL_WIDTH;
  const hasInlineContextSpace = width >= INLINE_CONTEXT_WIDTH
    && width - CONVERSATION_NAVIGATOR_WIDTH - INBOX_CONTEXT_WIDTH - PANE_BORDER_BUDGET >= MINIMUM_CONVERSATION_WIDTH;
  const canDockContext = !activityMode && hasInlineContextSpace;
  return {
    isMasterDetail,
    isNarrow: !hasInlineContextSpace,
    navigatorWidth,
    contextMode: !contextOpen || activityMode ? 'closed' : canDockContext ? 'inline' : 'overlay',
    contextWidth: isMasterDetail ? width : Math.min(INBOX_CONTEXT_WIDTH, width)
  };
}
