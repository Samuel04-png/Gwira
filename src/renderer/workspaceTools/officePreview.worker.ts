import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
self.onmessage=async(event:MessageEvent<{bytes:ArrayBuffer;kind:'document'|'spreadsheet'}>)=>{
 try{
  if(event.data.kind==='document'){
   const result=await mammoth.extractRawText({arrayBuffer:event.data.bytes});self.postMessage({text:result.value.slice(0,500000)});
  }else{
   const names=XLSX.read(event.data.bytes,{type:'array',bookSheets:true}).SheetNames.slice(0,50);
   const workbook=XLSX.read(event.data.bytes,{type:'array',sheets:names,sheetRows:1000,dense:true,cellHTML:false,cellFormula:false,cellStyles:false,bookVBA:false});
   let remaining=500000,cells=100000;
   const sheets=workbook.SheetNames.slice(0,50).map(name=>{const sheet=workbook.Sheets[name];const range=XLSX.utils.decode_range(sheet['!ref']??'A1');range.e.r=Math.min(range.e.r,range.s.r+999);range.e.c=Math.min(range.e.c,range.s.c+99);return {name,rows:XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:false,range,blankrows:false}).map(row=>row.map(cell=>{if(remaining<=0||cells--<=0)return '';const value=String(cell??'').slice(0,Math.min(10000,remaining));remaining-=value.length;return value;}))};});self.postMessage({sheets});
  }
 }catch{self.postMessage({error:'This document could not be previewed. It may be damaged, encrypted or unsupported.'});}
};
