'use client';
import type { ReactNode } from 'react';

import { useCreateDaoStore } from '@/stores/create-dao-store';

import styles from './workspace.module.css';

export function CreationField({
  id,
  label,
  hint,
  children
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const error = useCreateDaoStore((s) => s.validationErrors[id]);
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? (
        <p className={styles.muted} id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
export function fieldAccessibility(id: string, errors: Record<string, string>) {
  return { 'aria-invalid': Boolean(errors[id]), 'aria-describedby': errors[id] ? `${id}-error` : undefined };
}
