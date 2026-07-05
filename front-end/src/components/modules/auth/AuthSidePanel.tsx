"use client";

import React from "react";
import AuroraCanvas from "./AuroraCanvas";
import FloatingShape from "./FloatingShape";
import TypeWriter from "./TypeWriter";
import AnimatedCounter from "./AnimatedCounter";
import PulsingLogo from "./PulsingLogo";

export default function AuthSidePanel() {
  return (
    <div className="hidden lg:flex lg:col-span-6 h-screen relative flex-col justify-between p-10 overflow-hidden border-r border-zinc-100 bg-white">
      <AuroraCanvas />

      {/* Morphing blobs */}
      <div
        className="morph-blob absolute"
        style={{
          width: 350,
          height: 350,
          left: "10%",
          top: "15%",
          background: "radial-gradient(circle, rgba(124, 58, 237, 0.15), transparent 70%)",
        }}
      />
      <div
        className="morph-blob absolute"
        style={{
          width: 280,
          height: 280,
          right: "5%",
          bottom: "20%",
          background: "radial-gradient(circle, rgba(6, 182, 212, 0.12), transparent 70%)",
          animationDelay: "-4s",
        }}
      />

      {/* Floating shapes */}
      <FloatingShape type="hexagon" size={80} x="15%" y="20%" delay={0} duration={8} />
      <FloatingShape type="diamond" size={50} x="75%" y="15%" delay={1.5} duration={10} />
      <FloatingShape type="circle" size={35} x="60%" y="70%" delay={0.5} duration={7} />
      <FloatingShape type="triangle" size={60} x="25%" y="75%" delay={2} duration={9} />
      <FloatingShape type="hexagon" size={40} x="85%" y="50%" delay={1} duration={11} />
      <FloatingShape type="diamond" size={30} x="45%" y="35%" delay={3} duration={8.5} />

      {/* Content Logo */}
      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <PulsingLogo size={44} />
          <div>
            <h1 className="text-lg font-black tracking-tight text-zinc-900 leading-none">
              CRIPTON VISION
            </h1>
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-violet-600 mt-1">
              Vision AI Platform
            </p>
          </div>
        </div>
      </div>

      {/* Headline */}
      <div className="relative z-10 -mt-8">
        <h2 className="text-4xl xl:text-5xl font-black leading-[1.1] tracking-tight mb-4 text-zinc-900">
          AI Surveillance &
          <br />
          Attendance,
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, #7c3aed, #4f46e5, #06b6d4)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            <TypeWriter
              texts={[
                "CCTV Tracking.",
                "Gatepass Automation.",
                "Face Recognition.",
                "Instant Alerts.",
              ]}
            />
          </span>
        </h2>
        <p className="text-sm leading-relaxed max-w-sm text-zinc-500">
          An enterprise computer vision platform that automates attendance tracking, smart gatepass
          approvals, and premises security using existing CCTV networks.
        </p>
      </div>

      {/* Stats */}
      <div className="relative z-10">
        <div className="flex gap-8">
          <AnimatedCounter end={99.8} suffix="%" label="Face Match" delay={600} />
          <AnimatedCounter end={150} suffix="ms" label="Recognition" delay={900} />
          <AnimatedCounter end={100} suffix="%" label="Gatepass Auto" delay={1200} />
        </div>
      </div>

      {/* Edge fades */}
      <div
        className="absolute inset-0 pointer-events-none z-[5]"
        style={{
          background: `linear-gradient(to right, transparent 85%, #f0f2f8 100%), linear-gradient(to bottom, transparent 90%, #f0f2f8 100%), linear-gradient(to top, transparent 92%, #f0f2f8 100%)`,
        }}
      />
    </div>
  );
}
