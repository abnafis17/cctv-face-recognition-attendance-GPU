import { Router } from "express";

const router = Router();
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const REMOTE_IMAGE_FETCH_TIMEOUT_MS = Number(
  process.env.REMOTE_IMAGE_FETCH_TIMEOUT_MS || 5000,
);

function normalizeErrorMessage(error: unknown): string {
  const anyError = error as any;
  return (
    anyError?.cause?.code ||
    anyError?.code ||
    anyError?.message ||
    String(error)
  );
}

router.get("/", (_req, res) => {
  res.json({ ok: true });
});
router.get("/resize", async (req, res) => {
  try {
    const { imageUrl, w, h } = req.query;

    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required" });
    }

    // Basic validation (avoid SSRF surprises)
    const url = new URL(
      "https://bpm.pakizaknit.com/Photo/EmpPicture/" + imageUrl,
    );
    if (url.protocol !== "https:") {
      return res.status(400).json({ error: "Only https URLs are allowed" });
    }

    const width = Number(w) || 300;
    const height = Number(h) || 300;

    // Fetch remote image
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, REMOTE_IMAGE_FETCH_TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch(url.toString(), {
        // Some servers block requests without a UA
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      return res.status(502).json({
        error: "Failed to fetch remote image",
        status: resp.status,
      });
    }

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return res.status(415).json({
        error: "URL did not return an image",
        contentType,
      });
    }

    const arrayBuffer = await resp.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Resize and encode
    const outputBuffer = await sharp(inputBuffer)
      .resize(width, height, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();

    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(outputBuffer);
  } catch (err) {
    console.warn("[health/resize] failed:", normalizeErrorMessage(err));
    res.status(502).json({ error: "Resize failed" });
  }
});
export default router;
