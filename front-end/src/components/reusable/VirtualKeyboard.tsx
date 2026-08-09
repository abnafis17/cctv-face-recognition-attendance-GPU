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

const getFocusableInputs = (): HTMLElement[] => {
  if (typeof document === "undefined") return [];
  
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
  const [isEnabled, setIsEnabled] = useState(true);

  const keyboardRef = useRef<HTMLDivElement>(null);
  const previousInputRef = useRef<HTMLElement | null>(null);

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

  const scrollToInput = (inputEl: HTMLElement) => {
    setTimeout(() => {
      const scrollParent = getScrollParent(inputEl);
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        const inputRect = inputEl.getBoundingClientRect();
        const currentScrollTop = scrollParent.scrollTop;
        const targetTopOffset = 160;

        const offsetWithinParent = inputRect.top - parentRect.top;
        const targetScrollTop = currentScrollTop + offsetWithinParent - targetTopOffset;

        scrollParent.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth",
        });
      } else {
        const inputRect = inputEl.getBoundingClientRect();
        const targetTopOffset = 160;
        const targetScrollTop = window.scrollY + inputRect.top - targetTopOffset;

        window.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth",
        });
      }
    }, 50);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const checkEnabled = () => {
      const stored = localStorage.getItem("virtual-keyboard-enabled");
      setIsEnabled(stored !== "false");
    };
    checkEnabled();
    window.addEventListener("storage", checkEnabled);
    return () => window.removeEventListener("storage", checkEnabled);
  }, []);

  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      if (!isEnabled) {
        setIsOpen(false);
        return;
      }

      const target = e.target as HTMLElement;

      if (keyboardRef.current?.contains(target)) return;

      if (isTypeable(target) || target.getAttribute("role") === "combobox") {
        setActiveInput(target);
        setInputLabel(getFriendlyLabel(target));
        setIsOpen(true);
        scrollToInput(target);

        const focusables = getFocusableInputs();
        const index = focusables.indexOf(target);
        setIsLastInput(index !== -1 && index === focusables.length - 1);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        keyboardRef.current &&
        !keyboardRef.current.contains(target) &&
        !isTypeable(target) &&
        target.getAttribute("role") !== "combobox"
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("focusin", handleFocus);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("focusin", handleFocus);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isEnabled]);

  const handleKeyPress = (char: string) => {
    if (!activeInput || !isTypeable(activeInput)) return;

    const start = activeInput.selectionStart || 0;
    const end = activeInput.selectionEnd || 0;
    const value = activeInput.value;

    const insertChar = isShift ? char.toUpperCase() : char;
    const newValue = value.substring(0, start) + insertChar + value.substring(end);

    const nativeSetter =
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set ||
      Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;

    if (nativeSetter) {
      nativeSetter.call(activeInput, newValue);
    } else {
      activeInput.value = newValue;
    }

    activeInput.dispatchEvent(new Event("input", { bubbles: true }));

    const newPos = start + insertChar.length;
    activeInput.setSelectionRange(newPos, newPos);

    if (isShift) setIsShift(false);
  };

  const handleBackspace = () => {
    if (!activeInput || !isTypeable(activeInput)) return;

    const start = activeInput.selectionStart || 0;
    const end = activeInput.selectionEnd || 0;
    const value = activeInput.value;

    let newValue = "";
    let newPos = start;

    if (start !== end) {
      newValue = value.substring(0, start) + value.substring(end);
      newPos = start;
    } else if (start > 0) {
      newValue = value.substring(0, start - 1) + value.substring(start);
      newPos = start - 1;
    } else {
      return;
    }

    const nativeSetter =
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set ||
      Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;

    if (nativeSetter) {
      nativeSetter.call(activeInput, newValue);
    } else {
      activeInput.value = newValue;
    }

    activeInput.dispatchEvent(new Event("input", { bubbles: true }));
    activeInput.setSelectionRange(newPos, newPos);
  };

  const handleNext = () => {
    const focusables = getFocusableInputs();
    if (!focusables.length) return;

    if (!activeInput) {
      focusables[0].focus();
      return;
    }

    const currentIndex = focusables.indexOf(activeInput);
    if (currentIndex !== -1 && currentIndex < focusables.length - 1) {
      const nextInput = focusables[currentIndex + 1];
      nextInput.focus();
    } else {
      setIsOpen(false);
      activeInput.blur();
    }
  };

  if (!isOpen || !isEnabled) return null;

  const defaultKeys = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m"],
  ];

  const symbolKeys = [
    ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
    ["-", "_", "=", "+", "[", "]", "{", "}", "\\", "|"],
    [";", ":", "'", '"', ",", "<", ".", ">", "/", "?"],
    ["`", "~", "Bangladesh", "Dhaka", "Chattogram", "Gazipur"],
  ];

  const currentKeys = layout === "default" ? defaultKeys : symbolKeys;
  const keyboardActive = activeInput && isTypeable(activeInput);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-[9999] pointer-events-none pb-[env(safe-area-inset-bottom)]">
        <div
          ref={keyboardRef}
          className={cn(
            "pointer-events-auto mx-auto w-full max-w-4xl rounded-t-2xl border-t border-x border-zinc-200/80 bg-white/95 p-2 md:p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] backdrop-blur-xl transition-all duration-200 ease-out dark:border-zinc-800/80 dark:bg-zinc-900/95",
            className
          )}
        >
          {/* Header Controls Bar */}
          <div className="mb-2 flex items-center justify-between border-b border-zinc-100 pb-2 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
                <Keyboard className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Target Field
                </span>
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  {inputLabel || "Active Field"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                title="Hide Keyboard"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Key Rows */}
          <div className="flex flex-col gap-1.5 md:gap-2">
            {currentKeys.map((row, rowIndex) => (
              <div key={rowIndex} className="flex justify-center gap-1 md:gap-1.5">
                {rowIndex === 3 && (
                  <button
                    type="button"
                    disabled={!keyboardActive}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setIsShift(!isShift);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsShift(!isShift);
                    }}
                    className={cn(
                      "flex flex-1 items-center justify-center rounded-lg border text-xs font-bold transition-all duration-100 max-w-[65px] h-10 md:h-12",
                      !keyboardActive
                        ? "border-zinc-100 bg-zinc-50/50 text-zinc-300 cursor-not-allowed dark:border-zinc-900 dark:bg-zinc-950/40 dark:text-zinc-700"
                        : isShift
                        ? "border-violet-300 bg-violet-600 text-white shadow-sm dark:border-violet-500"
                        : "border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 active:scale-95 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
                      disabled={!keyboardActive}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        handleKeyPress(key);
                      }}
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

                {rowIndex === 3 && (
                  <button
                    type="button"
                    disabled={!keyboardActive}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      handleBackspace();
                    }}
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

            <div className="flex justify-center gap-1 md:gap-1.5">
              <button
                type="button"
                disabled={!keyboardActive}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setLayout(layout === "default" ? "symbols" : "default");
                }}
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

              <button
                type="button"
                disabled={!keyboardActive}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleKeyPress("@");
                }}
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
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleKeyPress(".com");
                }}
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

              <button
                type="button"
                disabled={!keyboardActive}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleKeyPress(" ");
                }}
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

              <button
                type="button"
                disabled={!keyboardActive}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleKeyPress(".");
                }}
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

              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleNext();
                }}
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
