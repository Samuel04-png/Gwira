import {app,BrowserWindow,ipcMain,safeStorage,shell,type IpcMainInvokeEvent} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {authConfiguration} from './config.js';
import {organizationFromLink} from './organizationLink.js';
import {AccountError,AuthGateway} from './gateway.js';
import {SessionVault} from './vault.js';
import {AccountController,type AccountPreferences} from './controller.js';
import {beginOAuth} from './loopback.js';
import type {AccountCommand} from '../../shared/accountAuth.js';
import type {ExecutionContext} from './executionContext.js';
import {MAX_PREFERENCE_IPC_CHARS,ScopedPreferences} from './scopedPreferences.js';
import type {ConversationRequest} from '../../shared/cloudConversations.js';
import type {ExpectedWorkspace} from '../../shared/scopedPreferences.js';
import type {NotificationRequest} from '../../shared/cloudNotifications.js';
import type {ApprovalRequest} from '../../shared/cloudApprovals.js';
import type {DirectoryRequest} from '../../shared/cloudDirectory.js';
import type {ChannelRequest} from '../../shared/cloudChannels.js';

function expectedWorkspace(value:unknown):ExpectedWorkspace|undefined {
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||!('userId'in value)||!('organizationId'in value)||typeof value.userId!=='string'||typeof value.organizationId!=='string')throw Error('Invalid workspace context.');
 return {userId:value.userId,organizationId:value.organizationId};
}

async function runtimeConfiguration():Promise<Record<string,string|undefined>>{
 const values:Record<string,string|undefined>={...process.env};
 // The local-Supabase profile is opt-in, unpackaged-only, and kept in a separate file from the hosted configuration.
 const name=!app.isPackaged&&process.env.GWIRA_AUTH_PROFILE==='local-dev'?'.env.auth.dev.local':'.env.auth.local';
 const file=path.join(app.isPackaged?app.getPath('userData'):process.cwd(),name);
 try{const raw=await fs.readFile(file,'utf8');for(const line of raw.split(/\r?\n/)){const m=/^(GWIRA_[A-Z_]+)=(.*)$/.exec(line.trim());if(m&&values[m[1]]===undefined)values[m[1]]=m[2].replace(/^"|"$/g,'');}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw Error('Account configuration could not be read.');}
 return values;
}
let pendingOrganization:string|undefined;let deliverOrganization:((id:string)=>void)|undefined;
export function handleAccountOrganizationLink(value:string):void{const id=organizationFromLink(value);if(id){pendingOrganization=id;deliverOrganization?.(id);}}
export function registerAccountIpc(execution:ExecutionContext):void{
 let controller:Promise<AccountController>|undefined;
 const instance=():Promise<AccountController>=>controller??=(async()=>{
  await app.whenReady();const env=await runtimeConfiguration().catch(()=>({} as Record<string,string|undefined>));let config:ReturnType<typeof authConfiguration>;try{config=authConfiguration(env,{packaged:app.isPackaged});}catch{config=undefined;}if(!app.isPackaged)console.info('Gwira auth backend:',config?`${/^http:\/\/(127\.0\.0\.1|localhost):/.test(config.url)?'local Supabase':'hosted Supabase'} (${config.environment}), profile ${process.env.GWIRA_AUTH_PROFILE==='local-dev'?'local-dev':'default'}`:'not configured');const scope=createHash('sha256').update(config?.url??'unconfigured').digest('hex').slice(0,24);const dir=path.join(app.getPath('userData'),'accounts',scope);
  const vault=new SessionVault(path.join(dir,'account.session-vault'),config?.url??'unconfigured',{
   available:async()=>{const available=await safeStorage.isAsyncEncryptionAvailable();if(process.platform==='linux'&&['basic_text','unknown'].includes(safeStorage.getSelectedStorageBackend()))return false;return available;},
   encrypt:text=>safeStorage.encryptStringAsync(text),decrypt:async bytes=>(await safeStorage.decryptStringAsync(bytes)).result
  });
  const preferenceFile=path.join(dir,'context.json');const preferences:AccountPreferences={read:async()=>{try{const value=JSON.parse(await fs.readFile(preferenceFile,'utf8'));return value&&typeof value==='object'?value:{};}catch{return {};}},write:async value=>{await fs.mkdir(dir,{recursive:true,mode:0o700});const temporary=preferenceFile+'.'+randomUUID();try{await fs.writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});await fs.rename(temporary,preferenceFile);}finally{await fs.rm(temporary,{force:true});}}};
  const account=new AccountController(config?new AuthGateway(config):undefined,vault,preferences,config?.google,config?()=>beginOAuth(config.url,config.callbackPort):undefined,url=>shell.openExternal(url),!!config?.apiUrl&&env.GWIRA_EXTERNAL_INVITATIONS_ENABLED==='true',pendingOrganization,!app.isPackaged&&(env.GWIRA_LOCAL_MODE==='true'||env.ELECTRON_SMOKE_TEST==='1'||env.ELECTRON_WORKFLOW_CAPTURE==='1'));
  let browserHandoff=false;
  account.subscribe(snapshot=>{execution.update(snapshot);if(snapshot.phase==='authenticating_externally')browserHandoff=true;const returnFromBrowser=browserHandoff&&['organization_ready','select_organization','no_organization','invitation_pending','error','session_expired','signed_out'].includes(snapshot.phase);for(const window of BrowserWindow.getAllWindows())if(!window.isDestroyed()&&trustedUrl(window.webContents.getURL())){window.webContents.send('gwira:account:changed',snapshot);if(returnFromBrowser){if(window.isMinimized())window.restore();window.show();window.focus();}}if(returnFromBrowser)browserHandoff=false;});
  if(pendingOrganization){const prefs=await preferences.read();await preferences.write({...prefs,mode:'cloud'});}
  await account.initialize();return account;
 })();
 deliverOrganization=id=>{execution.revoke();const ticket=execution.ticket();void execution.waitForLocalOperations().then(()=>{execution.assertCurrent(ticket);return instance();}).then(account=>{execution.assertCurrent(ticket);return account.command({type:'organization_hint',organizationId:id});}).catch(error=>console.error('[account] organization link could not be applied',{code:(error as {code?:string}).code??'CONTEXT_CHANGED'}));};
 const trustedUrl=(raw:string):boolean=>{try{const dev=!app.isPackaged?process.env.ELECTRON_RENDERER_URL:undefined;const u=new URL(raw);return dev?u.origin===new URL(dev).origin:u.protocol==='file:'&&fileURLToPath(u)===path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../renderer/index.html');}catch{return false;}};
 const trust=(event:IpcMainInvokeEvent,input?:unknown,maxChars=16384):void=>{if(event.senderFrame!==event.sender.mainFrame||!trustedUrl(event.senderFrame?.url??'')||!BrowserWindow.fromWebContents(event.sender))throw Error('Account access requires the trusted Gwira window.');if(input!==undefined&&JSON.stringify(input).length>maxChars)throw Error('Account request is too large.');};
 ipcMain.handle('gwira:account:snapshot',async event=>{trust(event);const account=await instance();trust(event);return account.snapshot();});
 ipcMain.handle('gwira:account:command',async(event,input:AccountCommand)=>{trust(event,input);const account=await instance();trust(event,input);if(input?.type==='local'&&account.snapshot().phase==='offline_local')return account.snapshot();const transition=input&&['sign_out','cancel','local','switch','password_sign_in','password_sign_up','google','verify','organization_hint'].includes(input.type);if(transition)execution.revoke();const ticket=execution.ticket();if(transition&&!['sign_out','cancel'].includes(input.type)){await execution.waitForLocalOperations();execution.assertCurrent(ticket);trust(event,input);}const result=await account.command(input);trust(event);return result;});
 ipcMain.handle('gwira:conversations:request',async(event,input:ConversationRequest,expected:unknown)=>{
  trust(event,{input,expected});const scope=expectedWorkspace(expected),account=await instance(),ticket=execution.ticket();execution.assertCurrent(ticket);trust(event,input);
  try{const result=await account.conversationOperation(input,scope);execution.assertCurrent(ticket);trust(event);return result;}
  catch(error){console.warn('[conversations] request failed',{code:(error as {code?:string})?.code??'unavailable'});if(input.type==='generate'&&error instanceof AccountError)throw Error(error.message);if((input.type==='projects'||input.type==='project_change')&&error instanceof AccountError&&error.code==='setup_unavailable')throw Error('Project storage is not configured on this server. Contact your workspace administrator.');throw Error('The conversation request could not finish. Check your connection and workspace access, then try again.');}
 });
 ipcMain.handle('gwira:notifications:request',async(event,input:NotificationRequest,expected:unknown)=>{
  trust(event,{input,expected});const scope=expectedWorkspace(expected);
  if(!scope)throw Error('Workspace context is required.');
  const account=await instance(),ticket=execution.ticket();execution.assertCurrent(ticket);trust(event,{input,expected});
  try{const result=await account.notificationOperation(input,scope);execution.assertCurrent(ticket);trust(event);return result;}
  catch(error){console.warn('[notifications] request failed',{code:(error as {code?:string})?.code??'unavailable'});throw Error('Notifications could not be updated. Check your connection and workspace access, then try again.');}
 });
 ipcMain.handle('gwira:directory:request',async(event,input:DirectoryRequest,expected:unknown)=>{
  trust(event,{input,expected});const scope=expectedWorkspace(expected);
  if(!scope)throw Error('Workspace context is required.');
  const account=await instance(),ticket=execution.ticket();execution.assertCurrent(ticket);trust(event,{input,expected});
  try{const result=await account.directoryOperation(input,scope);execution.assertCurrent(ticket);trust(event);return result;}
  catch(error){console.warn('[directory] request failed',{code:(error as {code?:string})?.code??'unavailable'});throw Error('The directory request could not finish. Check your connection and workspace access, then try again.');}
 });
 ipcMain.handle('gwira:approvals:request',async(event,input:ApprovalRequest,expected:unknown)=>{
  trust(event,{input,expected});const scope=expectedWorkspace(expected);
  if(!scope)throw Error('Workspace context is required.');
  const account=await instance(),ticket=execution.ticket();execution.assertCurrent(ticket);trust(event,{input,expected});
  try{const result=await account.approvalOperation(input,scope);execution.assertCurrent(ticket);trust(event);return result;}
  catch(error){console.warn('[approvals] request failed',{code:(error as {code?:string})?.code??'unavailable'});throw Error('The review request could not finish. Check your connection and workspace access, then try again.');}
 });
 ipcMain.handle('gwira:channels:request',async(event,input:ChannelRequest,expected:unknown)=>{
  trust(event,{input,expected});const scope=expectedWorkspace(expected);
  if(!scope)throw Error('Workspace context is required.');
  const account=await instance(),ticket=execution.ticket();execution.assertCurrent(ticket);trust(event,{input,expected});
  try{const result=await account.channelOperation(input,scope);execution.assertCurrent(ticket);trust(event);return result;}
  catch(error){console.warn('[channels] request failed',{code:(error as {code?:string})?.code??'unavailable'});throw Error('The channel request could not finish. Check your connection and workspace access, then try again.');}
 });
 for(const action of ['list','invite','resend','revoke'] as const)ipcMain.handle('gwira:account:invitation:'+action,async(event,input:unknown)=>{trust(event,input);try{const account=await instance();trust(event,input);const result=await account.invitationOperation(action,input);trust(event);return result;}catch{throw Error('The invitation request could not be completed. Check your organization access and service configuration.');}});
 const preferences=new ScopedPreferences(path.join(app.getPath('userData'),'scoped-ui-v1'));
 for(const action of ['read','write'] as const)ipcMain.handle('gwira:preferences:'+action,async(event,input:unknown)=>{
  trust(event,input,MAX_PREFERENCE_IPC_CHARS);
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid preference request.');
  const record=input as {key?:unknown;value?:unknown;expected?:unknown};
  const expected=expectedWorkspace(record.expected);
  const account=await instance(),ticket=execution.ticket(),scope=await account.verifiedWorkspace();
  execution.assertCurrent(ticket);trust(event,input,MAX_PREFERENCE_IPC_CHARS);
  if(expected&&(expected.userId!==scope.userId||expected.organizationId!==scope.organizationId))throw Error('Your account context changed. Try again.');
  if(action==='read')return preferences.read(scope,record.key);
  preferences.write(scope,record.key,record.value);
 });
 app.on('before-quit',()=>{void controller?.then(account=>account.dispose());});
}
