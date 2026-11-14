import { useCallback, useEffect, useRef, useState } from 'react';
import type { CloudChannel } from '../../shared/cloudChannels.js';
import type { ExpectedWorkspace } from '../../shared/scopedPreferences.js';

export function useAuthenticatedChannels(scope: ExpectedWorkspace | undefined) {
  const [channels, setChannels] = useState<CloudChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const live = useRef(false), sequence = useRef(0);
  const userId = scope?.userId, organizationId = scope?.organizationId;
  const refresh = useCallback(async () => {
    if (!userId || !organizationId) return;
    const request = ++sequence.current;
    try {
      const result = await window.codexDesktop.channels.request({ type: 'list' }, { userId, organizationId });
      if (live.current && sequence.current === request) { setChannels(result); setError(''); }
    } catch {
      if (live.current && sequence.current === request) setError('Channels could not be loaded. Check your connection and try again.');
    } finally {
      if (live.current && sequence.current === request) setLoading(false);
    }
  }, [userId, organizationId]);
  useEffect(() => {
    live.current = true;
    setChannels([]);setError('');setLoading(true);
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => { live.current = false; sequence.current++; clearInterval(timer); };
  }, [refresh]);
  return { channels, loading, error, refresh };
}
