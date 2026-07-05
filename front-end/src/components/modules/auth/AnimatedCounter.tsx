"use client";

import { useEffect, useState } from "react";

export default function AnimatedCounter({
  end,
  suffix,
  label,
  delay,
}: {
  end: number;
  suffix: string;
  label: string;
  delay: number;
}) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    const step = end / 40;
    const interval = setInterval(() => {
      setCount((c) => {
        if (c + step >= end) {
          clearInterval(interval);
          return end;
        }
        return c + step;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [started, end]);

  return (
    <div
      className="text-center"
      style={{ animation: `fadeInUp 0.6s ease-out ${delay}ms both` }}
    >
      <div
        className="text-2xl font-black"
        style={{
          background: "linear-gradient(135deg, #6d28d9, #4f46e5)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {Math.round(count).toLocaleString()}
        {suffix}
      </div>
      <div className="text-[10px] uppercase tracking-widest font-bold mt-0.5 text-zinc-400">
        {label}
      </div>
    </div>
  );
}
