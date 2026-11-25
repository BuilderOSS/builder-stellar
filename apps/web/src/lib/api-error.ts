import { NextResponse } from 'next/server';

/**
 * The response for a failure the client can't act on: a database, indexer, RPC or IPFS error.
 *
 * Upstream error text can name hosts, queries, tables or configuration, so it goes to the server
 * log under `scope` and the client gets only `body`, whose `message` is written for people.
 */
export function internalErrorResponse(
  scope: string,
  error: unknown,
  body: { message: string } & Record<string, unknown>,
  { status = 503, headers = { 'Cache-Control': 'no-store' } }: { status?: number; headers?: HeadersInit } = {}
) {
  console.error(`[api:${scope}]`, error);
  return NextResponse.json(body, { status, headers });
}
