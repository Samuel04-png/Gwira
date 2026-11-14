import React from 'react';
import logo from '../assets/gwira-logo.png';
import './gwiraLogo.css';

/** Original official artwork, losslessly cropped to its alpha bounds. No recoloring. */
export function GwiraLogo({ size = 'header' }: { size?: 'compact' | 'header' | 'empty' | 'canvas' }): React.ReactElement {
  return <img className={`gwira-logo gwira-logo--${size}`} src={logo} width="182" height="164" alt="" aria-hidden="true" draggable={false} />;
}
