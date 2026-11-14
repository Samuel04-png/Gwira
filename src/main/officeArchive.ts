import {inflateRaw} from 'node:zlib';
import {promisify} from 'node:util';
const inflate=promisify(inflateRaw),ENTRY_LIMIT=8*1024*1024,TOTAL_LIMIT=32*1024*1024;
/** Validate actual expanded bytes before a document parser touches an OOXML ZIP. */
export async function validateOfficeArchive(data:Buffer):Promise<void>{
 let end=-1;for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(data.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('This document is not a supported Office archive.');
 const count=data.readUInt16LE(end+10),directory=data.readUInt32LE(end+16);
 if(data.readUInt16LE(end+4)!==0||data.readUInt16LE(end+6)!==0||data.readUInt16LE(end+8)!==count)throw Error('Multi-volume Office archives cannot be previewed.');
 if(count>2000||count===65535||directory>=end)throw Error('This Office archive exceeds the preview limits.');
 let offset=directory,total=0;
 for(let i=0;i<count;i++){
  if(offset+46>end||data.readUInt32LE(offset)!==0x02014b50)throw Error('This Office archive is damaged.');
  const flags=data.readUInt16LE(offset+8),method=data.readUInt16LE(offset+10),compressed=data.readUInt32LE(offset+20),expanded=data.readUInt32LE(offset+24),local=data.readUInt32LE(offset+42);
  if(flags&1||![0,8].includes(method)||expanded>ENTRY_LIMIT||total+expanded>TOTAL_LIMIT||local+30>directory||data.readUInt32LE(local)!==0x04034b50)throw Error('Encrypted, oversized or damaged Office documents cannot be previewed.');
  const start=local+30+data.readUInt16LE(local+26)+data.readUInt16LE(local+28);
  if(start+compressed>directory)throw Error('This Office archive is damaged.');
  const bytes=data.subarray(start,start+compressed),decoded=method===0?bytes:await inflate(bytes,{maxOutputLength:ENTRY_LIMIT});
  if(decoded.length!==expanded||(total+=decoded.length)>TOTAL_LIMIT)throw Error('The document exceeds the expanded preview limit.');
  offset+=46+data.readUInt16LE(offset+28)+data.readUInt16LE(offset+30)+data.readUInt16LE(offset+32);
 }
 if(offset>end)throw Error('This Office archive is damaged.');
}
