import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent, type MessageBoxOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deleteCodexHistoryFile, listCodexHistoriesByCwd, listCodexProjectCandidates } from './codexHistory.js';
import { listCodexModels } from './codexModels.js';
import { getCodexBootstrapStatus, installCodexCli } from './codexBootstrap.js';
import { CodexExecManager } from './codexExecManager.js';
import { listGitBranches, switchGitBranch } from './gitBranches.js';
import { listProjectFiles } from './projectFiles.js';
import { disableSkill, enableSkill, getSkillDetail, listLocalSkills, openSkillFolder, uninstallSkill } from './skillStore.js';
import { SessionStore } from './sessionStore.js';
import type { DeleteHistoryRequest, OpenExternalTargetRequest, ReadLocalImageRequest, ReadLocalImageResult, ResumeSessionRequest, SavePastedImageRequest, SendInputRequest, StartSessionRequest, StopSessionRequest, SwitchGitBranchRequest } from '../shared/types.js';

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

export function registerIpc(codexManager: CodexExecManager, sessions: SessionStore): void {
  const projectFileScans = new Map<number, AbortController>();
  ipcMain.handle(channels.startSession, async (event, request: StartSessionRequest) => {
    await confirmFullAccess(event, request.permissionMode);
    return codexManager.start(request);
  });
  ipcMain.handle(channels.resumeSession, async (event, request: ResumeSessionRequest) => {
    await confirmFullAccess(event, request.permissionMode);
    return codexManager.resume(request);
  });
  ipcMain.handle(channels.sendInput, async (event, request: SendInputRequest) => {
    // A session already authorized as Full Access does not prompt again for
    // every turn. Escalating a workspace-write session still requires native
    // confirmation even if a compromised renderer supplied the request.
    const session = sessions.get(request.sessionId);
    await confirmFullAccess(event, request.permissionMode === 'full-access' && session?.permissionMode !== 'full-access' ? 'full-access' : undefined);
    return codexManager.sendInput(request);
  });
  ipcMain.handle(channels.stopSession, async (_event, request: StopSessionRequest) => codexManager.stop(request));
  ipcMain.handle(channels.getSession, async (_event, sessionId: string) => sessions.get(sessionId));
  ipcMain.handle(channels.listHistories, async (_event, cwd: string) => listCodexHistoriesByCwd(cwd));
  ipcMain.handle(channels.deleteHistory, async (_event, request: DeleteHistoryRequest) => deleteCodexHistoryFile(request.filePath));
  ipcMain.handle(channels.listModels, async () => listCodexModels());
  ipcMain.handle(channels.getCodexBootstrapStatus, async () => getCodexBootstrapStatus());
  ipcMain.handle(channels.installCodexCli, async () => installCodexCli((payload) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channels.output, { sessionId: 'bootstrap', chunk: payload.message, role: 'system' });
  }));
  ipcMain.handle(channels.restartApp, async () => {
    app.relaunch();
    app.exit(0);
  });
  ipcMain.handle(channels.listSkills, async () => listLocalSkills());
  ipcMain.handle(channels.getSkillDetail, async (_event, skillId: string) => getSkillDetail(skillId));
  ipcMain.handle(channels.setSkillEnabled, async (_event, request: { skillId: string; enabled: boolean }) => {
    if (request.enabled) await enableSkill(request.skillId);
    else await disableSkill(request.skillId);
    return listLocalSkills();
  });
  ipcMain.handle(channels.uninstallSkill, async (_event, skillId: string) => {
    await uninstallSkill(skillId);
    return listLocalSkills();
  });
  ipcMain.handle(channels.openSkillFolder, async (_event, skillId: string) => {
    const folder = await openSkillFolder(skillId);
    if (folder) shell.showItemInFolder(path.join(folder, 'SKILL.md'));
  });
  ipcMain.handle(channels.listHistoryProjects, async () => listCodexProjectCandidates());
  ipcMain.handle(channels.listProjectFiles, async (event, cwd: string) => {
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
  ipcMain.handle(channels.listGitBranches, async (_event, cwd: string) => listGitBranches(cwd).catch(() => ({ current: '', branches: [] })));
  ipcMain.handle(channels.switchGitBranch, async (_event, request: SwitchGitBranchRequest) => switchGitBranch(request.cwd, request.branch));
  ipcMain.handle(channels.savePastedImage, async (_event, request: SavePastedImageRequest) => savePastedImage(request));
  ipcMain.handle(channels.readLocalImage, async (_event, request: ReadLocalImageRequest) => readLocalImage(request));
  ipcMain.handle(channels.openExternalTarget, async (_event, request: OpenExternalTargetRequest) => openExternalTarget(request));

  ipcMain.handle(channels.selectDirectory, async () => {
    const smokeProjectPath = process.env.ELECTRON_SMOKE_ADD_PROJECT;
    if (process.env.ELECTRON_SMOKE_TEST === '1' && smokeProjectPath) {
      return { canceled: false, path: smokeProjectPath };
    }
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: 'Select project directory for Codex' });
    return { canceled: result.canceled, path: result.filePaths[0] };
  });
  ipcMain.handle(channels.selectFiles, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], title: 'Attach files for Codex' });
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
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channels.output, payload);
  });
  codexManager.on('exit', (payload) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channels.exit, payload);
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
    message: 'Allow Codex full access for this action?',
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
