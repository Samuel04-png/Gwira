import type {AccountSnapshot} from '../../shared/accountAuth.js';
import type {CloudOrganization,CloudTeam} from '../../shared/organizationAccess.js';

export function workspaceView(snapshot:AccountSnapshot,workspaceId:string):{organization:CloudOrganization;teams:CloudTeam[]}|undefined {
 const organization=snapshot.activeOrganization;
 if(!snapshot.user||!organization||organization.id!==workspaceId||!snapshot.organizations.some(item=>item.id===organization.id&&item.role===organization.role))return undefined;
 return {organization,teams:snapshot.teams.filter(team=>team.organizationId===organization.id)};
}
