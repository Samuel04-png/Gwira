import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

export function useConversationScroll(ref: RefObject<HTMLDivElement | null>, update: unknown, conversation?: string, visible = true): { onScroll: () => void; following: boolean; jump: () => void } {
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);
  useLayoutEffect(() => { followingRef.current = true; setFollowing(true); }, [conversation]);
  useLayoutEffect(() => { const el = ref.current; if (visible && el && followingRef.current) el.scrollTop = el.scrollHeight; }, [update, conversation, visible]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!visible || !el) return;
    const resized = (): void => { if (followingRef.current) el.scrollTop = el.scrollHeight; };
    const observer = new ResizeObserver(resized);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [ref, visible, conversation]);
  const onScroll = (): void => {
    const el = ref.current;
    if (!el) return;
    const next = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
    followingRef.current = next; setFollowing(next);
  };
  const jump = (): void => { followingRef.current = true; setFollowing(true); const el = ref.current; if (el) el.scrollTop = el.scrollHeight; };
  return { onScroll, following, jump };
}
