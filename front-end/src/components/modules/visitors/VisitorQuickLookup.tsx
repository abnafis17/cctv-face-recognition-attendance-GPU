"use client";

import React from "react";
import { Search, Phone, ArrowRightLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type VisitorQuickLookupProps = {
  lookupPhone: string;
  setLookupPhone: (val: string) => void;
  isLookupEmployee: boolean;
  setIsLookupEmployee: (val: boolean) => void;
  handleLookup: () => void;
};

export function VisitorQuickLookup({
  lookupPhone,
  setLookupPhone,
  isLookupEmployee,
  setIsLookupEmployee,
  handleLookup,
}: VisitorQuickLookupProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#0c1b33]">
        <ArrowRightLeft className="h-4 w-4" />
        Quick Lookup — Returning Visitor
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Enter phone number or employee id"
            value={lookupPhone}
            onChange={(e) => setLookupPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleLookup();
              }
            }}
            className="h-10 pl-10 rounded-xl border-zinc-200 bg-slate-50/50"
          />
        </div>
        <div className="flex items-center gap-2 px-1">
          <input
            type="checkbox"
            id="isEmployee"
            checked={isLookupEmployee}
            onChange={(e) => setIsLookupEmployee(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-[#0c1b33] focus:ring-[#0c1b33] cursor-pointer"
          />
          <label
            htmlFor="isEmployee"
            className="text-sm font-medium text-zinc-700 cursor-pointer select-none"
          >
            Is Employee
          </label>
        </div>
        <Button
          type="button"
          onClick={handleLookup}
          className="h-10 rounded-xl bg-[#0c1b33] px-6 text-white hover:bg-[#11274c] cursor-pointer flex items-center justify-center"
        >
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
      </div>
    </div>
  );
}

