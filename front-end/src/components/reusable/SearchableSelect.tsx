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
  popoverClassName,
  minWidth,
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
  popoverClassName?: string;
  minWidth?: number | string;
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
          className={cn(
            "w-full justify-between h-9 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-800 shadow-none hover:bg-zinc-50/70 hover:border-zinc-300 transition-colors",
            className
          )}
        >
          <div className="flex items-center gap-2 truncate min-w-0">
            {selected && selected.image && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={selected.image}
                alt={selected.label}
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
                className="h-5 w-5 rounded-full object-cover shrink-0 border border-zinc-200"
              />
            )}
            <span className="truncate">{selected ? selected.label : placeholder}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-zinc-400" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        style={{
          width: "var(--radix-popover-trigger-width)",
          minWidth: minWidth ?? "max(var(--radix-popover-trigger-width), 280px)",
          maxWidth: "calc(100vw - 24px)",
        }}
        className={cn(
          "p-0 shadow-2xl rounded-xl border border-zinc-200/90 bg-white overflow-hidden z-50",
          popoverClassName
        )}
        align="start"
        sideOffset={6}
        avoidCollisions={true}
        collisionPadding={12}
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
            <div className="px-3 py-3 text-xs text-muted-foreground flex items-center gap-2 justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
              <span>{loadingText}</span>
            </div>
          ) : (
            <>
              {loading && (
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-zinc-100 flex items-center gap-2 bg-zinc-50/70">
                  <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
                  <span>Updating results...</span>
                </div>
              )}
              {displayedItems.length === 0 && (
                <CommandEmpty className="py-4 text-center text-xs text-zinc-400">
                  {emptyText}
                </CommandEmpty>
              )}
              <CommandGroup className="max-h-72 overflow-y-auto p-1">
                {displayedItems.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={item.value}
                    onSelect={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 px-2.5 py-2 text-xs text-zinc-700 rounded-md cursor-pointer aria-selected:bg-violet-50 aria-selected:text-violet-900 transition-colors"
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-violet-600 transition-opacity",
                        value === item.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {item.image && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.image}
                          alt={item.label}
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = "none";
                          }}
                          className="h-5 w-5 rounded-full object-cover shrink-0 border border-zinc-200"
                        />
                      )}
                      <span className="truncate flex-1 font-medium">{item.label}</span>
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
