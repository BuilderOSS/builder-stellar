'use client';

import { ButtonLink, Callout } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { daoAdminRoute } from '@/lib/dao-routes';
import { MODULE_LABELS } from '@/lib/module-updates';
import { useModuleUpdates } from '@/lib/use-module-updates';
import { useAuthSessionStore } from '@/stores/auth-session-store';

/**
 * A quiet heads-up that contract updates are waiting, for people who can act on them (the launch
 * admin in setup, members after launch). Renders nothing otherwise, and only reads chain state then.
 */
export function ContractUpdatesNotice({ enabled }: { enabled: boolean }) {
  const { routeId, daoConfig: config } = useDaoContext();
  const address = useAuthSessionStore((state) => state.address);
  const { plan } = useModuleUpdates(config, address, enabled);
  const count = plan.actionable.length;
  if (!enabled || (!count && !plan.withdrawn.length)) return null;

  const withdrawn = plan.withdrawn.length > 0;
  const first = plan.actionable[0];
  return (
    <Callout
      variant={withdrawn ? 'error' : 'info'}
      title={
        withdrawn
          ? `${MODULE_LABELS[plan.withdrawn[0].module]} needs an update`
          : count === 1
            ? 'A contract update is available'
            : `${count} contract updates are available`
      }
      description={
        withdrawn
          ? config.status === 'pending'
            ? 'It is on a withdrawn version, so the community can’t launch until it’s updated.'
            : 'It is on a withdrawn version. Update it as soon as you can.'
          : first
            ? `${MODULE_LABELS[first.module]} ${first.current} → ${first.next!.version}${count > 1 ? `, and ${count - 1} more` : ''}.`
            : undefined
      }
    >
      <div>
        <ButtonLink href={daoAdminRoute(routeId, '/upgrades')} variant="secondary" size="sm">
          Review {count === 1 ? 'update' : 'updates'}
        </ButtonLink>
      </div>
    </Callout>
  );
}
