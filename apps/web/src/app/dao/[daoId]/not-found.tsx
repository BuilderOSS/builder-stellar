import { ButtonLink, EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      action={
        <ButtonLink href="/discover" variant="secondary">
          Find a tribe
        </ButtonLink>
      }
    >
      The page or tribe you opened doesn&apos;t exist on this network, or the link is out of date.
    </EmptyState>
  );
}
