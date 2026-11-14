import fs from 'node:fs/promises';
import {renameSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {AuthTokens} from './gateway.js';
export interface Encryptor {available():Promise<boolean>;encrypt(text:string):Promise<Buffer>;decrypt(bytes:Buffer):Promise<string>;}
export class SessionVault {
 constructor(private readonly file:string,private readonly project:string,private readonly encryption:Encryptor){}
 async save(tokens:AuthTokens,assertCurrent:()=>void=()=>{}):Promise<void>{if(!await this.encryption.available())throw Error('Secure account storage is unavailable. Unlock your system keychain or continue locally.');const bytes=await this.encryption.encrypt(JSON.stringify({project:this.project,tokens}));await fs.mkdir(path.dirname(this.file),{recursive:true,mode:0o700});const temporary=`${this.file}.${randomUUID()}.tmp`;try{await fs.writeFile(temporary,bytes,{mode:0o600,flag:'wx'});assertCurrent();renameSync(temporary,this.file);}finally{await fs.rm(temporary,{force:true});}}
 async read():Promise<AuthTokens|undefined>{try{const stat=await fs.stat(this.file);if(!await this.encryption.available())throw Error('Keychain unavailable');if(stat.size>65536)throw Error('Invalid vault');const data=JSON.parse(await this.encryption.decrypt(await fs.readFile(this.file))) as {project?:string;tokens?:AuthTokens};const t=data.tokens;if(data.project!==this.project||!t||typeof t.accessToken!=='string'||typeof t.refreshToken!=='string'||!Number.isFinite(t.expiresAt))throw Error('Invalid vault');return t;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw Error('Your saved account could not be unlocked. Sign in again or continue locally.');}}
 /** Invitation continuation is project-scoped encrypted main-process state, separate from sessions. */
 async saveIntent(token:string):Promise<void>{
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)||!await this.encryption.available())throw Error('Secure account storage is unavailable.');
  const file=this.file+'.invitation-intent',temporary=file+'.'+randomUUID()+'.tmp';
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  try{await fs.writeFile(temporary,await this.encryption.encrypt(JSON.stringify({project:this.project,token,expiresAt:Date.now()+7*86400000})),{mode:0o600,flag:'wx'});await fs.rename(temporary,file);}finally{await fs.rm(temporary,{force:true});}
 }
 async readIntent():Promise<string|undefined>{
  const file=this.file+'.invitation-intent';try{const stat=await fs.stat(file);if(stat.size>65536||!await this.encryption.available())throw Error('Invalid intent storage');const value=JSON.parse(await this.encryption.decrypt(await fs.readFile(file))) as {project?:string;token?:string;expiresAt?:number};if(value.project!==this.project||typeof value.token!=='string'||!Number.isFinite(value.expiresAt)||!/^[_A-Za-z0-9-]{43}$/.test(value.token))throw Error('Invalid intent storage');if(value.expiresAt!<=Date.now()){await this.clearIntent();return undefined;}return value.token;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw Error('Your saved account invitation could not be unlocked. Reopen your invitation after unlocking secure storage.');}
 }
 async clearIntent():Promise<void>{await fs.rm(this.file+'.invitation-intent',{force:true});}
 async clear():Promise<void>{await fs.rm(this.file,{force:true});}
}
