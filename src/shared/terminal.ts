export interface StartTerminalRequest {
  sessionId: string;
  cols: number;
  rows: number;
  cwd?: string;
}

export interface TerminalSessionSnapshot {
  sessionId: string;
  shell: string;
  cwd: string;
  status: 'running' | 'exited';
  exitCode?: number;
  output: string;
  sequence: number;
  outputTruncated: boolean;
  notice?: string;
}

export interface TerminalDataEvent {
  sessionId: string;
  sequence: number;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  exitCode: number;
  signal?: number;
}

export interface TerminalApi {
  start(request: StartTerminalRequest): Promise<TerminalSessionSnapshot>;
  get(sessionId: string): Promise<TerminalSessionSnapshot | undefined>;
  write(sessionId: string, data: string): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  clear(sessionId: string): Promise<void>;
  restart(sessionId: string, cols: number, rows: number): Promise<TerminalSessionSnapshot>;
  close(sessionId: string): Promise<boolean>;
  copy(text: string): Promise<void>;
  paste(): Promise<string>;
  onData(callback: (event: TerminalDataEvent) => void): () => void;
  onExit(callback: (event: TerminalExitEvent) => void): () => void;
}
