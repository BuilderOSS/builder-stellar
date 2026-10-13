'use client';

import { useRef, useState } from 'react';

import { CommentThread } from '@/components/comments/comment-thread';
import { MAX_COMMENT_BYTES } from '@/lib/comments';
import { useMarketplaceComments } from '@/lib/marketplace/hooks';
import type { MarketplaceAction, MarketplaceListing } from '@/lib/marketplace/types';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { TradeReview } from './trade-review';

/**
 * Comments on a resale token (one thread shared by every listing of that token). Pools carry no
 * comments. Posting goes through the same server-built review as a trade.
 */
export function ListingComments({ listing }: { listing: MarketplaceListing }) {
  const session = useAuthSessionStore();
  const id = listing.tokenId ?? listing.id;
  const comments = useMarketplaceComments(listing.daoId, 'secondary', id, listing.kind === 'secondary');
  const [action, setAction] = useState<MarketplaceAction | null>(null);
  const settle = useRef<((posted: boolean) => void) | null>(null);
  const signedIn = session.authStatus === 'authenticated' && Boolean(session.address);

  function finish(posted: boolean) {
    settle.current?.(posted);
    settle.current = null;
  }

  return (
    <>
      <CommentThread
        id={`listing-${listing.eventId}`}
        title={`Comments on #${id}`}
        comments={comments.data?.items ?? []}
        loadError={Boolean(comments.error)}
        viewer={session.address}
        emptyText="Notes about this token show up here, across all its listings."
        composer={
          comments.data
            ? {
                unavailableReason: signedIn ? '' : 'Connect and sign in with your wallet to comment.',
                maxBytes: MAX_COMMENT_BYTES,
                busy: Boolean(action),
                onPost: (body) =>
                  new Promise<boolean>((resolve) => {
                    settle.current = resolve;
                    setAction({ action: 'comment', kind: 'secondary', id, body });
                  })
              }
            : null
        }
      />
      {action ? (
        <TradeReview
          key={JSON.stringify(action)}
          daoId={listing.daoId}
          action={action}
          onConfirmed={() => {
            finish(true);
            void comments.mutate();
          }}
          onClose={() => {
            finish(false);
            setAction(null);
          }}
        />
      ) : null}
    </>
  );
}
