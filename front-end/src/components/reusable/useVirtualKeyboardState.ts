import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  isTypeable,
  getScrollParent,
  getFocusableInputs,
  getFriendlyLabel,
} from "./keyboardLayouts";

export function useVirtualKeyboardState() {
  const [isOpen, setIsOpen] = useState(false);
  const [isShift, setIsShift] = useState(false);
  const [layout, setLayout] = useState<"default" | "symbols">("default");
  const [activeInput, setActiveInput] = useState<HTMLElement | null>(null);
  const [inputLabel, setInputLabel] = useState<string>("");
  const [isLastInput, setIsLastInput] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);

  const keyboardRef = useRef<HTMLDivElement>(null);
  const previousInputRef = useRef<HTMLElement | null>(null);

  const scrollToInput = useCallback((inputEl: HTMLElement) => {
    const scrollParent = getScrollParent(inputEl) || document.documentElement || document.body;
    const performScroll = () => {
      const rect = inputEl.getBoundingClientRect();
      const offset = rect.top - 160;
      if (Math.abs(offset) < 2) return;
      if (scrollParent === document.documentElement || scrollParent === document.body) {
        window.scrollTo({ top: window.scrollY + offset, behavior: "smooth" });
      } else {
        scrollParent.scrollTo({ top: scrollParent.scrollTop + offset, behavior: "smooth" });
      }
    };
    performScroll();
    setTimeout(performScroll, 50);
    setTimeout(performScroll, 150);
  }, []);

  const checkKeyboardSetting = useCallback(() => {
    if (typeof window !== "undefined") {
      const setting = localStorage.getItem("virtual-keyboard-enabled") !== "false";
      setIsEnabled(setting);
      if (!setting) setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    checkKeyboardSetting();
    window.addEventListener("virtualKeyboardSettingsChanged", checkKeyboardSetting);
    return () => {
      window.removeEventListener("virtualKeyboardSettingsChanged", checkKeyboardSetting);
    };
  }, [checkKeyboardSetting]);

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
      if (!isEnabled) return;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT";
      const isTextarea = target.tagName === "TEXTAREA";
      const isDropdown = target.tagName === "BUTTON" && target.getAttribute("role") === "combobox";

      if (isInput || isTextarea || isDropdown) {
        setActiveInput(target);
        setInputLabel(getFriendlyLabel(target));
        if (isTypeable(target)) {
          setIsOpen(true);
          scrollToInput(target);
        } else {
          setIsOpen(false);
        }
      }
    };

    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, [isEnabled, scrollToInput]);

  const handleKeyPress = useCallback(
    (key: string) => {
      if (!activeInput || !isTypeable(activeInput)) return;
      const start = activeInput.selectionStart ?? 0;
      const end = activeInput.selectionEnd ?? 0;
      const value = activeInput.value;
      const textToInsert = isShift ? key.toUpperCase() : key.toLowerCase();
      const newValue = value.substring(0, start) + textToInsert + value.substring(end);

      const prototype = Object.getPrototypeOf(activeInput);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      if (descriptor && descriptor.set) {
        descriptor.set.call(activeInput, newValue);
      } else {
        activeInput.value = newValue;
      }

      activeInput.dispatchEvent(new Event("input", { bubbles: true }));
      activeInput.focus();
      const newCursorPos = start + textToInsert.length;
      setTimeout(() => activeInput.setSelectionRange(newCursorPos, newCursorPos), 0);
    },
    [activeInput, isShift]
  );

  const handleBackspace = useCallback(() => {
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
    setTimeout(() => activeInput.setSelectionRange(newCursorPos, newCursorPos), 0);
  }, [activeInput]);

  const handleClear = useCallback(() => {
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
  }, [activeInput]);

  const handleNext = useCallback(() => {
    if (!activeInput) return;
    const focusable = getFocusableInputs();
    const index = focusable.indexOf(activeInput);
    if (index !== -1 && index < focusable.length - 1) {
      const nextInput = focusable[index + 1];
      nextInput.focus();
      if (isTypeable(nextInput)) scrollToInput(nextInput);
    } else {
      activeInput.blur();
      setIsOpen(false);
    }
  }, [activeInput, scrollToInput]);

  return {
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
  };
}
