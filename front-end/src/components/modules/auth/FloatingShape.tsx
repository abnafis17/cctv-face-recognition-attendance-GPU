"use client";

import React from "react";

export default function FloatingShape({
  type,
  size,
  x,
  y,
  delay,
  duration,
}: {
  type: "hexagon" | "diamond" | "circle" | "triangle";
  size: number;
  x: string;
  y: string;
  delay: number;
  duration: number;
}) {
  const shapes: Record<string, string> = {
    hexagon: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
    diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
    circle: "circle(50%)",
    triangle: "polygon(50% 0%, 100% 100%, 0% 100%)",
  };

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        clipPath: shapes[type],
        border: "1px solid rgba(99, 102, 241, 0.12)",
        background: "linear-gradient(135deg, rgba(99, 102, 241, 0.06), rgba(6, 182, 212, 0.04))",
        animation: `floatShape ${duration}s ease-in-out ${delay}s infinite`,
      }}
    />
  );
}
