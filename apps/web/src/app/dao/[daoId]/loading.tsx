import { Card, Heading, Skeleton, Text } from '@/components/ui';

export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading DAO</span>
      <Heading style={{ fontSize: '1.8rem' }}>
        <Skeleton style={{ width: '180px', height: '1.2em' }} />
      </Heading>
      <Text className="lede">
        <Skeleton style={{ width: '280px', height: '1em' }} />
      </Text>
      <Card p="5">
        <Skeleton style={{ width: '100%', height: '180px' }} />
      </Card>
    </div>
  );
}
