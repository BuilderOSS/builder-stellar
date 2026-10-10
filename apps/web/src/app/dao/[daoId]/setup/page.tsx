'use client';

import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { css } from 'styled-system/css';

import { LaunchSetup } from '@/components/launch/launch-setup';
import { ButtonLink, PageHeader } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';

/** Setup lives here until launch; afterwards the community's Home takes over. */
export default function SetupPage() {
  const { daoId, routeId, daoConfig: config } = useDaoContext();
  const router = useRouter();
  const live = config.status !== 'pending';
  useEffect(() => {
    if (live) router.replace(daoRoute(routeId));
  }, [live, routeId, router]);
  if (live) return null;
  return (
    <div className={css({ display: 'grid', gap: '2', maxW: '760px' })}>
      <ButtonLink
        href={daoRoute(routeId)}
        variant="ghost"
        size="sm"
        className={css({ justifySelf: 'start', ml: '-3' })}
      >
        <ChevronLeft aria-hidden="true" />
        {config.tokenName || 'Community'}
      </ButtonLink>
      <PageHeader
        title="Set up and launch"
        meta="Finish the required steps, check what you chose, then launch to open it to members."
      />
      <LaunchSetup daoId={daoId} config={config} />
    </div>
  );
}
