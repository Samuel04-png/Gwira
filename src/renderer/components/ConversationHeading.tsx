import React from 'react';
import {conversationDisplayTitle} from '../messagePresentation.js';
/** Customer-facing title; transport envelopes remain in the original message record. */
export function ConversationHeading({userText,projectName}:{userText?:string;projectName?:string}):React.ReactElement {
 const title=conversationDisplayTitle(userText);
 return <div className="thread-heading"><strong title={title}>{title}</strong>{projectName?<span>{projectName}</span>:null}</div>;
}
