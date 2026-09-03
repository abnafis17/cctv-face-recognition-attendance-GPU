"use client";

import React from "react";
import {
  Keyboard,
  Delete,
  ArrowUp,
  ChevronDown,
  X,
  ArrowRight,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { qwertyRows, symbolRows, isTypeable } from "./keyboardLayouts";
import { useVirtualKeyboardState } from "./useVirtualKeyboardState";

interface VirtualKeyboardProps {
  className?: string;
}

export function VirtualKeyboard({ className }: VirtualKeyboardProps) {
  const {
    isOpen,
    setIsOpen,
    isShift,
    setIsShift,
    layout,
    setLayout,
    activeInput,
    inputLabel,
    isLastInput,
    isEnabled,
    keyboardRef,
    handleKeyPress,
    handleBackspace,
    handleClear,
    handleNext,
  } = useVirtualKeyboardState();

  const currentRows = layout === "default" ? qwertyRows : symbolRows;
  const keyboardActive = isTypeable(activeInput);

  if (!isEnabled) return null;

  return (
    <>
      <div
        className={cn(
          "transition-all duration-300 ease-out w-full",
          isOpen ? "h-[280px] md:h-[340px]" : "h-0"
        )}
      />

      {!isOpen && activeInput && isTypeable(activeInput) && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setTimeout(() => activeInput.focus(), 50);
          }}
          className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#0c1b33] text-white shadow-xl hover:bg-[#152e57] active:scale-95 transition-all duration-200"
          title="Open On-Screen Keyboard"
        >
          <Keyboard className="h-6 w-6" />
        </button>
      )}

      <div
        ref={keyboardRef}
        data-virtual-keyboard="true"
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 transform border-t border-zinc-200/50 bg-white/95 px-4 pb-6 pt-3 shadow-2xl backdrop-blur-md transition-all duration-300 ease-out select-none dark:border-zinc-800/50 dark:bg-zinc-950/95 md:px-8",
          isOpen ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none",
          className
        )}
      >
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-2 flex items-center justify-between border-b border-zinc-100 pb-2 dark:border-zinc-800/40">
            <div className="flex items-center gap-2">
              <div className="flex h-5 items-center rounded-md bg-[#0c1b33]/10 px-2 text-[10px] font-bold uppercase tracking-wider text-[#0c1b33] dark:bg-zinc-800 dark:text-zinc-300">
                Active Field
              </div>
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                {inputLabel || "Select a field to type"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {keyboardActive && activeInput && (activeInput as HTMLInputElement).value?.length > 0 && (
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleClear();
                  }}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 active:scale-95 transition-all"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear Field
                </button>
              )}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  setIsOpen(false);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 transition-colors"
                title="Hide Keyboard"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Keys Rows */}
          <div className="flex flex-col gap-1.5 md:gap-2">
            {currentRows.map((row, rowIdx) => (
              <div key={rowIdx} className="flex justify-center gap-1 md:gap-1.5">
                {rowIdx === 3 && (
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setIsShift(!isShift);
                    }}
                    className={cn(
                      "flex h-10 min-w-[48px] md:h-12 md:min-w-[64px] items-center justify-center rounded-lg border text-sm font-semibold shadow-xs transition-all active:scale-95",
                      isShift
                        ? "bg-[#0c1b33] text-white border-[#0c1b33]"
                        : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
                    )}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}

                {row.map((key) => {
                  const displayKey = isShift ? key.toUpperCase() : key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        handleKeyPress(key);
                      }}
                      className="flex h-10 flex-1 max-w-[48px] md:h-12 md:max-w-[64px] items-center justify-center rounded-lg border border-zinc-200/80 bg-white text-base font-semibold text-zinc-800 shadow-2xs hover:bg-zinc-50 active:bg-zinc-100 active:scale-95 transition-all dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      {displayKey}
                    </button>
                  );
                })}

                {rowIdx === 3 && (
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      handleBackspace();
                    }}
                    className="flex h-10 min-w-[48px] md:h-12 md:min-w-[64px] items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-zinc-700 shadow-2xs hover:bg-zinc-200 active:scale-95 transition-all dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                  >
                    <Delete className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

            {/* Bottom Special Controls */}
            <div className="flex justify-center gap-1.5 mt-1">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  setLayout(layout === "default" ? "symbols" : "default");
                }}
                className="flex h-10 px-3 md:h-12 md:px-4 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-xs font-bold text-zinc-700 shadow-2xs hover:bg-zinc-200 active:scale-95 transition-all dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
              >
                {layout === "default" ? "?123" : "ABC"}
              </button>

              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleKeyPress(" ");
                }}
                className="flex h-10 flex-1 max-w-[360px] md:h-12 items-center justify-center rounded-lg border border-zinc-200 bg-white text-xs font-semibold text-zinc-500 shadow-2xs hover:bg-zinc-50 active:scale-95 transition-all dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
              >
                Space
              </button>

              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleNext();
                }}
                className={cn(
                  "flex h-10 px-4 md:h-12 md:px-6 items-center justify-center gap-1.5 rounded-lg border text-xs font-bold shadow-2xs transition-all active:scale-95",
                  isLastInput
                    ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                    : "bg-[#0c1b33] text-white border-[#0c1b33] hover:bg-[#152e57]"
                )}
              >
                {isLastInput ? (
                  <>
                    <span>Done</span>
                    <Check className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    <span>Next</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
