export function parseSidebarLayout(raw:string|null):Record<string,unknown> {
 if(raw===null)return {};
 const value:unknown=JSON.parse(raw);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid layout preferences.');
 if('sidebarExpanded' in value&&typeof value.sidebarExpanded!=='boolean')throw Error('Invalid sidebar preference.');
 return value as Record<string,unknown>;
}
