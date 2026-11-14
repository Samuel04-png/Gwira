import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {validateOfficeArchive} from '../src/main/officeArchive.js';
const Zip=createRequire(import.meta.url)('jszip');
describe('Office archive preview limits',()=>{
 it('validates real expanded bytes in a small document archive',async()=>{const zip=new Zip();zip.file('word/document.xml','<document>Actual text</document>');await expect(validateOfficeArchive(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}))).resolves.toBeUndefined();});
 it('rejects damaged and oversized compressed entries before document parsing',async()=>{await expect(validateOfficeArchive(Buffer.from('not a ZIP'))).rejects.toThrow('archive');const zip=new Zip();zip.file('huge.xml','a'.repeat(8*1024*1024+1));await expect(validateOfficeArchive(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}))).rejects.toThrow('oversized');});
 it('does not trust false uncompressed sizes in the central directory',async()=>{const zip=new Zip();zip.file('entry.xml','a'.repeat(10000));const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});const index=bytes.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));bytes.writeUInt32LE(1,index+24);await expect(validateOfficeArchive(bytes)).rejects.toThrow('expanded');});
});
