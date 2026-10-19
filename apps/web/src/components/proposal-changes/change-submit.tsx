'use client';

import { type ComponentProps, forwardRef } from 'react';

import { Button } from '@/components/ui';

type ChangeSubmitProps = Omit<ComponentProps<typeof Button>, 'children'> & {
  /** Before launch, the launch admin applies a change directly; after launch it goes to a vote. */
  direct: boolean;
  /** A count or what the change is, when it helps: "3 steps", "the new pool". */
  what?: string;
  /** An edit of a change already in the proposal. */
  editing?: boolean;
  /** The outcome, when applying directly has a better name: "Mint 5 tokens". */
  directLabel?: string;
  /** For a choice between two values on one row: "Turn on in proposal". */
  proposeLabel?: string;
};

/**
 * The one button for making a change, so every page says the same thing: "Apply now" for the launch admin
 * before launch, "Add to proposal" once the change requires DAO governance.
 */
export const ChangeSubmit = forwardRef<HTMLButtonElement, ChangeSubmitProps>(function ChangeSubmit(
  { direct, what, editing = false, directLabel, proposeLabel, type = 'button', ...props },
  ref
) {
  const label = direct
    ? (directLabel ?? (what ? `Apply ${what} now` : 'Apply now'))
    : editing
      ? 'Save in proposal'
      : (proposeLabel ?? (what ? `Add ${what} to proposal` : 'Add to proposal'));
  return (
    <Button ref={ref} type={type} {...props}>
      {label}
    </Button>
  );
});

/** The helper line under a change's button: who has to agree before it happens. */
export function changeAuthorityText(direct: boolean) {
  return direct
    ? 'Setup: you apply this directly as the launch admin.'
    : 'Requires DAO governance: it runs only if members vote for it.';
}
