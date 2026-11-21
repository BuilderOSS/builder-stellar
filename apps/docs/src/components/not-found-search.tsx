'use client';

import { Button } from '@builder-stellar/web/ui/button';
import { SearchInput } from '@builder-stellar/web/ui/search-input';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { openSearch } from '@/lib/site';

const form = css({ display: 'flex', gap: '2', alignItems: 'center' });

/** A search field that hands its query to the search dialog. */
export function NotFoundSearch() {
  const [query, setQuery] = useState('');
  return (
    <form
      role="search"
      className={form}
      onSubmit={(event) => {
        event.preventDefault();
        openSearch(query);
      }}
    >
      <SearchInput label="Search the docs" placeholder="Search the docs" value={query} onValueChange={setQuery} />
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}
