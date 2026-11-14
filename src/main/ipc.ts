import {fileURLToPath} from 'node:url';
import {authorizedFilePath,listWorkspaceDirectory,previewWorkspaceFile,searchWorkspaceDirectory} from './workspaceFiles.js';
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type IpcMainInvokeEvent, type MessageBoxOptions } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deleteCodexHistoryFile, listCodexHistoriesByCwd, listCodexProjectCandidates } from './codexHistory.js';
import { listCodexModels } from './codexModels.js';
import { getCodexBootstrapStatus, installCodexCli } from './codexBootstrap.js';
import { CodexExecManager } from './codexExecManager.js';
import { TerminalSessionManager } from './terminalSessionManager.js';
import { listGitBranches, switchGitBranch } from './gitBranches.js';
import { listProjectFiles } from './projectFiles.js';
import { disableSkill, enableSkill, getSkillDetail, listLocalSkills, openSkillFolder, uninstallSkill } from './skillStore.js';
import { SessionStore } from './sessionStore.js';
import type { DeleteHistoryRequest, OpenExternalTargetRequest, ReadLocalImageRequest, ReadLocalImageResult, ResumeSessionRequest, SavePastedImageRequest, SendInputRequest, StartSessionRequest, StopSessionRequest, SwitchGitBranchRequest } from '../shared/types.js';
import type { StartTerminalRequest } from '../shared/terminal.js';
import type {ExecutionContext} from './auth/executionContext.js';

export const channels = {
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
  exit: 'codex:exit'
} as const;

const localOnlyChannels = new Set<string>([
  channels.startSession, channels.resumeSession, channels.sendInput, channels.stopSession, channels.getSession,
  channels.listHistories, channels.deleteHistory, channels.listHistoryProjects, channels.listProjectFiles,
  channels.listGitBranches, channels.switchGitBranch, channels.savePastedImage, channels.readLocalImage,
  channels.selectDirectory, channels.selectFiles, channels.openExternalTarget, channels.listModels,
  channels.getCodexBootstrapStatus, channels.installCodexCli, channels.restartApp, channels.listSkills,
  channels.getSkillDetail, channels.setSkillEnabled, channels.uninstallSkill, channels.openSkillFolder,
  'gwira:files:choose', 'gwira:files:list', 'gwira:files:search', 'gwira:files:preview',
  'gwira:files:copy-path', 'gwira:files:reveal', 'gwira:terminal:start', 'gwira:terminal:get',
  'gwira:terminal:write', 'gwira:terminal:resize', 'gwira:terminal:clear', 'gwira:terminal:restart',
  'gwira:terminal:close', 'gwira:terminal:copy', 'gwira:terminal:paste'
]);

export function registerIpc(codexManager: CodexExecManager, sessions: SessionStore, execution: ExecutionContext): void {
  const projectFileScans = new Map<number, AbortController>();
  const fileRoots=new Map<number,Map<string,string>>();
  const sessionOwners = new Map<string,{windowId:number;ticket:number}>();
  const sessionWindows = new Set<number>();
  const terminalManager = new TerminalSessionManager({acquireProcessLease:()=>execution.beginLocalOperation().release});
  const terminalOwners = new Set<number>();
  const trustedFilesCaller=(event:IpcMainInvokeEvent):void=>{
    const frame=event.senderFrame,url=frame?.url??'',dev=!app.isPackaged?process.env.ELECTRON_RENDERER_URL:undefined;
    let trusted=false;try{trusted=dev?new URL(url).origin===new URL(dev).origin:url.startsWith('file:')&&fileURLToPath(url.split('?')[0]!)===path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../renderer/index.html');}catch{}
    if(!trusted||frame!==event.sender.mainFrame||!BrowserWindow.fromWebContents(event.sender))throw Error('File access requires the local Gwira window.');
  };
  const handle = <T extends unknown[], R>(channel: string, listener: (event: IpcMainInvokeEvent, ...args: T) => R): void => {
    if (!localOnlyChannels.has(channel)) throw new Error(`Unclassified local IPC channel: ${channel}`);
    ipcMain.handle(channel, async (event, ...args: T) => {
      trustedFilesCaller(event);
      const {ticket,release} = execution.beginLocalOperation();
      try {
        const result = await listener(event, ...args);
        execution.assertLocal(ticket);
        trustedFilesCaller(event);
        return result;
      } finally { release(); }
    });
  };
  execution.onChange(() => {
    for (const scan of projectFileScans.values()) scan.abort();
    projectFileScans.clear();
    fileRoots.clear();
    sessionOwners.clear();
    terminalManager.disposeAll();
    codexManager.revokeAll();
  });
  const ownSession=(event:IpcMainInvokeEvent,sessionId:string,ticket:number):void=>{
    sessionOwners.set(sessionId,{windowId:event.sender.id,ticket});
    if(sessionWindows.has(event.sender.id))return;
    sessionWindows.add(event.sender.id);
    event.sender.once('destroyed',()=>{
      sessionWindows.delete(event.sender.id);
      for(const [id,owner] of sessionOwners)if(owner.windowId===event.sender.id){sessionOwners.delete(id);codexManager.revokeSession(id);}
    });
  };
  const approvedRoot=(event:IpcMainInvokeEvent,id:string):string=>{trustedFilesCaller(event);const root=fileRoots.get(event.sender.id)?.get(id);if(!root)throw Error('Choose an approved workspace folder first.');return root;};
  handle('gwira:files:choose',async event=>{
    trustedFilesCaller(event);
    const ticket=execution.localTicket();
    const captureRoot=!app.isPackaged&&process.env.ELECTRON_WORKFLOW_CAPTURE==='1'&&process.env.ELECTRON_WORKFLOW_CAPTURE_F3_SCENARIO?.startsWith('files-')
      ?process.env.ELECTRON_WORKFLOW_CAPTURE_FILES_ROOT:undefined;
    let selectedPath:string;
    if(captureRoot){
      const captureBase=await fs.realpath(path.join(app.getAppPath(),'artifacts/workflow/.capture-temp-files-redesign'));
      const candidate=await fs.realpath(captureRoot);
      const relative=path.relative(captureBase,candidate);
      if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw Error('The Files capture folder must be inside the temporary capture directory.');
      selectedPath=candidate;
    }else{
      const result=await dialog.showOpenDialog({properties:['openDirectory'],title:'Allow read-only access to a workspace folder'});
      if(result.canceled||!result.filePaths[0])return undefined;
      selectedPath=result.filePaths[0];
    }
    const root=await fs.realpath(selectedPath);
    execution.assertLocal(ticket);
    trustedFilesCaller(event);
    const id=randomUUID();
    let roots=fileRoots.get(event.sender.id);
    if(!roots){roots=new Map();fileRoots.set(event.sender.id,roots);event.sender.once('destroyed',()=>fileRoots.delete(event.sender.id));}
    roots.set(id,root);
    return {id,name:path.basename(root),fingerprint:createHash('sha256').update(root).digest('hex')};
  });
  handle('gwira:files:list',(event,id:string,relative:string)=>listWorkspaceDirectory(approvedRoot(event,id),relative));
  handle('gwira:files:search',(event,id:string,query:string)=>searchWorkspaceDirectory(approvedRoot(event,id),query));
  handle('gwira:files:preview',(event,id:string,relative:string)=>previewWorkspaceFile(approvedRoot(event,id),relative));
  handle('gwira:files:copy-path',async(event,id:string,relative:string)=>{const ticket=execution.localTicket();const target=await authorizedFilePath(approvedRoot(event,id),relative);execution.assertLocal(ticket);trustedFilesCaller(event);clipboard.writeText(target);});
  handle('gwira:files:reveal',async(event,id:string,relative:string)=>{const ticket=execution.localTicket();const target=await authorizedFilePath(approvedRoot(event,id),relative);execution.assertLocal(ticket);trustedFilesCaller(event);shell.showItemInFolder(target);});

  const terminalOwner = (event: IpcMainInvokeEvent): BrowserWindow => {
    trustedFilesCaller(event);
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) throw new Error('Terminal access requires the local Gwira window.');
    return owner;
  };
  const confirmTerminalAction = async (owner: BrowserWindow, action: 'start' | 'restart' | 'close', cwd = os.homedir()): Promise<boolean> => {
    const closing = action === 'close';
    const result = await dialog.showMessageBox(owner, {
      type: 'warning',
      buttons: ['Cancel', closing ? 'Close Terminal' : action === 'restart' ? 'Restart Terminal' : 'Open Terminal'],
      defaultId: 0,
      cancelId: 0,
      title: closing ? 'Close this terminal?' : action === 'restart' ? 'Restart this terminal?' : 'Open a local terminal?',
      message: closing ? 'Closing this terminal will stop its running process.' : 'Terminal commands run with your operating-system account permissions.',
      detail: closing
        ? 'Any command running in this session will be interrupted.'
        : `Gwira will ${action === 'restart' ? 'restart your local shell' : 'open your local shell'} in ${cwd}. Commands can access anything your user account can access. Terminal text is kept only in memory and is not sent to Doats or written to application logs.`
    });
    if (result.response !== 1) {
      if (closing) return false;
      throw new Error('Terminal action was cancelled.');
    }
    return true;
  };
  terminalManager.onData(({ ownerId, ...payload }) => {
    try { execution.localTicket(); } catch { return; }
    const owner = BrowserWindow.getAllWindows().find(window => window.webContents.id === ownerId);
    if (owner && !owner.isDestroyed()) owner.webContents.send('gwira:terminal:data', payload);
  });
  terminalManager.onExit(({ ownerId, ...payload }) => {
    try { execution.localTicket(); } catch { return; }
    const owner = BrowserWindow.getAllWindows().find(window => window.webContents.id === ownerId);
    if (owner && !owner.isDestroyed()) owner.webContents.send('gwira:terminal:exit', payload);
  });
  app.once('before-quit', () => terminalManager.disposeAll());
  handle('gwira:terminal:start', async (event, request: StartTerminalRequest) => {
    const owner = terminalOwner(event);
    const ticket = execution.localTicket();
    if (!request || typeof request !== 'object' || !Number.isInteger(request.cols) || !Number.isInteger(request.rows) || typeof request.sessionId !== 'string'
      || request.cwd !== undefined && (typeof request.cwd !== 'string' || request.cwd.length === 0 || request.cwd.length > 4096)) {
      throw new Error('Terminal start request is invalid.');
    }
    let cwd = os.homedir();
    let notice: string | undefined;
    if (request.cwd) {
      try {
        const selected = await fs.realpath(request.cwd);
        if (!(await fs.stat(selected)).isDirectory()) throw new Error('Selected path is not a directory.');
        cwd = selected;
      } catch {
        notice = 'The selected project folder could not be opened. Terminal started in your home folder instead.';
      }
    }
    await confirmTerminalAction(owner, 'start', cwd);
    execution.assertLocal(ticket);
    trustedFilesCaller(event);
    if (!terminalOwners.has(event.sender.id)) {
      terminalOwners.add(event.sender.id);
      event.sender.once('destroyed', () => {
        terminalOwners.delete(event.sender.id);
        terminalManager.disposeOwner(event.sender.id);
      });
    }
    return terminalManager.start(event.sender.id, request.sessionId, request.cols, request.rows, cwd, notice);
  });
  handle('gwira:terminal:get', (event, sessionId: string) => {
    terminalOwner(event);
    return terminalManager.get(event.sender.id, sessionId);
  });
  handle('gwira:terminal:write', (event, sessionId: string, data: string) => {
    terminalOwner(event);
    terminalManager.write(event.sender.id, sessionId, data);
  });
  handle('gwira:terminal:resize', (event, sessionId: string, cols: number, rows: number) => {
    terminalOwner(event);
    terminalManager.resize(event.sender.id, sessionId, cols, rows);
  });
  handle('gwira:terminal:clear', (event, sessionId: string) => {
    terminalOwner(event);
    terminalManager.clear(event.sender.id, sessionId);
  });
  handle('gwira:terminal:restart', async (event, sessionId: string, cols: number, rows: number) => {
    const owner = terminalOwner(event);
    const ticket = execution.localTicket();
    const current = terminalManager.get(event.sender.id, sessionId);
    if (!current) throw new Error('This terminal session is no longer available. Start a new terminal.');
    await confirmTerminalAction(owner, 'restart', current.cwd);
    execution.assertLocal(ticket);
    trustedFilesCaller(event);
    return terminalManager.restart(event.sender.id, sessionId, cols, rows);
  });
  handle('gwira:terminal:close', async (event, sessionId: string) => {
    const owner = terminalOwner(event);
    const ticket = execution.localTicket();
    const current = terminalManager.get(event.sender.id, sessionId);
    if (current?.status === 'running' && !await confirmTerminalAction(owner, 'close')) return false;
    execution.assertLocal(ticket);
    trustedFilesCaller(event);
    return terminalManager.close(event.sender.id, sessionId);
  });
  handle('gwira:terminal:copy', (event, text: string) => {
    terminalOwner(event);
    if (typeof text !== 'string' || text.length > 1_000_000) throw new Error('Terminal selection is too large to copy.');
    clipboard.writeText(text);
  });
  handle('gwira:terminal:paste', event => {
    terminalOwner(event);
    return clipboard.readText().slice(0, 64 * 1024);
  });

  handle(channels.startSession, async (event, request: StartSessionRequest) => {
    const ticket = execution.localTicket();
    await confirmFullAccess(event, request.permissionMode);
    execution.assertLocal(ticket);
    trustedFilesCaller(event);
    const session=codexManager.start(request);
    ownSession(event,session.id,ticket);
    return session;
  });
  handle(channels.resumeSession, async (event, request: ResumeSessionRequest) => {
    const ticket = execution.localTicket();
    await confirmFullAccess(event, request.permissionMode);
    execution.assertLocal(ticket);
    trustedFilesCaller(event);
    const session=await codexManager.resume(request,()=>{execution.assertLocal(ticket);trustedFilesCaller(event);});
    try { execution.assertLocal(ticket); trustedFilesCaller(event); }
    catch(error) { codexManager.revokeSession(session.id); throw error; }
    ownSession(event,session.id,ticket);
    return session;
  });
  handle(channels.sendInput, async (event, request: SendInputRequest) => {
    const ticket = execution.localTicket();
    if(sessionOwners.get(request.sessionId)?.windowId!==event.sender.id||sessionOwners.get(request.sessionId)?.ticket!==ticket)throw Error('This session is unavailable in this window.');
    // A session already authorized as Full Access does not prompt again for
    // every turn. Escalating a workspace-write session still requires native
    // confirmation even if a compromised renderer supplied the request.
    const session = sessions.get(request.sessionId);
    await confirmFullAccess(event, request.permissionMode === 'full-access' && session?.permissionMode !== 'full-access' ? 'full-access' : undefined);
    execution.assertLocal(ticket);
    trustedFilesCaller(event);
    const lease=execution.beginLocalOperation();
    const off=codexManager.on('settled',sessionId=>{
      if(sessionId===request.sessionId){off();lease.release();}
    });
    try { await codexManager.sendInput(request); }
    catch(error) { off();lease.release();throw error; }
  });
  handle(channels.stopSession, async (event, request: StopSessionRequest) => {const owner=sessionOwners.get(request.sessionId);if(!owner||owner.windowId!==event.sender.id||owner.ticket!==execution.localTicket())throw Error('This session is unavailable in this window.');return codexManager.stop(request);});
  handle(channels.getSession, async (event, sessionId: string) => {const owner=sessionOwners.get(sessionId);if(!owner||owner.windowId!==event.sender.id||owner.ticket!==execution.localTicket())throw Error('This session is unavailable in this window.');return sessions.get(sessionId);});
  handle(channels.listHistories, async (_event, cwd: string) => listCodexHistoriesByCwd(cwd));
  handle(channels.deleteHistory, async (_event, request: DeleteHistoryRequest) => deleteCodexHistoryFile(request.filePath));
  handle(channels.listModels, async () => listCodexModels());
  handle(channels.getCodexBootstrapStatus, async () => getCodexBootstrapStatus());
  handle(channels.installCodexCli, async (event) => {
    const ticket=execution.localTicket();
    return installCodexCli((payload) => {
      try { execution.assertLocal(ticket); } catch { return; }
      if(!event.sender.isDestroyed())event.sender.send(channels.output, { sessionId: 'bootstrap', chunk: payload.message, role: 'system' });
    });
  });
  handle(channels.restartApp, async () => {
    app.relaunch();
    app.exit(0);
  });
  handle(channels.listSkills, async () => listLocalSkills());
  handle(channels.getSkillDetail, async (_event, skillId: string) => getSkillDetail(skillId));
  handle(channels.setSkillEnabled, async (_event, request: { skillId: string; enabled: boolean }) => {
    if (request.enabled) await enableSkill(request.skillId);
    else await disableSkill(request.skillId);
    return listLocalSkills();
  });
  handle(channels.uninstallSkill, async (_event, skillId: string) => {
    await uninstallSkill(skillId);
    return listLocalSkills();
  });
  handle(channels.openSkillFolder, async (_event, skillId: string) => {
    const folder = await openSkillFolder(skillId);
    if (folder) shell.showItemInFolder(path.join(folder, 'SKILL.md'));
  });
  handle(channels.listHistoryProjects, async () => listCodexProjectCandidates());
  handle(channels.listProjectFiles, async (event, cwd: string) => {
    const previous = projectFileScans.get(event.sender.id);
    previous?.abort();
    const controller = new AbortController();
    projectFileScans.set(event.sender.id, controller);
    try {
      return await listProjectFiles(cwd, { signal: controller.signal });
    } finally {
      if (projectFileScans.get(event.sender.id) === controller) projectFileScans.delete(event.sender.id);
    }
  });
  handle(channels.listGitBranches, async (_event, cwd: string) => listGitBranches(cwd).catch(() => ({ current: '', branches: [] })));
  handle(channels.switchGitBranch, async (_event, request: SwitchGitBranchRequest) => switchGitBranch(request.cwd, request.branch));
  handle(channels.savePastedImage, async (_event, request: SavePastedImageRequest) => savePastedImage(request));
  handle(channels.readLocalImage, async (_event, request: ReadLocalImageRequest) => readLocalImage(request));
  handle(channels.openExternalTarget, async (_event, request: OpenExternalTargetRequest) => openExternalTarget(request));

  handle(channels.selectDirectory, async () => {
    const smokeProjectPath = process.env.ELECTRON_SMOKE_ADD_PROJECT;
    if (process.env.ELECTRON_SMOKE_TEST === '1' && smokeProjectPath) {
      return { canceled: false, path: smokeProjectPath };
    }
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: 'Select project directory for Gwira' });
    return { canceled: result.canceled, path: result.filePaths[0] };
  });
  handle(channels.selectFiles, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], title: 'Attach files for Gwira' });
    return {
      canceled: result.canceled,
      files: result.filePaths.map((filePath) => ({
        path: filePath,
        name: path.basename(filePath),
        kind: isImagePath(filePath) ? 'image' : 'file'
      }))
    };
  });

  codexManager.on('output', (payload) => {
    const owner=sessionOwners.get(payload.sessionId);if(!owner)return;
    try { execution.assertLocal(owner.ticket); } catch { return; }
    const window=BrowserWindow.getAllWindows().find(item=>item.webContents.id===owner.windowId);
    if(window&&!window.isDestroyed())window.webContents.send(channels.output, payload);
  });
  codexManager.on('exit', (payload) => {
    const owner=sessionOwners.get(payload.sessionId);if(!owner)return;
    try { execution.assertLocal(owner.ticket); } catch { return; }
    const window=BrowserWindow.getAllWindows().find(item=>item.webContents.id===owner.windowId);
    if(window&&!window.isDestroyed())window.webContents.send(channels.exit, payload);
  });
}

/** Renderer confirmation improves clarity; this native confirmation is the enforcement boundary. */
async function confirmFullAccess(event: IpcMainInvokeEvent, permissionMode: StartSessionRequest['permissionMode']): Promise<void> {
  if (permissionMode !== 'full-access') return;
  const options: MessageBoxOptions = {
    type: 'warning',
    buttons: ['Cancel', 'Enable Full Access'],
    defaultId: 0,
    cancelId: 0,
    title: 'Enable Full Access?',
    message: 'Allow Gwira full access for this action?',
    detail: 'Full Access can modify files and run commands beyond the selected workspace.'
  };
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options);
  if (result.response !== 1) throw new Error('Full Access was not confirmed');
}

async function openExternalTarget(request: OpenExternalTargetRequest): Promise<void> {
  const target = request.target.trim();
  if (!target) return;
  if (/^https?:\/\//i.test(target)) {
    await shell.openExternal(target);
    return;
  }
  const filePath = target.startsWith('file://') ? new URL(target).pathname : target;
  shell.showItemInFolder(path.resolve(filePath));
}

function isImagePath(filePath: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|tiff?)$/i.test(filePath);
}

export async function readLocalImage(request: ReadLocalImageRequest): Promise<ReadLocalImageResult> {
  try {
    const buffer = await fs.readFile(request.path);
    const extension = path.extname(request.path).slice(1).toLowerCase();
    const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'webp' ? 'image/webp' : 'image/png';
    return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}` };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return { missing: true };
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function savePastedImage(request: SavePastedImageRequest): Promise<{ path: string; name: string }> {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(request.dataUrl);
  if (!match) throw new Error('Unsupported pasted image data');

  const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
  const directory = path.join(os.tmpdir(), 'codex-desktop-pasted-images');
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `codex-paste-${Date.now()}-${randomUUID()}.${extension}`);
  await fs.writeFile(filePath, Buffer.from(match[2], 'base64'));
  return { path: filePath, name: request.name?.trim() || 'Image' };
}
