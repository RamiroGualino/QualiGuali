import { useMemo, useState } from 'react';

// Shared client-side search + pagination for list pages (Modules,
// Requirements, Test Cases) — none of qa-core-service/projects-service's
// list endpoints support server-side search/skip/limit yet, so this
// filters/slices whatever the page already fetched.
// `searchFields` should be a module-level constant array (stable reference)
// so it doesn't invalidate the memo on every render.
export function useSearchAndPaginate(items, searchFields, { initialPageSize = 25 } = {}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const term = search.trim().toLowerCase();
    return items.filter((item) =>
      searchFields.some((field) =>
        String(item[field] ?? '')
          .toLowerCase()
          .includes(term),
      ),
    );
  }, [items, search, searchFields]);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  function handleSearchChange(value) {
    setSearch(value);
    setPage(1);
  }

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  return {
    search,
    onSearchChange: handleSearchChange,
    page: safePage,
    pageSize,
    totalItems,
    onPageChange: setPage,
    onPageSizeChange: handlePageSizeChange,
    pageItems,
    // Full search-filtered set, before pagination slices it — for callers
    // that need "everything matching the current filter" (e.g. CSV export),
    // not just the visible page.
    filteredItems: filtered,
  };
}
