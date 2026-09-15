import Image from 'next/image';
import Link from 'next/link';
import { Grid, Stack } from 'styled-system/jsx';

import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Card, ShortId, Text } from '@/components/ui';
import { TOKEN_NAME } from '@/lib/token-config';
import { buildTokenMetadata } from '@/lib/token-metadata';

export default async function TokenPage({ params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params;
  const resolvedTokenId = Number.parseInt(tokenId, 10);
  const metadata = buildTokenMetadata(Number.isFinite(resolvedTokenId) ? resolvedTokenId : 0, '');

  return (
    <DaoShell>
      <PageSection
        eyebrow="Token"
        title={metadata.name}
        description="Readable token detail page backed by the same deterministic metadata used by the token contract base URI."
      >
        <Grid columns={{ base: 1, xl: 2 }} gap="4">
          <Card p="5">
            <Stack gap="3">
              <Image
                src={`/api/token/${resolvedTokenId}/image.svg`}
                alt={metadata.name}
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
              <ShortId value={String(resolvedTokenId)} label="Token" />
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                {metadata.description}
              </Text>
              <Link href={`/api/token/${resolvedTokenId}`} style={{ color: 'inherit' }}>
                View JSON metadata
              </Link>
            </Stack>
          </Card>
        </Grid>
      </PageSection>
    </DaoShell>
  );
}
