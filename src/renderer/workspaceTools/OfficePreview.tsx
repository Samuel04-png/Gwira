import React,{useEffect,useState} from 'react';
export function OfficePreview({url,kind}:{url:string;kind:'document'|'spreadsheet'}):React.ReactElement{
 const [content,setContent]=useState<{text?:string;sheets?:Array<{name:string;rows:string[][]}>;error?:string}>(),[selected,setSelected]=useState(0);
 useEffect(()=>{setContent(undefined);setSelected(0);const worker=new Worker(new URL('./officePreview.worker.ts',import.meta.url),{type:'module'});const timer=setTimeout(()=>{worker.terminate();setContent({error:'Preview took too long. Use a smaller document.'});},5000);worker.onmessage=event=>{clearTimeout(timer);setContent(event.data);worker.terminate();};worker.onerror=()=>{clearTimeout(timer);setContent({error:'The document preview service could not load. Reopen the file.'});worker.terminate();};const bytes=Uint8Array.from(atob(url.split(',')[1]??''),c=>c.charCodeAt(0)).buffer;worker.postMessage({bytes,kind},[bytes]);return()=>{clearTimeout(timer);worker.terminate();};},[url,kind]);
 if(!content)return <p role="status">Preparing document preview…</p>;
 if(content.error)return <p role="alert">{content.error}</p>;
 if(kind==='document')return <article className="workspace-office-document"><p>Read-only text preview</p><div>{content.text}</div></article>;
 const sheet=content.sheets?.[selected];return <section className="workspace-files__table"><label>Sheet<select aria-label="Workbook sheet" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{content.sheets?.map((s,i)=><option key={i} value={i}>{s.name}</option>)}</select></label><p>Read-only · up to 1,000 rows and 100 columns per sheet</p><table><tbody>{sheet?.rows.map((row,i)=><tr key={i}><th scope="row">{i+1}</th>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></section>;
}
