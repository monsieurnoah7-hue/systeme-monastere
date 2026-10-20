import { useEffect, useState, type ReactNode } from 'react';
import {
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnSort,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from 'cn';
import { Button } from './ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

export type DataTableColumnMeta = {
  headerClassName?: string;
  cellClassName?: string;
};

export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  columnMeta: {} as DataTableColumnMeta,
});

export type DataTableFeatures = typeof dataTableFeatures;
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData>;

type DataTableProps<TData extends RowData> = {
  data: TData[];
  columns: DataTableColumn<TData>[];
  onRowClick?: (row: TData) => void;
  caption?: string;
  minWidth?: string;
  pageSize?: number;
  initialSorting?: ColumnSort[];
  empty?: ReactNode;
  className?: string;
};

const DEFAULT_PAGE_SIZE = 25;

export function DataTable<TData extends RowData>({
  data,
  columns,
  onRowClick,
  caption,
  minWidth,
  pageSize = DEFAULT_PAGE_SIZE,
  initialSorting,
  empty,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  useEffect(() => {
    setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
  }, [data]);

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });

  const rows = table.getRowModel().rows;
  const pageIndex = table.state.pagination.pageIndex;
  const total = data.length;
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);
  const paginated = total > pageSize;

  return (
    <div className={cn('overflow-hidden rounded-card border border-line bg-surface', className)}>
      {caption ? <p className="sr-only">{caption}</p> : null}
      <div className="overflow-x-auto scroll-thin">
        <Table className={cn('text-left', minWidth)}>
          <TableHeader className="border-b border-line bg-surface-2 [&_tr]:border-0">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="text-[11px] uppercase tracking-wider text-ink-faint">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  const meta = header.column.columnDef.meta as DataTableColumnMeta | undefined;
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={canSort ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none') : undefined}
                      className={cn(
                        'h-9 whitespace-nowrap px-4 font-semibold',
                        sorted && 'text-ink',
                        meta?.headerClassName,
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="group -mx-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/40"
                        >
                          {table.FlexRender({ header })}
                          {sorted === 'asc' ? (
                            <ArrowUp className="size-3.5 text-amber" aria-hidden />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="size-3.5 text-amber" aria-hidden />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-0 transition-opacity group-hover:opacity-45" aria-hidden />
                          )}
                        </button>
                      ) : (
                        table.FlexRender({ header })
                      )}
                    </TableHead>
                  );
                })}
              </tr>
            ))}
          </TableHeader>
          <TableBody className="border-t border-line [&_tr]:border-line">
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="px-4 py-12 text-center">
                  {empty ?? <span className="text-sm text-ink-faint">Aucune ligne à afficher.</span>}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
                  )}
                >
                  {row.getAllCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as DataTableColumnMeta | undefined;
                    return (
                      <TableCell key={cell.id} className={cn('px-4 py-3', meta?.cellClassName)}>
                        {table.FlexRender({ cell })}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {paginated ? (
        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2/60 px-4 py-2.5">
          <p className="text-[13px] text-ink-faint num">
            {from}–{to} sur {total}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
              Précédent
            </Button>
            <Button size="sm" variant="secondary" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
              Suivant
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
