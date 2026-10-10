'use client';

import { ark } from '@ark-ui/react/factory';
import { LoaderCircle } from 'lucide-react';
import NextLink from 'next/link';
import { type ComponentProps, forwardRef } from 'react';
import { css, cx } from 'styled-system/css';
import { styled } from 'styled-system/jsx';
import { button, type ButtonVariantProps } from 'styled-system/recipes';

const ButtonBase = styled(ark.button, button);

const spinner = css({
  animation: 'spin 1s linear infinite',
  '@media (prefers-reduced-motion: reduce)': { animationDuration: '2.4s' }
});

type ButtonProps = ComponentProps<typeof ButtonBase> & {
  /** Disable the press scale where motion would distract. */
  static?: boolean;
  /** Shows a spinner, sets aria-busy and blocks clicks. */
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { static: isStatic, loading, disabled, children, ...props },
  ref
) {
  // No default `type`: existing forms rely on native submit buttons.
  return (
    <ButtonBase
      ref={ref}
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-static={isStatic ? '' : undefined}
    >
      {loading ? <LoaderCircle aria-hidden="true" className={spinner} /> : null}
      {children}
    </ButtonBase>
  );
});

type IconButtonProps = Omit<ButtonProps, 'iconOnly' | 'aria-label'> & {
  /** Required: icon-only controls need an accessible name. */
  label: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', title, ...props },
  ref
) {
  return <Button ref={ref} variant={variant} iconOnly aria-label={label} title={title ?? label} {...props} />;
});

type ButtonLinkProps = ComponentProps<typeof NextLink> &
  ButtonVariantProps & {
    external?: boolean;
  };

/** A link that looks like a button. Use for navigation, never for actions. */
export function ButtonLink({ variant, size, iconOnly, block, className, external, ...props }: ButtonLinkProps) {
  const classes = cx(button({ variant, size, iconOnly, block }), className);
  if (external) {
    const { href, ...rest } = props;
    return (
      <a
        href={typeof href === 'string' ? href : String(href)}
        target="_blank"
        rel="noreferrer"
        className={classes}
        {...(rest as ComponentProps<'a'>)}
      />
    );
  }
  return <NextLink className={classes} {...props} />;
}
