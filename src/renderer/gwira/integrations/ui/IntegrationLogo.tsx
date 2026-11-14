import React from 'react';
import whatsapp from './logos/whatsapp-business.svg';
import discord from './logos/discord.svg';
import slack from './logos/slack.svg';
import gmail from './logos/email.svg';
import github from './logos/github.svg';
import gitlab from './logos/gitlab.svg';
import drive from './logos/google-drive.svg';
import calendar from './logos/google-calendar.svg';
import sheets from './logos/google-sheets.svg';
import microsoft365 from './logos/microsoft-365.svg';
import crm from './logos/crm.svg';
import ecommerce from './logos/ecommerce.svg';
import customerSupport from './logos/customer-support.svg';
import payments from './logos/payment-service-providers.svg';
import mobileMoney from './logos/mobile-money.svg';
const LOGOS: Record<string,string>={'whatsapp-business':whatsapp,discord,slack,email:gmail,github,gitlab,'google-drive':drive,'google-calendar':calendar,'google-sheets':sheets,'microsoft-365':microsoft365,crm, ecommerce,'customer-support':customerSupport,'payment-service-providers':payments,'mobile-money':mobileMoney};
export function IntegrationLogo({integrationId,name}:{integrationId:string;name:string}):React.ReactElement {const src=LOGOS[integrationId];return <span className="gwira-integration-logo" role="img" aria-label={`${name} logo`}>{src?<img src={src} alt=""/>:<span aria-hidden="true">{name.slice(0,1)}</span>}</span>}
