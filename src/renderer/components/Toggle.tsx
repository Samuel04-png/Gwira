import React, {useState} from 'react';
import './toggle.css';

/** Controlled switch. Async changes retain the confirmed value until persistence succeeds. */
export function Toggle({label, checked, onChange, disabled=false}: {
 label:string; checked:boolean; onChange:(value:boolean)=>void|Promise<void>; disabled?:boolean;
}):React.ReactElement {
 const [pending,setPending]=useState(false);
 const [error,setError]=useState('');
 async function change():Promise<void> {
  if(pending||disabled)return;
  setPending(true);setError('');
  try {await onChange(!checked);} catch(cause) {setError(cause instanceof Error?cause.message:'Could not save this preference. Try again.');}
  finally {setPending(false);}
 }
 return <span className="gw-toggle-control"><button type="button" className="gw-toggle" role="switch" aria-label={label} aria-checked={checked} aria-busy={pending||undefined} disabled={disabled||pending} onClick={()=>{void change();}}><span/></button>{error?<span className="gw-toggle-error" role="alert">{error}</span>:null}</span>;
}
