import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon.js';

/** A project currently has one local source folder; use the existing native picker. */
export function ProjectCreateDialog({ onClose, onCreate, onChooseFolder }: {
  onClose:()=>void; onCreate:(name:string,path:string)=>void|Promise<void>;
  onChooseFolder:()=>Promise<{canceled:boolean;path?:string}>;
}):React.ReactElement {
  const dialogRef=useRef<HTMLDialogElement>(null),nameRef=useRef<HTMLInputElement>(null),mounted=useRef(true);
  const [name,setName]=useState(''),[folder,setFolder]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState<string>();
  useEffect(()=>{mounted.current=true;const dialog=dialogRef.current;dialog?.showModal();nameRef.current?.focus();return()=>{mounted.current=false;dialog?.close()}},[]);
  const choose=async()=>{
    setBusy(true);setError(undefined);
    try{const result=await onChooseFolder();if(!mounted.current)return;if(!result.canceled&&result.path){setFolder(result.path);setName(current=>current||result.path!.split(/[\\/]+/).filter(Boolean).at(-1)||'')}}
    catch{if(mounted.current)setError('Could not choose a folder. Try again.');}
    finally{if(mounted.current)setBusy(false)}
  };
  const create=async(event:React.FormEvent)=>{
    event.preventDefault();if(!folder||!name.trim()||busy)return;
    setBusy(true);setError(undefined);
    try{await onCreate(name.trim(),folder)}catch{if(mounted.current){setError('Could not create the project. Try again.');setBusy(false)}}
  };
  return createPortal(<dialog className="gw-project-dialog gw-sidebar-overlay" ref={dialogRef} aria-labelledby="gw-project-create-title" aria-describedby="gw-project-create-description" onCancel={event=>{event.preventDefault();if(!busy)onClose()}} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(!busy&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))onClose()}}}>
    <form onSubmit={create}>
      <header><h2 id="gw-project-create-title">Create project</h2><button type="button" className="gw-project-dialog__close" aria-label="Close create project" disabled={busy} onClick={onClose}><Icon name="close" /></button></header>
      <label htmlFor="gw-project-name">Project name</label>
      <div className="gw-project-name-field"><Icon name="folder"/><input ref={nameRef} id="gw-project-name" name="project-name" value={name} onChange={event=>setName(event.target.value)} maxLength={160} required autoComplete="off" disabled={busy}/></div>
      <label>Source folder</label>
      <div className="gw-project-source"><Icon name="folder"/><span>{folder??'Choose a folder on this computer'}</span><button type="button" disabled={busy} onClick={()=>void choose()}><Icon name="folder-plus"/>{busy?'Please wait…':folder?'Change folder':'Add folder'}</button></div>
      <p id="gw-project-create-description">Conversations stay associated with this local folder.</p>
      {error?<p className="gw-project-dialog__error" role="alert">{error}</p>:null}
      <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="gw-project-create" disabled={busy||!folder||!name.trim()}>{busy?'Please wait…':'Create project'}</button></footer>
    </form>
  </dialog>,document.body);
}
