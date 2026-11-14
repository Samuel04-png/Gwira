import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.js';

export interface MessageImage {path: string; name: string; remote?: boolean}
function useImage(path: string, enabled = true, remote = false) {
 const [source,setSource]=useState<string>(); const [failed,setFailed]=useState(false); const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(!enabled)return;
  let cancelled=false;setSource(undefined);setFailed(false);
  if(remote){setSource(path);return;}
  void window.codexDesktop.readLocalImage({path}).then(result=>{if(cancelled)return;if(result.dataUrl)setSource(result.dataUrl);else setFailed(true);}).catch(()=>{if(!cancelled)setFailed(true);});
  return()=>{cancelled=true;};
 },[path,enabled,remote,attempt]);
 return {source,failed,fail:()=>{setSource(undefined);setFailed(true);},retry:()=>setAttempt(a=>a+1)};
}

function ImageViewer({images, index, onIndex, onClose}: {images: MessageImage[]; index:number; onIndex:(index:number)=>void; onClose:()=>void}):React.ReactElement {
 const dialog=useRef<HTMLDialogElement>(null);const [zoom,setZoom]=useState(1);const [openError,setOpenError]=useState('');const image=images[index]!;const state=useImage(image.path,true,image.remote);
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
 useEffect(()=>{setZoom(1);setOpenError('');},[index]);
 function move(direction:number):void{onIndex(Math.max(0,Math.min(images.length-1,index+direction)));}
 return <dialog ref={dialog} className="image-lightbox message-image-viewer" aria-label={`Preview ${image.name}`} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget)onClose();}} onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();move(event.key==='ArrowLeft'?-1:1);}
 }}>
  <header><span title={image.name}>{image.name}</span><small aria-live="polite">{index+1} / {images.length}</small><button type="button" aria-label={image.remote?'Open original image':'Show original image in folder'} title={image.remote?'Open original image':'Show original image in folder'} onClick={()=>{void window.codexDesktop.openExternalTarget({target:image.path}).catch(()=>setOpenError('Could not open the original image. Check that it is still available.'));}}><Icon name="external"/></button><button type="button" autoFocus aria-label="Close image preview" onClick={onClose}><Icon name="close"/></button></header>
  <div className="message-image-viewer__canvas"><div className="message-image-viewer__stage" style={{width:`${zoom*100}%`,height:`${zoom*100}%`}}>{state.source?<img src={state.source} alt={image.name} onError={state.fail}/>:<div className="message-image-viewer__fallback" role="status">{state.failed?<><p>Image unavailable: {image.name}</p><button type="button" onClick={state.retry}>Retry image</button></>:'Loading image…'}</div>}</div></div>
  {openError?<p className="message-viewer-error" role="status">{openError}</p>:null}
  <footer><button type="button" aria-label="Previous image" disabled={index===0} onClick={()=>move(-1)}><Icon name="arrow-left"/></button><button type="button" aria-label="Next image" disabled={index===images.length-1} onClick={()=>move(1)}><Icon name="arrow-right"/></button><span/><button type="button" aria-label="Zoom out" disabled={zoom<=1||!state.source} onClick={()=>setZoom(z=>Math.max(1,z-.5))}><Icon name="zoom-out"/></button><button type="button" disabled={!state.source} onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><button type="button" aria-label="Zoom in" disabled={zoom>=3||!state.source} onClick={()=>setZoom(z=>Math.min(3,z+.5))}><Icon name="zoom-in"/></button></footer>
 </dialog>;
}

function Thumbnail({image,onOpen,composer}: {image:MessageImage;onOpen:(button:HTMLButtonElement)=>void;composer?:boolean}):React.ReactElement {
 const host=useRef<HTMLElement>(null);const [visible,setVisible]=useState(false);
 useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}});if(host.current)observer.observe(host.current);return()=>observer.disconnect();},[]);
 const {source,failed,retry,fail}=useImage(image.path,visible,image.remote);
 return <figure ref={host} className={composer?'composer-image-preview':'message-image-thumbnail'}><button className="image-preview-button" type="button" aria-label={failed?`Retry image ${image.name}`:`Preview ${image.name}`} title={image.name} onClick={event=>{if(failed)retry();else onOpen(event.currentTarget);}}>{source?<img src={source} alt={image.name} loading="lazy" onError={fail}/>:<span className={composer?"image-preview-fallback":"message-image-placeholder"}><Icon name={failed?'failed':'image'}/><span>{failed?'Retry image':'Loading…'}</span><small>{image.name}</small></span>}</button></figure>;
}

export function MessageImageGallery({images,compact=false,composer=false}: {images:MessageImage[];compact?:boolean;composer?:boolean}):React.ReactElement {
 const [index,setIndex]=useState<number>();const returnFocus=useRef<HTMLButtonElement|null>(null);
 return <><div className="message-image-collection"><div className="message-image-strip" role="group" aria-label={`${images.length} image attachment${images.length===1?'':'s'}`} onKeyDown={event=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));const current=items.indexOf(document.activeElement as HTMLButtonElement);event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,current+(event.key==='ArrowRight'?1:-1)));items[next]?.focus();items[next]?.scrollIntoView({block:'nearest',inline:'nearest'});
 }}>{images.map((image,i)=><Thumbnail key={`${i}:${image.path}`} image={image} composer={composer} onOpen={button=>{returnFocus.current=button;setIndex(i);}}/>)}</div>{images.length>1?<small className="message-image-hint">{images.length} images · Scroll to browse</small>:null}</div>{index!==undefined?<ImageViewer images={images} index={index} onIndex={setIndex} onClose={()=>{setIndex(undefined);requestAnimationFrame(()=>returnFocus.current?.focus());}}/>:null}</>;
}

/** Compatibility entry point used by the existing composer and Markdown images. */
export function LocalImagePreview({imagePath,name,compact=false}: {imagePath:string;name:string;compact?:boolean}):React.ReactElement {
 return <MessageImageGallery images={[{path:imagePath,name}]} composer={compact}/>;
}
