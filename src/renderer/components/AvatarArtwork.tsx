import React,{createContext,useContext,useState} from 'react';

/** Optional visual assets only. A provider must explicitly supply a name-to-artwork map.
 * The Dashboard supplies this context only for its existing development demos. */
export const AvatarArtworkContext=createContext<Readonly<Record<string,string>>|undefined>(undefined);
export function AvatarArtwork({name,src,children,className='',imageStyle}:{name?:string;src?:string;children:React.ReactNode;className?:string;imageStyle?:React.CSSProperties}):React.ReactElement {
 const assets=useContext(AvatarArtworkContext),source=src??(name?assets?.[name]:undefined);
 const [failed,setFailed]=useState<string>();
 return source&&failed!==source?<img className={`gw-avatar-artwork ${className}`.trim()} src={source} style={imageStyle} alt="" draggable={false} onError={()=>setFailed(source)}/>:<>{children}</>;
}
