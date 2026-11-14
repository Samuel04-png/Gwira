import React,{useMemo,useState} from 'react';
import type {RoutableWorkspaceView} from '../navigationTypes.js';
import {workspaceNavigationLabel} from '../navigationTypes.js';
import {DashboardPage} from '../gwira/dashboard/DashboardPage.js';
import {createEmptyLocalState} from '../gwira/domain/types.js';
import {InboxHeading} from '../gwira/inbox/InboxPage.js';
import {InboxNav} from '../gwira/inbox/InboxNav.js';
import type {InboxDestination} from '../gwira/inbox/inboxNavModel.js';
import {LibraryPage} from '../gwira/library/LibraryPage.js';
import {IntegrationsCatalogPage} from '../gwira/integrations/ui/IntegrationsCatalogPage.js';
import {INTEGRATION_CATALOG} from '../gwira/integrations/domain/catalog.js';
import {UnavailableSchedulePage,type AvailableCategory} from '../gwira/schedule/SchedulePage.js';
import {SkillsView} from '../components/SkillsView.js';
import {AgentsPage} from '../gwira/workspace/AgentsPage.js';
import {DoatDirectory} from '../gwira/doats/ui/DoatDirectory.js';
import {AuthenticatedSettingsPage} from '../gwira/workspace/SettingsPage.js';
import {UnavailableMyWorkPage} from '../gwira/work/MyWorkPage.js';
import {UnavailableViewsPage} from '../gwira/views/ViewsPage.js';
import {UnavailableTeamsPage} from '../gwira/workspace/TeamsPage.js';

export function UnavailableWorkspaceView({view,workspace,scheduleCategory='upcoming'}:{view:RoutableWorkspaceView;workspace:string;scheduleCategory?:AvailableCategory}):React.ReactElement {
 const emptyDashboard=useMemo(()=>createEmptyLocalState({organizationId:'unavailable',workspaceId:'unavailable'},new Date(0).toISOString(),workspace,workspace),[workspace]);
 if(view==='dashboard')return <DashboardPage state={emptyDashboard} authenticatedUnavailable panelOpen={false} onPanelOpenChange={unavailable} onStartConversation={unavailable} onAskAboutRecord={unavailable} onOpenTask={unavailable} onCreateTask={unavailable} onUpdateTask={unavailable}/>;
 if(view==='library')return <LibraryPage authenticated/>;
 if(view==='inbox')return <UnavailableInbox/>;
 if(view==='integrations')return <IntegrationsCatalogPage catalog={INTEGRATION_CATALOG} dataUnavailable/>;
 if(view==='schedule')return <UnavailableSchedulePage category={scheduleCategory}/>;
 if(view==='skills')return <SkillsView unavailable skills={[]} search="" loading={false} onSearch={unavailable} onRefresh={unavailable} onCreate={unavailable} onLearnMore={unavailable} onOpen={unavailable} onToggle={unavailable}/>;
 if(view==='agents')return <AgentsPage unavailable state={emptyDashboard} onAddCodingAgent={unavailable}/>;
 if(view==='doats')return <DoatDirectory unavailable doats={[]} onOpenDoat={unavailable} onCreateDoat={unavailable}/>;
 if(view==='settings')return <AuthenticatedSettingsPage workspace={workspace}/>;
 if(view==='my-work')return <UnavailableMyWorkPage workspace={workspace}/>;
 if(view==='organization')return <UnavailableViewsPage/>;
 if(view==='teams')return <UnavailableTeamsPage/>;
 return <section className="workspace__view--unavailable" aria-label={workspaceNavigationLabel(view)}><h1>{workspaceNavigationLabel(view)}</h1><p>This section is not connected for authenticated workspaces.</p></section>;
}
function unavailable():never {throw new Error('This service is unavailable in authenticated workspaces.');}

function UnavailableInbox():React.ReactElement {
 const [destination,setDestination]=useState<InboxDestination>({kind:'utility',view:'unread'});
 return <section className="gwira-inbox-workspace" aria-label="Inbox" data-testid="inbox-workspace" data-layout="two-pane">
  <div className="gw-inbox-layout"><aside className="gw-inbox-master" aria-label="Inbox navigation"><InboxNav ephemeral dataUnavailable conversations={[]} pendingApprovals={0} hideEmptyHint destination={destination} onSelectDestination={setDestination} header={<InboxHeading/>}/></aside>
   <main className="gw-inbox-main"><div className="gw-inbox-empty-selection"><h2>Inbox is unavailable</h2><p>Inbox messaging is not connected for authenticated workspaces.</p></div></main>
  </div>
 </section>;
}
