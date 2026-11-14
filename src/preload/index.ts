import { contextBridge, ipcRenderer } from 'electron';
import type { CodexDesktopApi, CodexExitEvent, CodexOutputEvent, DeleteHistoryRequest, OpenExternalTargetRequest, ReadLocalImageRequest, ResumeSessionRequest, SavePastedImageRequest, SendInputRequest, StartSessionRequest, StopSessionRequest, SwitchGitBranchRequest } from '../shared/types.js';
import type { StartTerminalRequest, TerminalDataEvent, TerminalExitEvent } from '../shared/terminal.js';

const channels = {
  startSession: 'codex:start-session',
  resumeSession: 'codex:resume-session',
  sendInput: 'codex:send-input',
  stopSession: 'codex:stop-session',
  getSession: 'codex:get-session',
  listHistories: 'codex:list-histories',
  listModels: 'codex:list-models',
  listSkills: 'codex:list-skills',
  deleteHistory: 'codex:delete-history',
  getSkillDetail: 'codex:get-skill-detail',
  setSkillEnabled: 'codex:set-skill-enabled',
  uninstallSkill: 'codex:uninstall-skill',
  openSkillFolder: 'codex:open-skill-folder',
  listHistoryProjects: 'codex:list-history-projects',
  listProjectFiles: 'codex:list-project-files',
  listGitBranches: 'codex:list-git-branches',
  switchGitBranch: 'codex:switch-git-branch',
  savePastedImage: 'codex:save-pasted-image',
  readLocalImage: 'codex:read-local-image',
  openExternalTarget: 'codex:open-external-target',
  selectDirectory: 'codex:select-directory',
  selectFiles: 'codex:select-files',
  getCodexBootstrapStatus: 'codex:get-bootstrap-status',
  installCodexCli: 'codex:install-cli',
  restartApp: 'codex:restart-app',
  output: 'codex:output',
  exit: 'codex:exit',
  terminalStart: 'gwira:terminal:start',
  terminalGet: 'gwira:terminal:get',
  terminalWrite: 'gwira:terminal:write',
  terminalResize: 'gwira:terminal:resize',
  terminalClear: 'gwira:terminal:clear',
  terminalRestart: 'gwira:terminal:restart',
  terminalClose: 'gwira:terminal:close',
  terminalCopy: 'gwira:terminal:copy',
  terminalPaste: 'gwira:terminal:paste',
  terminalData: 'gwira:terminal:data',
  terminalExit: 'gwira:terminal:exit'
} as const;

const api: CodexDesktopApi = {
  conversations: {request:(input,expected)=>ipcRenderer.invoke('gwira:conversations:request',input,expected)},
  notifications: {request:(input,expected)=>ipcRenderer.invoke('gwira:notifications:request',input,expected)},
  approvals: {request:(input,expected)=>ipcRenderer.invoke('gwira:approvals:request',input,expected)},
  directory: {request:(input,expected)=>ipcRenderer.invoke('gwira:directory:request',input,expected)},
  channels: {request:(input,expected)=>ipcRenderer.invoke('gwira:channels:request',input,expected)},
  scopedPreferences: {
    read: (key, expected) => ipcRenderer.invoke('gwira:preferences:read', {key, expected}),
    write: (key, value, expected) => ipcRenderer.invoke('gwira:preferences:write', {key, value, expected})
  },
  account: {
    snapshot:()=>ipcRenderer.invoke('gwira:account:snapshot'),command:input=>ipcRenderer.invoke('gwira:account:command',input),
    onChange:callback=>{const listener=(_:Electron.IpcRendererEvent,value:import('../shared/accountAuth.js').AccountSnapshot)=>callback(value);ipcRenderer.on('gwira:account:changed',listener);return()=>ipcRenderer.off('gwira:account:changed',listener);},
    listInvitations:organizationId=>ipcRenderer.invoke('gwira:account:invitation:list',{organizationId}),
    invite:input=>ipcRenderer.invoke('gwira:account:invitation:invite',input),resendInvitation:id=>ipcRenderer.invoke('gwira:account:invitation:resend',{id}),revokeInvitation:id=>ipcRenderer.invoke('gwira:account:invitation:revoke',{id})
  },
  terminal: {
    start: (request: StartTerminalRequest) => ipcRenderer.invoke(channels.terminalStart, request),
    get: (sessionId: string) => ipcRenderer.invoke(channels.terminalGet, sessionId),
    write: (sessionId: string, data: string) => ipcRenderer.invoke(channels.terminalWrite, sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) => ipcRenderer.invoke(channels.terminalResize, sessionId, cols, rows),
    clear: (sessionId: string) => ipcRenderer.invoke(channels.terminalClear, sessionId),
    restart: (sessionId: string, cols: number, rows: number) => ipcRenderer.invoke(channels.terminalRestart, sessionId, cols, rows),
    close: (sessionId: string) => ipcRenderer.invoke(channels.terminalClose, sessionId),
    copy: (text: string) => ipcRenderer.invoke(channels.terminalCopy, text),
    paste: () => ipcRenderer.invoke(channels.terminalPaste),
    onData: (callback: (event: TerminalDataEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: TerminalDataEvent) => callback(event);
      ipcRenderer.on(channels.terminalData, listener);
      return () => ipcRenderer.off(channels.terminalData, listener);
    },
    onExit: (callback: (event: TerminalExitEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: TerminalExitEvent) => callback(event);
      ipcRenderer.on(channels.terminalExit, listener);
      return () => ipcRenderer.off(channels.terminalExit, listener);
    }
  },
  workspaceFiles:{chooseRoot:()=>ipcRenderer.invoke('gwira:files:choose'),list:(root,relative)=>ipcRenderer.invoke('gwira:files:list',root,relative),search:(root,query)=>ipcRenderer.invoke('gwira:files:search',root,query),preview:(root,relative)=>ipcRenderer.invoke('gwira:files:preview',root,relative),copyPath:(root,relative)=>ipcRenderer.invoke('gwira:files:copy-path',root,relative),reveal:(root,relative)=>ipcRenderer.invoke('gwira:files:reveal',root,relative)},
  schedules: { read: (workspaceId) => ipcRenderer.invoke('gwira:schedules:read', workspaceId), change: (workspaceId, command) => ipcRenderer.invoke('gwira:schedules:change', workspaceId, command) },
  startSession: (request: StartSessionRequest) => ipcRenderer.invoke(channels.startSession, request),
  resumeSession: (request: ResumeSessionRequest) => ipcRenderer.invoke(channels.resumeSession, request),
  sendInput: (request: SendInputRequest) => ipcRenderer.invoke(channels.sendInput, request),
  stopSession: (request: StopSessionRequest) => ipcRenderer.invoke(channels.stopSession, request),
  getSession: (sessionId: string) => ipcRenderer.invoke(channels.getSession, sessionId),
  listHistories: (cwd: string) => ipcRenderer.invoke(channels.listHistories, cwd),
  deleteHistory: (request: DeleteHistoryRequest) => ipcRenderer.invoke(channels.deleteHistory, request),
  listModels: () => ipcRenderer.invoke(channels.listModels),
  listSkills: () => ipcRenderer.invoke(channels.listSkills),
  getSkillDetail: (skillId: string) => ipcRenderer.invoke(channels.getSkillDetail, skillId),
  setSkillEnabled: (skillId: string, enabled: boolean) => ipcRenderer.invoke(channels.setSkillEnabled, { skillId, enabled }),
  uninstallSkill: (skillId: string) => ipcRenderer.invoke(channels.uninstallSkill, skillId),
  openSkillFolder: (skillId: string) => ipcRenderer.invoke(channels.openSkillFolder, skillId),
  listHistoryProjects: () => ipcRenderer.invoke(channels.listHistoryProjects),
  listProjectFiles: (cwd: string) => ipcRenderer.invoke(channels.listProjectFiles, cwd),
  listGitBranches: (cwd: string) => ipcRenderer.invoke(channels.listGitBranches, cwd),
  switchGitBranch: (request: SwitchGitBranchRequest) => ipcRenderer.invoke(channels.switchGitBranch, request),
  savePastedImage: (request: SavePastedImageRequest) => ipcRenderer.invoke(channels.savePastedImage, request),
  readLocalImage: (request: ReadLocalImageRequest) => ipcRenderer.invoke(channels.readLocalImage, request),
  openExternalTarget: (request: OpenExternalTargetRequest) => ipcRenderer.invoke(channels.openExternalTarget, request),
  selectDirectory: () => ipcRenderer.invoke(channels.selectDirectory),
  selectFiles: () => ipcRenderer.invoke(channels.selectFiles),
  getCodexBootstrapStatus: () => ipcRenderer.invoke(channels.getCodexBootstrapStatus),
  installCodexCli: () => ipcRenderer.invoke(channels.installCodexCli),
  restartApp: () => ipcRenderer.invoke(channels.restartApp),
  onOutput: (callback: (event: CodexOutputEvent) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: CodexOutputEvent) => callback(event);
    ipcRenderer.on(channels.output, listener);
    return () => ipcRenderer.off(channels.output, listener);
  },
  onExit: (callback: (event: CodexExitEvent) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: CodexExitEvent) => callback(event);
    ipcRenderer.on(channels.exit, listener);
    return () => ipcRenderer.off(channels.exit, listener);
  }
};

contextBridge.exposeInMainWorld('codexDesktop', api);
