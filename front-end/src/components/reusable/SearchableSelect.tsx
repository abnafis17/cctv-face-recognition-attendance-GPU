"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";

type ItemBase = {
  value: string;
  label: string;
  keywords?: string;
  image?: string;
};

export function SearchableSelect({
  value,
  items,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  disabled,
  loading,
  loadingText = "Loading...",
  onSearchChange,
  onChange,
  className,
}: {
  value: string;
  items: ItemBase[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  onSearchChange?: (q: string) => void;
  onChange: (val: string) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [localQuery, setLocalQuery] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setLocalQuery("");
      onSearchChange?.("");
    }
  }, [open, onSearchChange]);

  const handleQueryChange = (q: string) => {
    setLocalQuery(q);
    onSearchChange?.(q);
  };

  const selected = React.useMemo(() => items.find((i) => i.value === value), [items, value]);

  const displayedItems = React.useMemo(() => {
    const q = localQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.keywords || "").toLowerCase().includes(q) ||
        item.value.toLowerCase().includes(q)
    );
  }, [items, localQuery]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between", className)}
        >
          <div className="flex items-center gap-2 truncate min-w-0">
            {selected && selected.image && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={selected.image} alt={selected.label} className="h-5 w-5 rounded-full object-cover shrink-0 border border-zinc-200" />
            )}
            <span className="truncate">{selected ? selected.label : placeholder}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        style={{ width: "var(--radix-popover-trigger-width)" }}
        className="p-0 shadow-2xl rounded-2xl border border-zinc-200/80 bg-white overflow-hidden"
        align="start"
        sideOffset={6}
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest?.('[data-virtual-keyboard="true"]')) e.preventDefault();
        }}
        onFocusOutside={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest?.('[data-virtual-keyboard="true"]')) e.preventDefault();
        }}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={localQuery}
            onValueChange={handleQueryChange}
          />

          {loading && displayedItems.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
              {loadingText}
            </div>
          ) : (
            <>
              {loading && (
                <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-zinc-100 flex items-center gap-2 bg-zinc-50/50">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                  Updating results...
                </div>
              )}
              {displayedItems.length === 0 && <CommandEmpty>{emptyText}</CommandEmpty>}
              <CommandGroup className="max-h-72 overflow-auto">
                {displayedItems.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={item.value}
                    onSelect={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", value === item.value ? "opacity-100" : "opacity-0")} />
                    <div className="flex items-center gap-2 truncate min-w-0">
                      {item.image && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={item.image} alt={item.label} className="h-6 w-6 rounded-full object-cover shrink-0 border border-zinc-200" />
                      )}
                      <span className="truncate">{item.label}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
