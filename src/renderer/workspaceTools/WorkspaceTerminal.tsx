import React, { useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { TerminalDataEvent, TerminalSessionSnapshot } from '../../shared/terminal.js';
import { Icon } from '../components/Icon.js';

type Props = {
  sessionId?: string;
  initialCwd?: string;
  onSessionStarted: (sessionId: string) => void;
  onNewSession: (sessionId: string) => void;
};

type SessionState = 'idle' | 'starting' | 'connecting' | 'running' | 'exited' | 'unavailable';

export function WorkspaceTerminalStart({busy=false,unavailable=false,restricted=false,error,onStart}:{busy?:boolean;unavailable?:boolean;restricted?:boolean;error?:string;onStart?:()=>void}):React.ReactElement {
 return <section className="workspace-terminal" aria-label="Terminal">
  <div className="workspace-terminal__start">
   <button type="button" className="workspace-terminal__start-button" disabled={busy||restricted} aria-busy={busy} onClick={onStart}>
    <Icon name="terminal" size={16}/>{busy?'Starting…':unavailable?'Start new terminal':'Start Terminal'}
   </button>
   <p>{restricted?'Terminal execution is unavailable in authenticated workspaces.':unavailable?'This shell disconnected. Start a new local session to continue.':'Local shell with your account permissions. Doats cannot start commands.'}</p>
   {error&&<p className="workspace-terminal__error" role="alert">{error}</p>}
  </div>
 </section>;
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'The terminal request failed. Try again.';
}

export function WorkspaceTerminal({ sessionId, initialCwd, onSessionStarted, onNewSession }: Props): React.ReactElement {
  const [state, setState] = useState<SessionState>(sessionId ? 'connecting' : 'idle');
  const [snapshot, setSnapshot] = useState<TerminalSessionSnapshot>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | undefined>(undefined);
  const outputReadyRef = useRef(false);
  const outputSequenceRef = useRef(0);
  const pendingOutputRef = useRef<TerminalDataEvent[]>([]);
  const dimensionsRef = useRef({ cols: 0, rows: 0 });

  useEffect(() => {
    if (!sessionId) {
      setState('idle');
      setSnapshot(undefined);
      setError('');
      return;
    }
    const activeSessionId: string = sessionId;

    let active = true;
    outputReadyRef.current = false;
    outputSequenceRef.current = 0;
    pendingOutputRef.current = [];
    setState('connecting');
    setSnapshot(undefined);
    setError('');

    const host = hostRef.current;
    if (!host) return;

    const styles = getComputedStyle(document.documentElement);
    const terminal = new Terminal({
      allowProposedApi: false,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: styles.getPropertyValue('--gw-font-mono').trim(),
      fontSize: 13,
      lineHeight: 1.35,
      scrollback: 5000,
      theme: {
        background: styles.getPropertyValue('--gw-surface').trim(),
        foreground: styles.getPropertyValue('--gw-text').trim(),
        cursor: styles.getPropertyValue('--gw-text').trim(),
        selectionBackground: styles.getPropertyValue('--gw-selected').trim()
      }
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminalRef.current = terminal;

    const flushOutput = (events: TerminalDataEvent[], snapshotSequence: number): void => {
      for (const event of events) {
        if (event.sequence <= snapshotSequence) continue;
        terminal.write(event.data);
        outputSequenceRef.current = event.sequence;
      }
    };
    const removeData = window.codexDesktop.terminal.onData(event => {
      if (!active || event.sessionId !== activeSessionId || event.sequence <= outputSequenceRef.current) return;
      if (outputReadyRef.current) {
        terminal.write(event.data);
        outputSequenceRef.current = event.sequence;
      } else {
        pendingOutputRef.current.push(event);
      }
    });
    const removeExit = window.codexDesktop.terminal.onExit(event => {
      if (!active || event.sessionId !== activeSessionId) return;
      setState('exited');
      setSnapshot(current => current ? { ...current, status: 'exited', exitCode: event.exitCode } : current);
    });

    let resizeFrame = 0;
    const fitTerminal = (): void => {
      if (!active || host.clientWidth <= 0 || host.clientHeight <= 0) return;
      try {
        fit.fit();
        const { cols, rows } = terminal;
        // Confirm the session exists before sending dimensions (it may be from a prior app run).
        if (!outputReadyRef.current || cols === dimensionsRef.current.cols && rows === dimensionsRef.current.rows) return;
        dimensionsRef.current = { cols, rows };
        void window.codexDesktop.terminal.resize(activeSessionId, cols, rows).catch(reason => {
          if (active) setError(messageFor(reason));
        });
      } catch (reason) {
        setError(messageFor(reason));
      }
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(fitTerminal);
    });
    observer.observe(host);
    fitTerminal();

    void window.codexDesktop.terminal.get(activeSessionId).then(current => {
      if (!active) return;
      if (!current) {
        setState('unavailable');
        return;
      }
      setSnapshot(current);
      if (current.outputTruncated) terminal.write('\x1b[2m[Earlier terminal output omitted]\r\n\x1b[0m');
      if (current.output) terminal.write(current.output);
      outputSequenceRef.current = current.sequence;
      flushOutput(pendingOutputRef.current, current.sequence);
      pendingOutputRef.current = [];
      outputReadyRef.current = true;
      setState(current.status);
      requestAnimationFrame(() => {
        fitTerminal();
        terminal.focus();
      });
    }).catch(reason => {
      if (active) {
        setError(messageFor(reason));
        setState('unavailable');
      }
    });

    const inputSubscription = terminal.onData(data => {
      void window.codexDesktop.terminal.write(activeSessionId, data).catch(reason => {
        if (active) setError(messageFor(reason));
      });
    });
    terminal.attachCustomKeyEventHandler(event => {
      if (event.type !== 'keydown') return true;
      const key = event.key.toLowerCase();
      const copyShortcut = (event.metaKey && key === 'c') || (event.ctrlKey && event.shiftKey && key === 'c');
      const pasteShortcut = (event.metaKey && key === 'v') || (event.ctrlKey && event.shiftKey && key === 'v');
      if (copyShortcut && terminal.hasSelection()) {
        event.preventDefault();
        void window.codexDesktop.terminal.copy(terminal.getSelection()).catch(reason => setError(messageFor(reason)));
        return false;
      }
      if (pasteShortcut) {
        event.preventDefault();
        void window.codexDesktop.terminal.paste().then(text => {
          if (text) return window.codexDesktop.terminal.write(activeSessionId, text);
        }).catch(reason => setError(messageFor(reason)));
        return false;
      }
      if (event.metaKey && key === 'k') {
        event.preventDefault();
        void clearOutput();
        return false;
      }
      return true;
    });

    async function clearOutput(): Promise<void> {
      try {
        await window.codexDesktop.terminal.clear(activeSessionId);
        terminal.clear();
      } catch (reason) {
        setError(messageFor(reason));
      }
    }

    return () => {
      active = false;
      outputReadyRef.current = false;
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      removeData();
      removeExit();
      inputSubscription.dispose();
      terminal.dispose();
      terminalRef.current = undefined;
      dimensionsRef.current = { cols: 0, rows: 0 };
    };
  }, [sessionId]);

  async function startSession(createNew: boolean): Promise<void> {
    setBusy(true);
    setError('');
    if (!createNew) setState('starting');
    const id = crypto.randomUUID();
    try {
      const current = await window.codexDesktop.terminal.start({ sessionId: id, cols: 80, rows: 24, cwd: initialCwd });
      if (createNew) onNewSession(current.sessionId);
      else {
        setSnapshot(current);
        onSessionStarted(current.sessionId);
      }
    } catch (reason) {
      if (!createNew) setState(sessionId ? 'unavailable' : 'idle');
      setError(messageFor(reason));
    } finally {
      setBusy(false);
    }
  }

  async function restartSession(): Promise<void> {
    if (!sessionId || !terminalRef.current) return;
    setBusy(true);
    setError('');
    const terminal = terminalRef.current;
    const previousSequence = outputSequenceRef.current;
    outputReadyRef.current = false;
    try {
      const current = await window.codexDesktop.terminal.restart(sessionId, terminal.cols, terminal.rows);
      terminal.reset();
      if (current.outputTruncated) terminal.write('\x1b[2m[Earlier terminal output omitted]\r\n\x1b[0m');
      if (current.output) terminal.write(current.output);
      outputSequenceRef.current = current.sequence;
      for (const event of pendingOutputRef.current) {
        if (event.sequence > current.sequence) terminal.write(event.data);
      }
      pendingOutputRef.current = [];
      outputReadyRef.current = true;
      setSnapshot(current);
      setState(current.status);
    } catch (reason) {
      for (const event of pendingOutputRef.current) {
        if (event.sequence > previousSequence) terminal.write(event.data);
      }
      pendingOutputRef.current = [];
      outputReadyRef.current = true;
      setError(messageFor(reason));
      try {
        const current = await window.codexDesktop.terminal.get(sessionId);
        if (current) {
          setSnapshot(current);
          setState(current.status);
        } else {
          setSnapshot(undefined);
          setState('unavailable');
        }
      } catch (statusError) {
        setError(`${messageFor(reason)} Could not confirm terminal status: ${messageFor(statusError)}`);
        setState('unavailable');
      }
    } finally {
      setBusy(false);
      terminal.focus();
    }
  }

  async function clearSession(): Promise<void> {
    if (!sessionId || !terminalRef.current) return;
    try {
      await window.codexDesktop.terminal.clear(sessionId);
      terminalRef.current.clear();
      setError('');
    } catch (reason) {
      setError(messageFor(reason));
    }
  }

  // A newly registered session must render its host before the attachment effect runs.
  if (!sessionId || state === 'unavailable' && !snapshot) {
    const unavailable = state === 'unavailable' && !!sessionId;
    return <WorkspaceTerminalStart busy={busy} unavailable={unavailable} error={error} onStart={()=>void startSession(false)}/>;
  }

  const statusLabel = state === 'running' ? 'Running' : state === 'exited' ? `Exited${snapshot?.exitCode === undefined ? '' : ` · ${snapshot.exitCode}`}` : 'Connecting';
  return <section className="workspace-terminal" aria-label="Terminal">
    <header className="workspace-terminal__toolbar">
      <div className="workspace-terminal__identity">
        <Icon name="terminal" />
        <span className="workspace-terminal__shell" title={snapshot?.shell}>{snapshot?.shell ?? 'Terminal'}</span>
        <span className="workspace-terminal__cwd" title={snapshot?.cwd}>{snapshot?.cwd}</span>
        <span className="workspace-terminal__status" role="status">{statusLabel}</span>
      </div>
      <div className="workspace-terminal__actions">
        <button type="button" aria-label="New Terminal" title="New Terminal" disabled={busy} onClick={() => void startSession(true)}><Icon name="plus" /></button>
        <button type="button" aria-label="Restart Terminal" title="Restart Terminal" disabled={busy} onClick={() => void restartSession()}><Icon name="refresh" /></button>
        <button type="button" aria-label="Clear terminal" title="Clear terminal (⌘K)" disabled={busy} onClick={() => void clearSession()}><Icon name="trash" /></button>
      </div>
    </header>
    {error ? <p className="workspace-terminal__inline-error" role="alert">{error}</p> : null}
    {snapshot?.notice ? <p className="workspace-terminal__notice" role="status">{snapshot.notice}</p> : null}
    <div className="workspace-terminal__screen" ref={hostRef} aria-label="Interactive terminal output" />
  </section>;
}
