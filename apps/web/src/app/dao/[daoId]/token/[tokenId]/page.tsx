import type { Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Grid, Stack } from 'styled-system/jsx';

import { PageSection } from '@/components/page-section';
import { Badge, Card, ShortId, Text } from '@/components/ui';
import { TOKEN_DESCRIPTION, TOKEN_NAME } from '@/lib/token-config';

export default async function TokenPage({ params }: { params: Promise<{ daoId: string; tokenId: string }> }) {
  const { daoId, tokenId } = await params;
  const resolvedTokenId = Number.parseInt(tokenId, 10);
  const displayTokenId = Number.isFinite(resolvedTokenId) ? resolvedTokenId : 0;
  const tokenName = `${TOKEN_NAME} #${displayTokenId}`;

  return (
    <PageSection
      title={tokenName}
      description="Readable token detail page backed by the DAO renderer and onchain token metadata."
    >
      <Grid columns={{ base: 1, xl: 2 }} gap="4">
        <Card p="5">
          <Stack gap="3">
            <Image
              src={`/api/render/${encodeURIComponent(daoId)}/${displayTokenId}`}
              alt={tokenName}
              width={256}
              height={256}
              unoptimized
              style={{ width: '100%', height: 'auto', borderRadius: '24px' }}
            />
            <Badge>{TOKEN_NAME}</Badge>
          </Stack>
        </Card>
        <Card p="5">
          <Stack gap="2">
            <Text className="label">Metadata</Text>
            <ShortId value={String(displayTokenId)} label="Token" />
            <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
              {TOKEN_DESCRIPTION}
            </Text>
            <Link
              href={`/api/dao/${encodeURIComponent(daoId)}/token/${displayTokenId}` as Route}
              style={{ color: 'inherit' }}
            >
              View JSON metadata
            </Link>
          </Stack>
        </Card>
      </Grid>
    </PageSection>
  );
}
