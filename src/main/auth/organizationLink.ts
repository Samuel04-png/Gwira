/** An organization deep link is a navigation hint, never a membership grant. */
export function organizationFromLink(value:string):string|undefined{
 try{const u=new URL(value);if(u.protocol!=='gwira:'||u.hostname!=='organization'||u.port||u.username||u.password||u.search||u.hash)return undefined;const id=u.pathname.slice(1);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)?id:undefined;}catch{return undefined;}
}
