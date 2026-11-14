import {validateOfficeArchive} from './officeArchive.js';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import type {WorkspaceFileEntry,WorkspacePreview} from '../shared/workspaceFiles.js';
const MAX_BYTES=8*1024*1024;
const MAX_SEARCH_DIRECTORIES=5000;
const MAX_SEARCH_ENTRIES=100000;
const MAX_SEARCH_RESULTS=2000;
/** A capability root is obtained from a native picker, never from renderer input. */
export async function authorizedFilePath(root:string,relative:string):Promise<string>{
 if(typeof relative!=='string'||relative.length>4096||path.isAbsolute(relative)||relative.includes('\0'))throw Error('Choose a file inside the approved folder.');
 const canonicalRoot=await fs.realpath(root),target=await fs.realpath(path.resolve(canonicalRoot,relative));
 const within=path.relative(canonicalRoot,target);
 if(within==='..'||within.startsWith(`..${path.sep}`)||path.isAbsolute(within))throw Error('Access outside the approved folder is not allowed.');
 return target;
}
export async function listWorkspaceDirectory(root:string,relative:string):Promise<WorkspaceFileEntry[]>{
 const directory=await authorizedFilePath(root,relative),entries=await fs.readdir(directory,{withFileTypes:true});
 if(entries.length>5000)throw Error('This folder has more than 5,000 entries. Open a smaller workspace folder.');
 return entries.filter(e=>!e.isSymbolicLink()&&(e.isFile()||e.isDirectory())).map(e=>({name:e.name,path:path.join(relative,e.name),directory:e.isDirectory()})).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));
}
export async function searchWorkspaceDirectory(root:string,query:string):Promise<{entries:WorkspaceFileEntry[];truncated:boolean}>{
 const needle=query.trim().toLocaleLowerCase();
 if(needle.length>256)throw Error('Search text must be 256 characters or fewer.');
 if(!needle)return {entries:[],truncated:false};
 const pending=[''],matches=new Map<string,WorkspaceFileEntry>();
 let directories=0,scannedEntries=0,truncated=false;
 while(pending.length){
  if(directories>=MAX_SEARCH_DIRECTORIES||scannedEntries>=MAX_SEARCH_ENTRIES||matches.size>=MAX_SEARCH_RESULTS){truncated=true;break;}
  const relative=pending.pop()!;
  const entries=await listWorkspaceDirectory(root,relative);
  directories++;
  for(const entry of entries){
   scannedEntries++;
   if(entry.directory)pending.push(entry.path);
   if(entry.name.toLocaleLowerCase().includes(needle)){
    matches.set(entry.path,entry);
    let parent=path.dirname(entry.path);
    while(parent!=='.'&&parent!==path.parse(parent).root){
     if(!matches.has(parent))matches.set(parent,{name:path.basename(parent),path:parent,directory:true});
     parent=path.dirname(parent);
    }
    if(matches.size>=MAX_SEARCH_RESULTS){truncated=true;break;}
   }
   if(scannedEntries>=MAX_SEARCH_ENTRIES){truncated=true;break;}
  }
 }
 return {entries:[...matches.values()].sort((a,b)=>a.path.localeCompare(b.path)),truncated};
}
export async function previewWorkspaceFile(root:string,relative:string):Promise<WorkspacePreview>{
 const file=await authorizedFilePath(root,relative),stat=await fs.stat(file),base={path:relative,name:path.basename(file)};
 if(!stat.isFile())throw Error('Select a regular file.');
 if(stat.size>MAX_BYTES)return {...base,kind:'unsupported',reason:'Preview is limited to files of 8 MB or less.'};
 const extension=path.extname(file).toLowerCase(),mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.pdf':'application/pdf'};
 const handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 let data:Buffer;try{const info=await handle.stat();if(!info.isFile())throw Error('Select a regular file.');const buffer=Buffer.alloc(Math.min(info.size,MAX_BYTES)+1);const {bytesRead}=await handle.read(buffer,0,buffer.length,0);if(bytesRead>MAX_BYTES)return {...base,kind:'unsupported',reason:'Preview is limited to files of 8 MB or less.'};data=buffer.subarray(0,bytesRead);}finally{await handle.close();}
 if(mime[extension])return {...base,kind:extension==='.pdf'?'pdf':'image',url:`data:${mime[extension]};base64,${data.toString('base64')}`};
 if(['.docx','.xlsx','.xls'].includes(extension)){if(extension!=='.xls')await validateOfficeArchive(data);return {...base,kind:extension==='.docx'?'document':'spreadsheet',url:`data:application/octet-stream;base64,${data.toString('base64')}`};}
 if(['.zip','.exe','.dmg'].includes(extension))return {...base,kind:'unsupported',reason:'This file type has no read-only preview.'};
 if(data.includes(0))return {...base,kind:'unsupported',reason:'Binary files cannot be displayed in the text viewer.'};
 return {...base,kind:extension==='.csv'||extension==='.tsv'?'csv':'text',text:data.toString('utf8')};
}
