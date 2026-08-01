// src/components/common/SearchableSelect.tsx
"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";

type ItemBase = {
  value: string;
  label: string;
  keywords?: string; // optional extra search text
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
  const [searchQuery, setSearchQuery] = React.useState("");

  const selected = React.useMemo(
    () => items.find((i) => i.value === value),
    [items, value]
  );

  const filteredItems = React.useMemo(() => {
    // If an external search handler is provided (e.g. server API search), don't filter locally
    if (onSearchChange) return items;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) => {
      const label = item.label.toLowerCase();
      const val = item.value.toLowerCase();
      const kw = (item.keywords || "").toLowerCase();
      return label.includes(q) || val.includes(q) || kw.includes(q);
    });
  }, [items, searchQuery, onSearchChange]);

  const handleSearchChange = React.useCallback(
    (q: string) => {
      setSearchQuery(q);
      onSearchChange?.(q);
    },
    [onSearchChange]
  );

  React.useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

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
          <span className="truncate">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchQuery}
            onValueChange={handleSearchChange}
          />

          {loading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {loadingText}
            </div>
          ) : (
            <>
              {filteredItems.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                  {emptyText}
                </div>
              ) : null}
              <CommandGroup className="max-h-72 overflow-auto">
                {filteredItems.map((item) => (
                  <CommandItem
                    key={item.value || item.label}
                    value={item.value || item.label}
                    onSelect={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === item.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">{item.label}</span>
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
