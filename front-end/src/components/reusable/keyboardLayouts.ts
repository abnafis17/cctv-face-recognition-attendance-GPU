export const qwertyRows = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

export const symbolRows = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["-", "/", ":", ";", "(", ")", "$", "&", "@", '"'],
  [".", ",", "?", "!", "'", "_", "+", "=", "*", "%"],
  ["#", "<", ">", "[", "]", "{", "}"],
];

export const isTypeable = (
  el: HTMLElement | null
): el is HTMLInputElement | HTMLTextAreaElement => {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "file", "date", "time", "submit", "button"].includes(type);
  }
  return false;
};

export const getScrollParent = (node: HTMLElement | null): HTMLElement | null => {
  if (!node) return null;
  const style = window.getComputedStyle(node);
  const overflowY = style.overflowY;
  const isScrollable = overflowY === "auto" || overflowY === "scroll";
  const hasScrollClass =
    node.classList.contains("overflow-y-auto") ||
    node.classList.contains("overflow-y-scroll");
  if (isScrollable || hasScrollClass) return node;
  return getScrollParent(node.parentElement);
};

export const getFocusableInputs = (): HTMLElement[] => {
  if (typeof document === "undefined") return [];
  const selector = [
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([disabled]):not([readonly])',
    'textarea:not([disabled]):not([readonly])',
    'button[role="combobox"]:not([disabled])',
  ].join(", ");
  return Array.from(document.querySelectorAll(selector)) as HTMLElement[];
};

export const getFriendlyLabel = (el: HTMLElement): string => {
  if (el.tagName === "BUTTON") {
    const text = el.textContent?.trim() || "";
    if (text.includes("Select type")) return "Visitor Type";
    if (text.includes("Select purpose")) return "Purpose of Visit";
    if (text.includes("Select department")) return "Department";
    if (text.includes("Select ID type")) return "ID Proof Type";
    if (text.includes("Select host") || text.includes("Search name"))
      return "Host / Employee Name";
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
