"use client";

import React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  ColumnDef,
  SortingState,
  VisibilityState,
  ColumnFiltersState,
  RowSelectionState,
  Table as TableType,
  Row,
} from "@tanstack/react-table";
import { ArrowUp, ArrowDown } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./Table";

interface TanstackDataTableProps<TData>
  extends React.HTMLAttributes<HTMLDivElement> {
  freezeClassName?: any;
  data: any;
  columns: ColumnDef<TData, any>[];
  className?: string;
  loading?: boolean;
  isBorderless?: boolean;
  limits?: number;
  isBorderBottomOnly?: boolean;
  customRow?: (row: Row<TData>, index: number) => React.ReactNode;
  lastRow?: any;
  cellHeight?: number | string;
  headerCellClassName?: string;
}

export function TanstackDataTable<TData>({
  data,
  columns,
  className = "",
  loading = false,
  isBorderless = false,
  limits = 20,
  isBorderBottomOnly = false,
  lastRow,
  customRow,
  cellHeight,
  headerCellClassName,
  freezeClassName,
  ...props
}: TanstackDataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const firstHeaderClass = headerCellClassName?.trim()?.length
    ? headerCellClassName
    : "whitespace-nowrap";

  const table = useReactTable<TData>({
    data,
    columns,
    defaultColumn: {
      enableSorting: false, // ✅ all columns unsortable by default
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    initialState: {
      sorting: [
        {
          id: "name",
          desc: true,
        },
      ],
    },
    enableMultiSort: false,
  });

  if (loading) {
    return (
      <Table freezeClassName={freezeClassName}>
        <TableBody>
          {Array.from({ length: limits }).map((_, index) => (
            <TableRow key={index} className={isBorderless ? "border-none" : ""}>
              {Array.from({ length: columns.length }).map((_, cellIndex) => (
                <TableCell
                  key={cellIndex}
                  className={`h-7 bg-gray-200/50 border animate-pulse ${
                    isBorderless ? "border-none" : "border"
                  }`}
                >
                  <div className="bg-gray-200 h-6 w-full rounded animate-pulse"></div>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className={`w-full h-full ${className}`}>
      <Table freezeClassName={freezeClassName}>
        <TableHeader className="">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className={isBorderless ? "border-none" : ""}
            >
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={`${firstHeaderClass} font-medium capitalize ${
                    isBorderless
                      ? "border-none"
                      : isBorderBottomOnly
                      ? "border-b border-gray-100 "
                      : "border border-gray-100"
                  }`}
                  onClick={(event) => {
                    const canSort =
                      header.column.columnDef.enableSorting ?? false;
                    if (!canSort) return;
                    const handler = header.column.getToggleSortingHandler?.();
                    handler?.(event);
                  }}
                  style={{
                    cursor: header.column.columnDef.enableSorting
                      ? "pointer"
                      : "default",
                    height: cellHeight || "auto",
                    ...(header.column.columnDef.size
                      ? {
                          width: `${header.column.columnDef.size}px`,
                          // minWidth: `${header.column.columnDef.size}px`,
                          // maxWidth: `${header.column.columnDef.size}px`,
                        }
                      : {}),
                  }}
                >
                  {header.isPlaceholder ? null : (
                    <div className="flex items-center gap-1">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}

                      {/* ✅ sorting icons */}
                      {header.column.columnDef.enableSorting &&
                        header.column.getIsSorted() === "asc" && (
                          <ArrowUp size={14} />
                        )}
                      {header.column.columnDef.enableSorting &&
                        header.column.getIsSorted() === "desc" && (
                          <ArrowDown size={14} />
                        )}
                    </div>
                  )}
                  {/* {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())} */}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {table.getRowModel().rows?.length > 0 ? (
            table.getRowModel().rows.map((row, index) =>
              customRow ? (
                customRow(row, index)
              ) : (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={isBorderless ? "border-none" : ""}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={
                        isBorderless
                          ? "border-none"
                          : isBorderBottomOnly
                          ? "border-b border-gray-100"
                          : "border border-gray-100"
                      }
                      style={{
                        height: cellHeight || "auto", // ✅ apply height to each cell
                        verticalAlign: "middle", // optional: ensure content is vertically centered
                        ...(cell.column.columnDef.size
                          ? {
                              width: `${cell.column.columnDef.size}px`,
                              // minWidth: `${cell.column.columnDef.size}px`,
                              // maxWidth: `${cell.column.columnDef.size}px`,
                            }
                          : {}),
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              )
            )
          ) : (
            <TableRow className={isBorderless ? "border-none h-full" : ""}>
              <TableCell
                colSpan={columns.length}
                className={`h-24 text-center ${
                  isBorderless ? "border-none" : ""
                }`}
              >
                No Data Available
              </TableCell>
            </TableRow>
          )}
          {lastRow && lastRow()}
        </TableBody>
      </Table>
    </div>
  );
}
