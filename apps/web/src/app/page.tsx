import Link from 'next/link';
import { Stack } from 'styled-system/jsx';

import { Card, Heading, Text } from '@/components/ui';
import { getAllDaosFromDatabase } from '@/lib/dao-db';
import { daoRoute } from '@/lib/dao-routes';

export default async function Page() {
  let daos;

  try {
    daos = await getAllDaosFromDatabase('operational');
  } catch {
    return (
      <main className="page-shell">
        <Stack gap="3" style={{ maxWidth: '720px', margin: '0 auto' }}>
          <Heading>DAO discovery unavailable</Heading>
          <Text>DAO data is temporarily unavailable. Open a DAO directly if you have its URL.</Text>
        </Stack>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <Stack gap="6" style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div>
          <Heading>Choose a DAO</Heading>
          <Text className="lede">Select a DAO to view its dashboard and governance activity.</Text>
        </div>
        <Stack gap="3">
          {daos.map((dao) => (
            <Link key={dao.dao_id} href={daoRoute(dao.dao_id)} style={{ color: 'inherit', textDecoration: 'none' }}>
              <Card p="5">
                <Heading style={{ fontSize: '1.2rem' }}>{dao.token_name || dao.label || 'Unnamed DAO'}</Heading>
                <Text>{dao.token_symbol || dao.dao_id}</Text>
              </Card>
            </Link>
          ))}
          {!daos.length ? <Text>No operational DAOs are available.</Text> : null}
        </Stack>
      </Stack>
    </main>
  );
}
