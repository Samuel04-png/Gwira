import {useSyncExternalStore} from 'react';
import type {WorkspaceFileEntry,WorkspaceFileRoot,WorkspaceFileSearchResult,WorkspaceFilesApi,WorkspacePreview} from '../../shared/workspaceFiles.js';

/**
 * Read-only "Gwira documents" source for the Files tool. Documents live in the signed-in organization's
 * Supabase records (loaded by the main process); nothing is written to the user's computer.
 */
export interface GwiraDocument {path:string;name:string;text:string}
export interface GwiraDocuments {root:WorkspaceFileRoot;files:GwiraDocument[]}
export const gwiraDocumentsPrefix='gwira-documents:';
export const isGwiraDocumentsRoot=(id:string):boolean=>id.startsWith(gwiraDocumentsPrefix);

let current:GwiraDocuments|undefined;
const listeners=new Set<()=>void>();
export function setGwiraDocuments(next:GwiraDocuments|undefined):void{
 const same=current===next||(!!current&&!!next&&current.root.id===next.root.id&&current.files.length===next.files.length&&current.files.every((f,i)=>f.path===next.files[i].path&&f.text===next.files[i].text));
 if(same)return;current=next;listeners.forEach(l=>l());
}
export const getGwiraDocuments=():GwiraDocuments|undefined=>current;
export function useGwiraDocuments():GwiraDocuments|undefined{return useSyncExternalStore(cb=>{listeners.add(cb);return()=>{listeners.delete(cb)}},getGwiraDocuments);}

export function documentRoot(organizationId:string):WorkspaceFileRoot{const id=`${gwiraDocumentsPrefix}${organizationId}`;return {id,name:'Gwira documents',fingerprint:id};}
export function documentEntries(docs:GwiraDocuments):WorkspaceFileEntry[]{return docs.files.map(f=>({name:f.name,path:f.path,directory:false}));}

const unavailable=(what:string)=>Promise.reject(new Error(`${what} is not available: Gwira documents are stored in your workspace, not on this computer.`));
const documentsApi:Pick<WorkspaceFilesApi,'list'|'search'|'preview'|'copyPath'|'reveal'>={
 async list(rootId,relative){const docs=current;if(!docs||docs.root.id!==rootId||relative!=='')return [];return documentEntries(docs);},
 async search(rootId,query):Promise<WorkspaceFileSearchResult>{const docs=current;const q=query.trim().toLowerCase();return {entries:docs&&docs.root.id===rootId?documentEntries(docs).filter(e=>e.name.toLowerCase().includes(q)):[],truncated:false};},
 async preview(rootId,relative):Promise<WorkspacePreview>{const file=current&&current.root.id===rootId?current.files.find(f=>f.path===relative):undefined;if(!file)throw new Error('This document is no longer available.');return {path:file.path,name:file.name,kind:'text',text:file.text};},
 copyPath:()=>unavailable('Copying a path'),
 reveal:()=>unavailable('Showing in Finder')
};
/** Routes Files-tool calls for a Gwira documents root to the organization documents; everything else stays on the approved-folder IPC. */
export function filesApi(rootId:string):Pick<WorkspaceFilesApi,'list'|'search'|'preview'|'copyPath'|'reveal'>{return isGwiraDocumentsRoot(rootId)?documentsApi:window.codexDesktop.workspaceFiles;}
