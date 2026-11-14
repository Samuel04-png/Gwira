import type {DirectoryRequest} from '../../../shared/cloudDirectory.js';

export type PendingDirectoryPerson = Extract<DirectoryRequest,{type:'create'}>;
export function parsePendingDirectoryPerson(raw:string|null):PendingDirectoryPerson|null {
 if(raw===null)return null;
 const value:unknown=JSON.parse(raw);
 if(value===null)return null;
 if(!value||typeof value!=='object'||Array.isArray(value)||!('type'in value)||value.type!=='create'
  ||!('id'in value)||typeof value.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)
  ||!('name'in value)||typeof value.name!=='string'||!value.name.trim()||value.name.length>200
  ||!('jobTitle'in value)||typeof value.jobTitle!=='string'||!value.jobTitle.trim()||value.jobTitle.length>200)throw Error('Invalid pending directory person.');
 return {type:'create',id:value.id,name:value.name,jobTitle:value.jobTitle};
}
