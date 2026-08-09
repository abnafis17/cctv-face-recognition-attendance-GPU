"use client";

import { useEffect, useState } from "react";

export default function TypeWriter({ texts }: { texts: string[] }) {
  const [textIndex, setTextIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [display, setDisplay] = useState("");

  useEffect(() => {
    const currentText = texts[textIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (!isDeleting && charIndex <= currentText.length) {
      timeout = setTimeout(() => {
        setDisplay(currentText.slice(0, charIndex));
        setCharIndex((c) => c + 1);
      }, 60 + Math.random() * 40);
    } else if (!isDeleting && charIndex > currentText.length) {
      timeout = setTimeout(() => setIsDeleting(true), 2200);
    } else if (isDeleting && charIndex > 0) {
      timeout = setTimeout(() => {
        setCharIndex((c) => c - 1);
        setDisplay(currentText.slice(0, charIndex - 1));
      }, 30);
    } else {
      setIsDeleting(false);
      setTextIndex((i) => (i + 1) % texts.length);
    }

    return () => clearTimeout(timeout);
  }, [charIndex, isDeleting, textIndex, texts]);

  return (
    <span>
      {display}
      <span
        className="inline-block w-[2px] h-[1em] ml-0.5 align-text-bottom"
        style={{
          background: "linear-gradient(180deg, #7c3aed, #4f46e5)",
          animation: "blink 1s step-end infinite",
        }}
      />
    </span>
  );
}
