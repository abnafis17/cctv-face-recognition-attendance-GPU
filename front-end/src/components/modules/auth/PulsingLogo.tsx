"use client";

import { Video } from "lucide-react";

export default function PulsingLogo({ size = 44 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-md"
        style={{
          background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
          animation: "pulseRing 2.5s ease-in-out infinite",
          opacity: 0.2,
        }}
      />
      <div
        className="absolute inset-0 rounded-md"
        style={{
          background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
          animation: "pulseRing 2.5s ease-in-out 0.5s infinite",
          opacity: 0.1,
        }}
      />
      <div
        className="relative w-full h-full rounded-md flex items-center justify-center overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #7c3aed, #4338ca)",
          boxShadow:
            "0 8px 24px rgba(124, 58, 237, 0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
        }}
      >
        <Video className="text-white h-5.5 w-5.5" strokeWidth={2.2} />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%, rgba(255,255,255,0.05) 100%)",
          }}
        />
      </div>
    </div>
  );
}
