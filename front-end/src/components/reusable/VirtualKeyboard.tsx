"use client";

import React, { useState, useEffect, useRef } from "react";
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

// Check if an element is a typable input (text, email, tel, etc.) or textarea
const isTypeable = (el: HTMLElement | null): el is HTMLInputElement | HTMLTextAreaElement => {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "file", "date", "time", "submit", "button"].includes(type);
  }
  return false;
};

// Helper to find the scrollable parent container of an element
const getScrollParent = (node: HTMLElement | null): HTMLElement | null => {
  if (!node) return null;

  const style = window.getComputedStyle(node);
  const overflowY = style.overflowY;
  const isScrollable = overflowY === "auto" || overflowY === "scroll";

  const hasScrollClass =
    node.classList.contains("overflow-y-auto") ||
    node.classList.contains("overflow-y-scroll");

  if (isScrollable || hasScrollClass) {
    return node;
  }

  return getScrollParent(node.parentElement);
};

// Helper to find all focusable form controls in layout sequence
const getFocusableInputs = (): HTMLElement[] => {
  if (typeof document === "undefined") return [];
  
  // Queries text inputs, textareas, date/time pickers, and custom dropdown buttons (role="combobox")
  const selector = [
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([disabled]):not([readonly])',
    'textarea:not([disabled]):not([readonly])',
    'button[role="combobox"]:not([disabled])'
  ].join(', ');
  
  return Array.from(document.querySelectorAll(selector)) as HTMLElement[];
};

interface VirtualKeyboardProps {
  className?: string;
}

export function VirtualKeyboard({ className }: VirtualKeyboardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isShift, setIsShift] = useState(false);
  const [layout, setLayout] = useState<"default" | "symbols">("default");
  const [activeInput, setActiveInput] = useState<HTMLElement | null>(null);
  const [inputLabel, setInputLabel] = useState<string>("");
  const [isLastInput, setIsLastInput] = useState(false);

  const keyboardRef = useRef<HTMLDivElement>(null);

  // Helper to extract a reader-friendly label from any focusable element
  const getFriendlyLabel = (el: HTMLElement) => {
    if (el.tagName === "BUTTON") {
      const text = el.textContent?.trim() || "";
      if (text.includes("Select type")) return "Visitor Type";
      if (text.includes("Select purpose")) return "Purpose of Visit";
      if (text.includes("Select department")) return "Department";
      if (text.includes("Select ID type")) return "ID Proof Type";
      if (text.includes("Select host") || text.includes("Search name")) return "Host / Employee Name";
      if (text.includes("None")) return "Extra Guest";
      return text || "Dropdown Menu";
    }

    const inputEl = el as HTMLInputElement;
    if (inputEl.placeholder) return inputEl.placeholder;
    const name = inputEl.getAttribute("name") || inputEl.id;
    if (!name) return "Input Field";
    return name
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  // Positions the active field precisely 160px from the top of the viewport
  const scrollToInput = (inputEl: HTMLElement) => {
    const scrollParent = getScrollParent(inputEl) || document.documentElement || document.body;

    const performScroll = () => {
      const rect = inputEl.getBoundingClientRect();
      const targetTop = 160; // Safe distance from top of viewport
      const offset = rect.top - targetTop;

      if (Math.abs(offset) < 2) return; // Already aligned

      console.log("VirtualKeyboard scroll debug:", {
        input: inputEl.tagName + "#" + (inputEl.id || inputEl.getAttribute("name")),
        scrollParent: scrollParent.tagName + (scrollParent.className ? "." + scrollParent.className.split(" ")[0] : ""),
        rectTop: rect.top,
        offset: offset
      });

      if (scrollParent === document.documentElement || scrollParent === document.body) {
        window.scrollTo({
          top: window.scrollY + offset,
          behavior: "smooth"
        });
      } else {
        scrollParent.scrollTo({
          top: scrollParent.scrollTop + offset,
          behavior: "smooth"
        });
      }
    };

    // Run scrolling in stages to capture focus transitions and height spacer updates
    performScroll();
    setTimeout(performScroll, 50);
    setTimeout(performScroll, 150);
    setTimeout(performScroll, 300);
    setTimeout(performScroll, 500);
  };

  // Determine if the current active field is the last input field on the page
  useEffect(() => {
    if (!activeInput) {
      setIsLastInput(false);
      return;
    }
    const focusable = getFocusableInputs();
    const index = focusable.indexOf(activeInput);
    setIsLastInput(index !== -1 && index === focusable.length - 1);
  }, [activeInput]);

  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      
      const isInput = target.tagName === "INPUT";
      const isTextarea = target.tagName === "TEXTAREA";
      const isDropdown = target.tagName === "BUTTON" && target.getAttribute("role") === "combobox";

      if (isInput || isTextarea || isDropdown) {
        setActiveInput(target);
        setInputLabel(getFriendlyLabel(target));
        setIsOpen(true);

        // Smoothly scroll the focused field into viewport alignment
        scrollToInput(target);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      setTimeout(() => {
        const nextActive = document.activeElement;
        if (
          keyboardRef.current &&
          (keyboardRef.current.contains(nextActive) || nextActive === activeInput)
        ) {
          return;
        }
      }, 50);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, [activeInput]);

  // Insert key text at the cursor position and trigger React input changes
  const handleKeyPress = (key: string) => {
    if (!activeInput || !isTypeable(activeInput)) return;

    const start = activeInput.selectionStart ?? 0;
    const end = activeInput.selectionEnd ?? 0;
    const value = activeInput.value;
    const textToInsert = isShift ? key.toUpperCase() : key.toLowerCase();
    const newValue = value.substring(0, start) + textToInsert + value.substring(end);

    // Update value using the native setter so React and react-hook-form intercept the value change
    const prototype = Object.getPrototypeOf(activeInput);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(activeInput, newValue);
    } else {
      activeInput.value = newValue;
    }

    // Dispatch the input event so standard React onChange handlers run
    activeInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Reset shift if we just typed a letter
    if (isShift) {
      setIsShift(false);
    }

    // Refocus the input and maintain the cursor position
    activeInput.focus();
    const newCursorPos = start + textToInsert.length;
    setTimeout(() => {
      activeInput.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleBackspace = () => {
    if (!activeInput || !isTypeable(activeInput)) return;

    const start = activeInput.selectionStart ?? 0;
    const end = activeInput.selectionEnd ?? 0;
    const value = activeInput.value;

    let newValue = value;
    let newCursorPos = start;

    if (start !== end) {
      newValue = value.substring(0, start) + value.substring(end);
      newCursorPos = start;
    } else if (start > 0) {
      newValue = value.substring(0, start - 1) + value.substring(start);
      newCursorPos = start - 1;
    } else {
      return;
    }

    const prototype = Object.getPrototypeOf(activeInput);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(activeInput, newValue);
    } else {
      activeInput.value = newValue;
    }

    activeInput.dispatchEvent(new Event("input", { bubbles: true }));

    activeInput.focus();
    setTimeout(() => {
      activeInput.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleClear = () => {
    if (!activeInput || !isTypeable(activeInput)) return;

    const prototype = Object.getPrototypeOf(activeInput);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(activeInput, "");
    } else {
      activeInput.value = "";
    }

    activeInput.dispatchEvent(new Event("input", { bubbles: true }));
    activeInput.focus();
  };

  // Focus the next available form control
  const handleNext = () => {
    if (!activeInput) return;

    const focusable = getFocusableInputs();
    const index = focusable.indexOf(activeInput);

    if (index !== -1 && index < focusable.length - 1) {
      const nextInput = focusable[index + 1];
      nextInput.focus();
      
      // Force scroll alignment on next transition
      scrollToInput(nextInput);
    } else {
      // Last field focused, blur and collapse keyboard
      activeInput.blur();
      setIsOpen(false);
    }
  };

  // Keyboard Rows definition
  const qwertyRows = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m"],
  ];

  const symbolRows = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["-", "/", ":", ";", "(", ")", "$", "&", "@", '"'],
    [".", ",", "?", "!", "'", "_", "+", "=", "*", "%"],
    ["#", "<", ">", "[", "]", "{", "}"],
  ];

  const currentRows = layout === "default" ? qwertyRows : symbolRows;

  // Check if keyboard is in a typable state
  const keyboardActive = isTypeable(activeInput);

  return (
    <>
      {/* Spacer to push page content up so bottom inputs can scroll above the keyboard */}
      <div
        className={cn(
          "transition-all duration-300 ease-out w-full",
          isOpen ? "h-[280px] md:h-[340px]" : "h-0"
        )}
      />

      {/* Floating Keyboard activation button if collapsed but an input is active */}
      {!isOpen && activeInput && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setTimeout(() => {
              activeInput.focus();
            }, 50);
          }}
          className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#0c1b33] text-white shadow-xl hover:bg-[#152e57] active:scale-95 transition-all duration-200"
          title="Open On-Screen Keyboard"
        >
          <Keyboard className="h-6 w-6" />
        </button>
      )}

      {/* Main Keyboard Panel */}
      <div
        ref={keyboardRef}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 transform border-t border-zinc-200/50 bg-white/95 px-4 pb-6 pt-3 shadow-2xl backdrop-blur-md transition-all duration-300 ease-out select-none dark:border-zinc-800/50 dark:bg-zinc-950/95 md:px-8",
          isOpen ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
        )}
      >
        <div className="mx-auto max-w-4xl">
          {/* Top Panel / Header Info */}
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
                  onMouseDown={(e) => {
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
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsOpen(false);
                }}
                className="flex items-center gap-1 rounded-lg bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 active:scale-95 transition-all"
              >
                <ChevronDown className="h-4 w-4" />
                Collapse
              </button>
            </div>
          </div>

          {/* Keyboard Grid */}
          <div className={cn("flex flex-col gap-1.5 transition-opacity duration-200", !keyboardActive && "opacity-60")}>
            {currentRows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex justify-center gap-1 md:gap-1.5">
                {/* Shift Key on Left of Row 3 */}
                {rowIndex === 3 && (
                  <button
                    type="button"
                    disabled={!keyboardActive}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsShift(!isShift);
                    }}
                    className={cn(
                      "flex flex-1 items-center justify-center rounded-lg border text-sm font-semibold transition-all duration-100 active:scale-95 max-w-[65px] h-10 md:h-12",
                      !keyboardActive ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400" :
                      isShift
                        ? "bg-[#0c1b33] border-[#0c1b33] text-white"
                        : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200/50 dark:border-zinc-700/50 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    )}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}

                {/* Normal Keys */}
                {row.map((key) => {
                  const displayKey = isShift ? key.toUpperCase() : key;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!keyboardActive}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleKeyPress(key);
                      }}
                      className={cn(
                        "flex flex-1 items-center justify-center rounded-lg border text-sm font-semibold shadow-sm transition-all duration-100 max-w-[55px] h-10 md:h-12",
                        !keyboardActive 
                          ? "border-zinc-100 bg-zinc-50/50 text-zinc-300 cursor-not-allowed dark:border-zinc-900 dark:bg-zinc-950/40 dark:text-zinc-700"
                          : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 active:scale-95 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      )}
                    >
                      {displayKey}
                    </button>
                  );
                })}

                {/* Backspace Key on Right of Row 3 */}
                {rowIndex === 3 && (
                  <button
                    type="button"
                    disabled={!keyboardActive}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleBackspace();
                    }}
                    className={cn(
                      "flex flex-1 items-center justify-center rounded-lg border text-sm font-semibold transition-all duration-100 max-w-[65px] h-10 md:h-12",
                      !keyboardActive
                        ? "border-zinc-100 bg-zinc-50/50 text-zinc-300 cursor-not-allowed dark:border-zinc-900 dark:bg-zinc-950/40 dark:text-zinc-700"
                        : "border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 active:scale-95 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    )}
                  >
                    <Delete className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

            {/* Bottom Row Controls */}
            <div className="flex justify-center gap-1 md:gap-1.5">
              {/* Layout Switcher key */}
              <button
                type="button"
                disabled={!keyboardActive}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setLayout(layout === "default" ? "symbols" : "default");
                }}
                className={cn(
                  "flex items-center justify-center rounded-lg border text-xs font-bold w-16 h-10 md:h-12",
                  !keyboardActive
                    ? "border-zinc-100 bg-zinc-50/50 text-zinc-300 cursor-not-allowed dark:border-zinc-900 dark:bg-zinc-950/40 dark:text-zinc-700"
                    : "border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 active:scale-95 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                )}
              >
                {layout === "default" ? "?123" : "ABC"}
              </button>

              {/* Special domain helper keys */}
              <button
                type="button"
                disabled={!keyboardActive}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleKeyPress("@");
                }}
                className={cn(
                  "flex items-center justify-center rounded-lg border text-xs font-bold w-10 h-10 md:h-12",
                  !keyboardActive
                    ? "border-zinc-100 bg-zinc-50/50 text-zinc-300 cursor-not-allowed dark:border-zinc-900 dark:bg-zinc-950/40 dark:text-zinc-700"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 active:scale-95 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                )}
              >
                @
              </button>
              <button
                type="button"
                disabled={!keyboardActive}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleKeyPress(".com");
                }}
                className={cn(
                  "flex items-center justify-center rounded-lg border text-xs font-bold w-14 h-10 md:h-12",
                  !keyboardActive
                    ? "border-zinc-100 bg-zinc-50/50 text-zinc-300 cursor-not-allowed dark:border-zinc-900 dark:bg-zinc-950/40 dark:text-zinc-700"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 active:scale-95 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                )}
              >
                .com
              </button>

              {/* Spacebar key */}
              <button
                type="button"
                disabled={!keyboardActive}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleKeyPress(" ");
                }}
                className={cn(
                  "flex flex-1 items-center justify-center rounded-lg border text-xs font-bold h-10 md:h-12",
                  !keyboardActive
                    ? "border-zinc-100 bg-zinc-50/50 text-zinc-300 cursor-not-allowed dark:border-zinc-900 dark:bg-zinc-950/40 dark:text-zinc-700"
                    : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 active:scale-95 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                )}
              >
                Space
              </button>

              {/* Dot key */}
              <button
                type="button"
                disabled={!keyboardActive}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleKeyPress(".");
                }}
                className={cn(
                  "flex items-center justify-center rounded-lg border text-sm font-bold w-10 h-10 md:h-12",
                  !keyboardActive
                    ? "border-zinc-100 bg-zinc-50/50 text-zinc-300 cursor-not-allowed dark:border-zinc-900 dark:bg-zinc-950/40 dark:text-zinc-700"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 active:scale-95 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                )}
              >
                .
              </button>

              {/* Next / Done key */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleNext();
                }}
                className="flex items-center justify-center gap-1 rounded-lg border border-transparent bg-[#0c1b33] px-4 text-xs font-bold text-white hover:bg-[#152e57] active:scale-95 w-20 md:w-24 h-10 md:h-12 cursor-pointer"
              >
                <span>{isLastInput ? "Done" : "Next"}</span>
                {isLastInput ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
