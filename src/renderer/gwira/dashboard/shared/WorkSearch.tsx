import React from 'react';
import {Icon} from '../../../components/Icon.js';
export function WorkSearch({value,onChange,className='',label='Search tasks',testId}:{value:string;onChange:(value:string)=>void;className?:string;label?:string;testId?:string}):React.ReactElement {
 return <div className={`gw-work-search ${className}`}><Icon name="search"/><input type="search" aria-label={label} placeholder="Search tasks" value={value} data-testid={testId} onChange={event=>onChange(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'&&value){event.preventDefault();event.stopPropagation();onChange('');}}}/>{value?<button type="button" aria-label="Clear search" onClick={()=>onChange('')}><Icon name="close"/></button>:null}</div>;
}
