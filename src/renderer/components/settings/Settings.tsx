import React, {useRef, useState} from 'react';
import {Button, type ButtonProps} from '../Button.js';
import {Field, type FieldProps} from '../Input.js';
import {InlineSelect} from '../InlineSelect.js';
import {Icon} from '../Icon.js';
import './settings.css';
import {Toggle} from '../Toggle.js';

export function SettingsPageShell({title, description, categories, selected, onSelect, children}: {title:string;description:string;categories:readonly {id:string;label:string}[];selected:string;onSelect:(id:string)=>void;children:React.ReactNode}):React.ReactElement {
 return <section className="gwira-workspace-page settings-page" aria-label={title}><header className="settings-page__header"><h1>{title}</h1><p>{description}</p></header><div className="settings-page__layout"><nav aria-label="Settings categories">{categories.map(category=><button type="button" key={category.id} aria-current={selected===category.id?'page':undefined} onClick={()=>onSelect(category.id)}>{category.label}</button>)}</nav><div className="settings-page__content">{children}</div></div></section>;
}
export function SettingsSection({title,description,children}: {title:string;description?:string;children:React.ReactNode}):React.ReactElement {return <section className="settings-section" aria-label={title}><header><h2>{title}</h2>{description?<p>{description}</p>:null}</header>{children}</section>;}
export function SettingsRow({title,description,children}: {title:string;description?:string;children?:React.ReactNode}):React.ReactElement {return <div className="settings-row"><div className="settings-row__text"><h3>{title}</h3>{description?<p>{description}</p>:null}</div>{children?<div className="settings-row__control">{children}</div>:null}</div>;}
export function SettingsInput(props:FieldProps):React.ReactElement {return <div className="settings-input"><Field {...props}/></div>;}
export function SettingsSelect({label,value,options,onChange,disabled=false}: {label:string;value:string;options:{value:string;label:string}[];onChange:(value:string)=>void;disabled?:boolean}):React.ReactElement {const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null);return <InlineSelect className="settings-select" id={label} label={options.find(o=>o.value===value)?.label??value} value={value} options={options} open={open} disabled={disabled} menuRef={ref} onOpenChange={setOpen} onChange={onChange}/>;}
/** Available for real boolean preferences; Settings currently has none. */
export const SettingsToggle = Toggle;
export function SettingsButton({loading=false,...props}:ButtonProps & {loading?:boolean}):React.ReactElement {return <Button size="form" {...props} disabled={props.disabled||loading} aria-busy={loading||undefined}/>;}
export function SettingsNotice({tone='info',children,action}: {tone?:'info'|'warning'|'error';children:React.ReactNode;action?:React.ReactNode}):React.ReactElement {return <div className="settings-notice" data-tone={tone} role={tone==='error'?'alert':'note'}><Icon name={tone==='error'?'close':tone==='warning'?'lock':'help'}/><div>{children}{action}</div></div>;}
export function SettingsStatus({children}: {children:React.ReactNode}):React.ReactElement {return <span className="settings-status">{children}</span>;}
export function SettingsDivider():React.ReactElement {return <hr className="settings-divider"/>;}
