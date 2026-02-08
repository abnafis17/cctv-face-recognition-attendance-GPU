"use client";

import React from "react";
import { CameraRow } from "./types";
import { isVirtualLaptopCamera } from "./utils";

type Props = {
  cameras: CameraRow[];
};

const CameraListStats: React.FC<Props> = ({ cameras }) => {
  const total = cameras.length;
  const active = cameras.filter((camera) => camera.isActive).length;
  const virtual = cameras.filter((camera) => isVirtualLaptopCamera(camera)).length;
  const relay = cameras.filter((camera) => Boolean(camera.relayAgentId)).length;

  const cards = [
    { label: "Total Cameras", value: total, tone: "text-zinc-900" },
    { label: "Active Now", value: active, tone: "text-emerald-700" },
    { label: "Virtual/Laptop", value: virtual, tone: "text-amber-700" },
    { label: "Relay Linked", value: relay, tone: "text-sky-700" },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border bg-white px-4 py-3 shadow-sm"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {card.label}
          </div>
          <div className={`mt-1 text-2xl font-bold ${card.tone}`}>{card.value}</div>
        </div>
      ))}
    </div>
  );
};

export default CameraListStats;
