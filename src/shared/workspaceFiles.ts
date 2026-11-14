export interface WorkspaceFileEntry { name:string; path:string; directory:boolean; }
export interface WorkspaceFileRoot { id:string; name:string; fingerprint:string; }
export interface WorkspacePreview { path:string; name:string; kind:'text'|'csv'|'image'|'pdf'|'spreadsheet'|'document'|'unsupported'; text?:string; url?:string; reason?:string; }
export interface WorkspaceFileSearchResult { entries:WorkspaceFileEntry[]; truncated:boolean; }
export interface WorkspaceFilesApi {
 chooseRoot():Promise<WorkspaceFileRoot|undefined>;
 list(rootId:string,relativePath:string):Promise<WorkspaceFileEntry[]>;
 search(rootId:string,query:string):Promise<WorkspaceFileSearchResult>;
 preview(rootId:string,relativePath:string):Promise<WorkspacePreview>;
 copyPath(rootId:string,relativePath:string):Promise<void>;
 reveal(rootId:string,relativePath:string):Promise<void>;
}
