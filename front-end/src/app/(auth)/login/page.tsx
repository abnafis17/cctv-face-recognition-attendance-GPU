"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye, EyeOff, Lock, Mail, Video, Shield, ArrowRight,
  Fingerprint, Zap, Users, Target, Check
} from "lucide-react";
import toast from "react-hot-toast";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginApi } from "@/services/auth";
import { getAccessToken } from "@/lib/authStorage";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

function safeNextUrl(next: string | null, fallback: string) {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.startsWith("/login") || next.startsWith("/register"))
    return fallback;
  return next;
}

/* ─────────── Aurora Canvas Background ─────────── */
function AuroraCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      time += 0.003;

      ctx.clearRect(0, 0, w, h);

      // Base fill
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, w, h);

      // Aurora ribbons (violet/indigo theme, hues 250-280)
      for (let ribbon = 0; ribbon < 5; ribbon++) {
        ctx.beginPath();
        const baseY = h * (0.2 + ribbon * 0.15);
        const amplitude = 40 + ribbon * 20;
        const speed = time * (0.8 + ribbon * 0.2);

        ctx.moveTo(0, baseY);
        for (let x = 0; x <= w; x += 3) {
          const y =
            baseY +
            Math.sin(x * 0.004 + speed) * amplitude +
            Math.sin(x * 0.007 + speed * 1.3) * (amplitude * 0.5) +
            Math.cos(x * 0.002 + speed * 0.7) * (amplitude * 0.3);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();

        const hue = 250 + ribbon * 8; // Violet to Indigo
        const gradient = ctx.createLinearGradient(0, baseY - amplitude, 0, h);
        gradient.addColorStop(0, `hsla(${hue}, 70%, 70%, 0)`);
        gradient.addColorStop(0.1, `hsla(${hue}, 70%, 65%, ${0.12 - ribbon * 0.015})`);
        gradient.addColorStop(0.3, `hsla(${hue}, 75%, 55%, ${0.08 - ribbon * 0.01})`);
        gradient.addColorStop(1, `hsla(${hue}, 70%, 50%, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Bright core streaks
      for (let s = 0; s < 3; s++) {
        ctx.beginPath();
        const baseY = h * (0.3 + s * 0.18);
        const speed = time * (1.2 + s * 0.3);

        for (let x = 0; x <= w; x += 2) {
          const y =
            baseY +
            Math.sin(x * 0.005 + speed) * 30 +
            Math.cos(x * 0.008 + speed * 1.5) * 15;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        const streakHue = 260 + s * 10;
        const streakAlpha = 0.2 - s * 0.04;
        ctx.strokeStyle = `hsla(${streakHue}, 100%, 60%, ${streakAlpha})`;
        ctx.lineWidth = 2 - s * 0.5;
        ctx.shadowBlur = 20;
        ctx.shadowColor = `hsla(${streakHue}, 100%, 70%, 0.15)`;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Floating light dust particles (aurora embers)
      const numParticles = 25;
      for (let i = 0; i < numParticles; i++) {
        const px = ((i * 197.3 + time * 15) % w);
        const py = (h * 0.9 - ((i * 37.7 + time * 30) % (h * 0.8)));
        const opacity = Math.sin((py / h) * Math.PI) * 0.15 * (0.6 + 0.4 * Math.sin(time * 2 + i));
        const r = 1 + (i % 2.5);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(99, 102, 241, ${opacity})`; // Indigo-500 tint
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: "block" }}
    />
  );
}

/* ─────────── Floating Geometric Shape ─────────── */
function FloatingShape({ type, size, x, y, delay, duration }: {
  type: "hexagon" | "diamond" | "circle" | "triangle";
  size: number; x: string; y: string; delay: number; duration: number;
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
        backdropFilter: "blur(2px)",
      }}
    />
  );
}

/* ─────────── Animated Typing Text ─────────── */
function TypeWriter({ texts }: { texts: string[] }) {
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

/* ─────────── Animated Stat Counter ─────────── */
function AnimatedCounter({ end, suffix, label, delay }: {
  end: number; suffix: string; label: string; delay: number;
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
        if (c + step >= end) { clearInterval(interval); return end; }
        return c + step;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [started, end]);

  return (
    <div className="text-center" style={{ animation: `fadeInUp 0.6s ease-out ${delay}ms both` }}>
      <div
        className="text-2xl font-black"
        style={{
          background: "linear-gradient(135deg, #6d28d9, #4f46e5)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {Math.round(count).toLocaleString()}{suffix}
      </div>
      <div className="text-[10px] uppercase tracking-widest font-bold mt-0.5 text-zinc-400">
        {label}
      </div>
    </div>
  );
}

/* ─────────── Pulsing Ring Logo ─────────── */
function PulsingLogo({ size = 44 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-md"
        style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", animation: "pulseRing 2.5s ease-in-out infinite", opacity: 0.2 }}
      />
      <div
        className="absolute inset-0 rounded-md"
        style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", animation: "pulseRing 2.5s ease-in-out 0.5s infinite", opacity: 0.1 }}
      />
      <div
        className="relative w-full h-full rounded-md flex items-center justify-center overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #7c3aed, #4338ca)",
          boxShadow: "0 8px 24px rgba(124, 58, 237, 0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
        }}
      >
        <Video className="text-white h-5.5 w-5.5" strokeWidth={2.2} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%, rgba(255,255,255,0.05) 100%)" }} />
      </div>
    </div>
  );
}

/* ═══════════ MAIN LOGIN PAGE ═══════════ */
export default function LoginPage() {
  const router = useRouter();
  const accessToken = getAccessToken();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  const { onBlur: emailBlur, ...emailRegister } = form.register("email");
  const { onBlur: passwordBlur, ...passwordRegister } = form.register("password");

  useEffect(() => {
    if (!accessToken) return;
    const next = safeNextUrl(
      new URLSearchParams(window.location.search).get("next"),
      "/cameras",
    );
    router.replace(next);
  }, [accessToken, router]);

  async function onSubmit(values: FormValues) {
    setLoading(true);

    try {
      await loginApi(values);
      toast.dismiss("login-error");

      const next = safeNextUrl(
        new URLSearchParams(window.location.search).get("next"),
        "/cameras",
      );
      router.replace(next);
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Login failed";

      toast.error(message, { id: "login-error" });
    } finally {
      setLoading(false);
    }
  }

  if (accessToken) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 h-screen w-full overflow-hidden bg-slate-50">
      {/* ── Theme CSS Variables + Keyframes ── */}
      <style>{`
        @keyframes floatShape {
          0% { transform: translateY(0) rotate(0deg) scale(1); }
          50% { transform: translateY(-25px) rotate(6deg) scale(1.03); }
          100% { transform: translateY(0) rotate(0deg) scale(1); }
        }
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes pulseRing {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.3); opacity: 0; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes morphGlow {
          0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
          25% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
          50% { border-radius: 50% 60% 30% 60% / 30% 50% 70% 60%; }
          75% { border-radius: 60% 30% 60% 40% / 60% 50% 40% 50%; }
        }
        @keyframes borderRotate {
          from { --angle: 0deg; }
          to { --angle: 360deg; }
        }
        @keyframes shimmerSlide {
          from { transform: translateX(-100%); }
          to { transform: translateX(100%); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @property --angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }

        /* ═══ COMPONENT STYLES ═══ */
        .gradient-border {
          position: relative;
          background: rgba(255, 255, 255, 0.82);
          backdrop-filter: blur(40px) saturate(1.5);
          -webkit-backdrop-filter: blur(40px) saturate(1.5);
          border: 1px solid rgba(228, 228, 231, 0.5);
          box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.75);
        }
        .gradient-border::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: conic-gradient(from var(--angle, 0deg), #7c3aed, #4f46e5, #06b6d4, #7c3aed);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          animation: borderRotate 4s linear infinite;
          pointer-events: none;
        }
        .login-glass-input {
          background: rgba(255, 255, 255, 0.65);
          border: 1px solid rgba(228, 228, 231, 0.8);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .login-glass-input:focus-within {
          background: rgba(255, 255, 255, 0.9);
          border-color: rgba(124, 58, 237, 0.45);
          box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.08), 0 0 20px rgba(124, 58, 237, 0.05);
        }
        .btn-shine {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          box-shadow: 0 8px 24px rgba(124, 58, 237, 0.25);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .btn-shine:hover:not(:disabled) {
          box-shadow: 0 12px 32px rgba(124, 58, 237, 0.35);
          transform: translateY(-2px);
        }
        .btn-shine:active:not(:disabled) { transform: translateY(0); }
        .btn-shine::after {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 50%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          animation: shimmerSlide 3s ease-in-out infinite;
        }
        .btn-shine:disabled { opacity: 0.6; cursor: not-allowed; }
        .spinner-ring {
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.25);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.65s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .morph-blob {
          animation: morphGlow 12s ease-in-out infinite;
          filter: blur(50px);
        }
        .dot-grid {
          background-image: radial-gradient(rgba(228, 228, 231, 0.8) 1.5px, transparent 1.5px);
          background-size: 20px 20px;
        }
      `}</style>

      {/* ═══════ LEFT PANEL — Immersive Visual ═══════ */}
      <div className="hidden lg:flex lg:col-span-6 h-screen relative flex-col justify-between p-10 overflow-hidden border-r border-zinc-100 bg-white">
        <AuroraCanvas />

        {/* Morphing blobs */}
        <div className="morph-blob absolute" style={{ width: 350, height: 350, left: "10%", top: "15%", background: "radial-gradient(circle, rgba(124, 58, 237, 0.15), transparent 70%)" }} />
        <div className="morph-blob absolute" style={{ width: 280, height: 280, right: "5%", bottom: "20%", background: "radial-gradient(circle, rgba(6, 182, 212, 0.12), transparent 70%)", animationDelay: "-4s" }} />

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
              <h1 className="text-lg font-black tracking-tight text-zinc-900 leading-none">CRIPTON VISION</h1>
              <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-violet-600 mt-1">Vision AI Platform</p>
            </div>
          </div>
        </div>

        {/* Headline */}
        <div className="relative z-10 -mt-8">
          <h2 className="text-4xl xl:text-5xl font-black leading-[1.1] tracking-tight mb-4 text-zinc-900">
            AI Surveillance &<br />Attendance,<br />
            <span style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              <TypeWriter texts={["CCTV Tracking.", "Gatepass Automation.", "Face Recognition.", "Instant Alerts."]} />
            </span>
          </h2>
          <p className="text-sm leading-relaxed max-w-sm text-zinc-500">
            An enterprise computer vision platform that automates attendance tracking, smart gatepass approvals, and premises security using existing CCTV networks.
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
        <div className="absolute inset-0 pointer-events-none z-[5]" style={{
          background: `linear-gradient(to right, transparent 85%, #f0f2f8 100%), linear-gradient(to bottom, transparent 90%, #f0f2f8 100%), linear-gradient(to top, transparent 92%, #f0f2f8 100%)`,
        }} />
      </div>

      {/* ═══════ RIGHT PANEL — Form ═══════ */}
      <div className="col-span-1 lg:col-span-6 h-screen flex flex-col justify-center items-center p-6 md:p-10 relative bg-slate-50/40 dot-grid overflow-hidden">
        <div className="absolute pointer-events-none" style={{ width: 500, height: 500, left: "50%", top: "50%", transform: "translate(-50%, -50%)", background: "radial-gradient(circle, rgba(124, 58, 237, 0.04), transparent 70%)" }} />

        <div className="w-full relative z-10 max-w-[420px]">
          <div
            className="gradient-border rounded-2xl p-8 md:p-10 shadow-xl shadow-zinc-200/35"
            style={{
              animation: "scaleIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            }}
          >
            {/* Mobile Logo */}
            <div className="flex items-center gap-3 mb-8 lg:hidden">
              <PulsingLogo size={40} />
              <div>
                <h1 className="text-lg font-black tracking-tight text-zinc-900">CRIPTON VISION</h1>
                <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-400 mt-0.5">Vision AI Platform</p>
              </div>
            </div>

            {/* Header / Shield Badge */}
            <div className="flex flex-col items-center text-center mb-8">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full mb-3" 
                style={{ 
                  background: "rgba(124, 58, 237, 0.06)",
                  border: "1px solid rgba(124, 58, 237, 0.12)"
                }}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-600"></span>
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest text-violet-700 ml-1">Secure AI Gateway</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2 text-zinc-900">Welcome back</h2>
              <p className="text-xs text-zinc-500">Enter your admin credentials to access the AI control panel</p>
            </div>

            {/* Form */}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <Label className="block text-[10px] font-bold mb-2 uppercase tracking-wider text-zinc-400" htmlFor="email">Email Address</Label>
                <div className="login-glass-input rounded-md flex items-center gap-3 px-4 py-3.5">
                  <Mail className="w-[18px] h-[18px] flex-shrink-0 transition-all duration-300" style={{ color: focusedField === "email" ? "#7c3aed" : "#a1a1aa" }} />
                  <input 
                    id="email" 
                    type="text" 
                    onFocus={() => setFocusedField("email")} 
                    onBlur={(e) => {
                      setFocusedField(null);
                      emailBlur(e);
                    }}
                    placeholder="Enter your email (e.g. admin@company.com)" 
                    className="w-full bg-transparent outline-none text-xs font-semibold text-zinc-800 placeholder:text-zinc-400"
                    autoComplete="email" 
                    {...emailRegister} 
                  />
                </div>
                {form.formState.errors.email?.message ? (
                  <p className="text-xs text-rose-600 font-semibold mt-1">
                    {form.formState.errors.email.message}
                  </p>
                ) : null}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400" htmlFor="password">Password</Label>
                  <Link href="#" className="text-[10px] font-bold text-violet-600 hover:underline" tabIndex={-1}>Forgot?</Link>
                </div>
                <div className="login-glass-input rounded-md flex items-center gap-3 px-4 py-3.5">
                  <Lock className="w-[18px] h-[18px] flex-shrink-0 transition-all duration-300" style={{ color: focusedField === "password" ? "#7c3aed" : "#a1a1aa" }} />
                  <input 
                    id="password" 
                    type={show ? "text" : "password"} 
                    onFocus={() => setFocusedField("password")} 
                    onBlur={(e) => {
                      setFocusedField(null);
                      passwordBlur(e);
                    }}
                    placeholder="Enter your password" 
                    className="w-full bg-transparent outline-none text-xs font-semibold text-zinc-800 placeholder:text-zinc-400"
                    autoComplete="current-password" 
                    {...passwordRegister} 
                  />
                  <button type="button" onClick={() => setShow(!show)} className="flex-shrink-0 p-1 rounded-lg transition-all duration-300 text-zinc-400 hover:text-zinc-600" tabIndex={-1} aria-label={show ? "Hide password" : "Show password"}>
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.formState.errors.password?.message ? (
                  <p className="text-xs text-rose-600 font-semibold mt-1">
                    {form.formState.errors.password.message}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none" htmlFor="remember">
                  <input
                    type="checkbox"
                    id="remember"
                    className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-zinc-500">Remember me</span>
                </label>
              </div>

              <button type="submit" disabled={loading} className="btn-shine group w-full py-3.5 rounded-md text-xs font-bold text-white flex items-center justify-center gap-2 mt-1 cursor-pointer">
                {loading ? <div className="spinner-ring" /> : <><span>Sign In to Workspace</span><ArrowRight className="w-4 h-4 transition-transform duration-250 group-hover:translate-x-1" /></>}
              </button>
            </form>

            {/* Compliance badges */}
            <div className="mt-8 pt-6 border-t border-zinc-200/50">
              <div className="flex items-center justify-center gap-6">
                {["AES-256", "SOC 2", "GDPR"].map((badge) => (
                  <div key={badge} className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{badge}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer links */}
          <div className="mt-8 text-center space-y-3">
            <div className="text-[10px] text-zinc-400">
              © 2026 Cripton Vision. All rights reserved. • <Link href="#" className="hover:underline">Privacy</Link> • <Link href="#" className="hover:underline">Terms</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
