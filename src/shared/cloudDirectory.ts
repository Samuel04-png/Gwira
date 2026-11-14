import type {ExpectedWorkspace} from './scopedPreferences.js';
export interface CloudEmployee {id:string;organization_id:string;user_id:string|null;name:string;job_title:string;created_at:string}
export interface CloudDirectory {employees:CloudEmployee[];pins:string[]}
export type DirectoryRequest = {type:'list'} | {type:'pin';id:string;pinned:boolean} | {type:'create';id:string;name:string;jobTitle:string};
export interface CloudDirectoryApi {request(input:DirectoryRequest,expected:ExpectedWorkspace):Promise<CloudDirectory|null>}
