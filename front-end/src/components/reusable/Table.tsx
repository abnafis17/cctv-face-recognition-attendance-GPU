// Table.tsx
import { cn } from "@/lib/utils";
import * as React from "react";

type TableElementProps<T extends HTMLElement> = React.HTMLAttributes<T> & {
  className?: string;
  freezeClassName?: string;
};

// Table component
const Table = React.forwardRef<
  HTMLTableElement,
  TableElementProps<HTMLTableElement>
>(({ className, freezeClassName, ...props }, ref) => {
  // console.log(freezeClassName, 'freezeClassName')
  return (
    <div
      className={`relative w-full overflow-auto modal-scroll rounded-md ${freezeClassName}`}
    >
      <table
        ref={ref}
        className={cn(
          "w-full caption-bottom text-[12px] table-auto overflow-auto border-separate border-spacing-0",
          className
        )}
        {...props}
      />
    </div>
  );
});
Table.displayName = "Table";

// TableHeader
const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  TableElementProps<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "text-[12px] [&_tr]:border-0",
      "bg-gray-100 hover:bg-gray-200 transition-colors z-40",
      className
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  TableElementProps<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  TableElementProps<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "text-[12px] transition-colors hover:bg-slate-100/50 data-[state=selected]:bg-slate-100 dark:data-[state=selected]:bg-slate-800",
      className
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  TableElementProps<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "text-[12px] h-10 px-4 text-left align-middle font-medium text-slate-500 dark:text-slate-400 ",
      // sticky header fix
      "sticky top-0 z-40 bg-gray-100  border-b",
      className
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "text-[12px] px-2 py-0 align-middle border-b [&:has([role=checkbox])]:pr-0 ",
      className
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  TableElementProps<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "text-[12px] bg-slate-100/50 font-medium dark:bg-slate-800/50",
      className
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

// TableCaption
const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  TableElementProps<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn(
      "mt-4 text-[12px] text-slate-500 dark:text-slate-400",
      className
    )}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
