"use client";

import { useEffect, useRef } from "react";

export default function AuroraCanvas() {
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
