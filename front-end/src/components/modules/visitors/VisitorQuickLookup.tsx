"use client";

import React from "react";
import { Search, ArrowRightLeft } from "lucide-react";
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
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#0c1b33]">
        <ArrowRightLeft className="h-4 w-4 text-cyan-600" />
        QUICK LOOKUP — RETURNING VISITOR
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Input
            placeholder={isLookupEmployee ? "Enter employee ID number..." : "Enter phone number..."}
            value={lookupPhone}
            onChange={(e) => setLookupPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLookup(); } }}
            className="text-xs h-10 pl-3 pr-10"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isLookupEmployee}
              onChange={(e) => setIsLookupEmployee(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-[#0c1b33] focus:ring-[#0c1b33]"
            />
            <span>Is Employee</span>
          </label>

          <Button
            type="button"
            onClick={handleLookup}
            className="h-10 px-5 bg-[#0c1b33] text-white hover:bg-[#11274c] rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            <Search className="h-4 w-4" />
            Search
          </Button>
        </div>
      </div>
    </div>
  );
}
