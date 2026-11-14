import React,{forwardRef} from 'react';
import {GwiraLogo} from './GwiraLogo.js';
/** Shared document surface; callers retain their existing Markdown renderer and actions. */
export const AssistantResponse=forwardRef<HTMLDivElement,React.ComponentProps<'div'>&{identity?:boolean}>(function AssistantResponse({identity=false,className='',children,...props},ref){return <>{identity&&<div className="gw-assistant-identity"><GwiraLogo size="header"/><span>Gwira</span></div>}<div {...props} ref={ref} className={`gw-assistant-response ${className}`}>{children}</div></>});
