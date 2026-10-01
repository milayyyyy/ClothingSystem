import { useEffect, useMemo, useState } from "react";

export const LIST_PAGE_SIZES = [10, 30, 100] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZES)[number];

export function paginationItems(page: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (page <= 4) return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  if (page >= totalPages - 3) {
    return [1, "ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "ellipsis", page - 1, page, page + 1, "ellipsis", totalPages];
}

export function useListPagination(itemCount: number, resetKey: string | number) {
  const [pageSize, setPageSizeState] = useState<ListPageSize>(30);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize]);

  const totalPages = Math.max(1, Math.ceil(Math.max(0, itemCount) / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;

  const paginate = useMemo(() => {
    return <T,>(rows: T[]) => rows.slice(start, start + pageSize);
  }, [start, pageSize]);

  function setPageSize(next: ListPageSize) {
    setPageSizeState(next);
    setPage(1);
  }

  return {
    page: currentPage,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    paginate,
    totalItems: itemCount,
  };
}
