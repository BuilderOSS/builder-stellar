/** Who can change a Manage section: you directly, by a vote, or nobody here (read only). */
export type ManageAccess = 'direct' | 'vote' | 'read' | 'open';

export type ManageAuthority = {
  /** The signed-in wallet is the Token admin (the launch admin, before launch). */
  isAdmin: boolean;
  hasMintAccess: boolean;
  hasGovernanceAccess: boolean;
  /** The Treasury is the Token or Governor admin: changes go to a vote. */
  canProposeAdminActions: boolean;
  canProposeMint: boolean;
  canProposeGovernance: boolean;
  canProposeAuction: boolean;
};

const access = (direct: boolean, vote: boolean): ManageAccess => (direct ? 'direct' : vote ? 'vote' : 'read');

/**
 * The access chip for each Manage section after launch, keyed by section. A section not listed is open
 * to read and act on. Launch hands the admin of every module (Metadata and Marketplace too) to the
 * Treasury, so their settings need a vote like the rest (BUG-W09-2).
 */
export function manageSectionAccess(a: ManageAuthority): Partial<Record<string, ManageAccess>> {
  return {
    profile: access(a.isAdmin, a.canProposeAdminActions),
    token: access(a.hasMintAccess, a.canProposeMint),
    governance: access(a.hasGovernanceAccess, a.canProposeGovernance),
    owner: access(a.isAdmin, a.canProposeAdminActions),
    auction: access(a.isAdmin, a.canProposeAuction),
    artwork: access(a.isAdmin, a.canProposeAdminActions),
    marketplace: access(a.isAdmin, a.canProposeAdminActions)
  };
}
