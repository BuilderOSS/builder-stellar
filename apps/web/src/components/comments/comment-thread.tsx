'use client';

import { useState } from 'react';
import { css } from 'styled-system/css';

import {
  Avatar,
  Button,
  Callout,
  EmptyState,
  Field,
  FieldHelperText,
  FieldLabel,
  Markdown,
  MarkdownField,
  Section,
  Textarea
} from '@/components/ui';
import { relativeTime, shortAddress } from '@/lib/activity-feed';
import { commentBytes, type CommentItem, toOneLine } from '@/lib/comments';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const counter = css({ fontVariantNumeric: 'tabular-nums' });

/** A comment box that counts what the contract counts: UTF-8 bytes, not characters. */
export function CommentInput({
  id,
  label,
  value,
  onChange,
  maxBytes,
  disabled,
  rows = 3,
  helper,
  oneLine = false
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxBytes: number;
  disabled?: boolean;
  rows?: number;
  helper?: string;
  /** Fold line breaks to spaces as you type: for bid and listing comments. */
  oneLine?: boolean;
}) {
  const used = commentBytes(value);
  const over = used > maxBytes;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(oneLine ? toOneLine(event.target.value) : event.target.value)}
        disabled={disabled}
        aria-invalid={over || undefined}
      />
      <FieldHelperText tone={over ? 'error' : undefined}>
        {over ? 'Too long to post. Shorten it a little. ' : helper ? `${helper} ` : ''}
        <span className={counter}>
          {used.toLocaleString()} / {maxBytes.toLocaleString()}
        </span>
      </FieldHelperText>
    </Field>
  );
}

export function commentFits(value: string, maxBytes: number) {
  return value.trim().length > 0 && commentBytes(value) <= maxBytes;
}

const list = css({ listStyle: 'none', m: '0', p: '0' });
const item = css({
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  gap: '3',
  py: '3.5',
  borderBottomWidth: '1px',
  borderColor: 'rule',
  _last: { borderBottomWidth: '0' }
});
const head = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2' });
const who = css({ textStyle: 'body', fontWeight: '600', m: '0' });
const meta = css({ textStyle: 'caption', color: 'ink.muted' });
const body = css({ textStyle: 'body', m: '0', mt: '1', overflowWrap: 'anywhere' });
const richBody = css({ mt: '1' });
const composer = css({ display: 'grid', gap: '3', mt: '4' });

export type CommentComposer = {
  /** Why posting is unavailable (no wallet, module not upgraded yet, ...). Empty when it is. */
  unavailableReason: string;
  maxBytes: number;
  busy: boolean;
  /** Resolves true once the comment is confirmed, so the box can clear. */
  onPost: (body: string) => Promise<boolean>;
};

/**
 * Comments on one thing (a proposal, a listing), oldest first. Comments live on-chain as events,
 * so each one is a transaction the author signs and pays for.
 */
export function CommentThread({
  id,
  title,
  comments,
  loadError,
  viewer,
  emptyText,
  composer: compose,
  format = 'plain'
}: {
  id: string;
  title: string;
  comments: CommentItem[];
  loadError?: boolean;
  viewer?: string;
  emptyText: string;
  composer: CommentComposer | null;
  /** `markdown` for proposal discussion; `plain` keeps listing comments to one line of text. */
  format?: 'markdown' | 'plain';
}) {
  const [draft, setDraft] = useState('');
  const used = commentBytes(draft);
  const signedIn = useAuthSessionStore((state) => state.authStatus === 'authenticated');
  const ready = Boolean(compose && !compose.unavailableReason && commentFits(draft, compose.maxBytes));

  async function post() {
    if (!compose || !ready) return;
    if (await compose.onPost(format === 'plain' ? toOneLine(draft).trim() : draft.trim())) setDraft('');
  }

  return (
    <Section
      title={title}
      description={comments.length ? `${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}` : undefined}
    >
      {loadError ? <Callout variant="warning" title="Comments didn't load" /> : null}
      {!comments.length && !loadError ? (
        <EmptyState title="No comments yet">{emptyText}</EmptyState>
      ) : (
        <ul className={list}>
          {comments.map((comment) => {
            const isViewer = Boolean(viewer && viewer === comment.author);
            return (
              <li key={comment.id} className={item}>
                <Avatar address={comment.author} size="md" yours={isViewer} />
                <div>
                  <div className={head}>
                    <p className={who} title={comment.author}>
                      {isViewer ? 'You' : shortAddress(comment.author)}
                    </p>
                    {comment.timestamp ? <span className={meta}>{relativeTime(comment.timestamp)}</span> : null}
                  </div>
                  {format === 'markdown' ? (
                    <Markdown source={comment.body} variant="comment" className={richBody} />
                  ) : (
                    <p className={body}>{toOneLine(comment.body)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {compose ? (
        <div className={composer}>
          {compose.unavailableReason ? (
            <Callout title={compose.unavailableReason} />
          ) : (
            <>
              {format === 'markdown' ? (
                <Field>
                  <FieldLabel htmlFor={`${id}-comment`}>Add a comment</FieldLabel>
                  <MarkdownField
                    id={`${id}-comment`}
                    variant="comment"
                    canUpload={signedIn}
                    rows={4}
                    value={draft}
                    onChange={setDraft}
                    disabled={compose.busy}
                    invalid={used > compose.maxBytes}
                  />
                  <FieldHelperText tone={used > compose.maxBytes ? 'error' : undefined}>
                    {used > compose.maxBytes
                      ? 'Too long to post. Shorten it a little. '
                      : "Everyone can read it, and it can't be edited or deleted. "}
                    <span className={counter}>
                      {used.toLocaleString()} / {compose.maxBytes.toLocaleString()}
                    </span>
                  </FieldHelperText>
                </Field>
              ) : (
                <CommentInput
                  id={`${id}-comment`}
                  label="Add a comment"
                  value={draft}
                  onChange={setDraft}
                  maxBytes={compose.maxBytes}
                  disabled={compose.busy}
                  rows={2}
                  oneLine
                  helper="One line of plain text. Everyone can read it, and it can't be edited or deleted."
                />
              )}
              <div>
                <Button variant="secondary" onClick={() => void post()} disabled={!ready} loading={compose.busy}>
                  {compose.busy ? 'Posting' : 'Post comment'}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </Section>
  );
}
