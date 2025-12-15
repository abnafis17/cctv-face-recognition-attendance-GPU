import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./src/prisma";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const PORT = Number(process.env.PORT || 4000);

// ---- Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---- Employees
app.get("/api/employees", async (_req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(employees);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to load employees", detail: e?.message ?? String(e) });
  }
});

app.post("/api/employees", async (req, res) => {
  try {
    const { id, name } = req.body as { id?: string; name?: string };
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name is required" });
    }

    const employee = await prisma.employee.upsert({
      where: { id: id ?? "__new__" },
      update: { name },
      create: { id: id, name },
    });

    res.json(employee);
  } catch (e: any) {
    // If id is "__new__" the upsert will fail because id doesn't exist; so do a create.
    try {
      const { name } = req.body as { name: string };
      const created = await prisma.employee.create({ data: { name } });
      return res.json(created);
    } catch (e2: any) {
      return res.status(500).json({ error: "Failed to upsert employee", detail: e2?.message ?? String(e2) });
    }
  }
});

// ---- Gallery templates (embeddings stored in Postgres via Prisma)
app.get("/api/gallery/templates", async (_req, res) => {
  try {
    const templates = await prisma.faceTemplate.findMany({
      include: { employee: true },
      orderBy: [{ employeeId: "asc" }, { angle: "asc" }],
    });

    res.json(
      templates.map((t) => ({
        id: t.id,
        employeeId: t.employeeId,
        employeeName: t.employee.name,
        angle: t.angle,
        modelName: t.modelName,
        embedding: t.embedding,
        updatedAt: t.updatedAt,
      }))
    );
  } catch (e: any) {
    res.status(500).json({ error: "Failed to load templates", detail: e?.message ?? String(e) });
  }
});

app.post("/api/gallery/templates", async (req, res) => {
  try {
    const { employeeId, angle, embedding, modelName } = req.body as {
      employeeId?: string;
      angle?: string;
      embedding?: number[];
      modelName?: string;
    };

    if (!employeeId || !angle || !Array.isArray(embedding) || embedding.length < 128) {
      return res.status(400).json({ error: "employeeId, angle, embedding[] are required" });
    }

    const tpl = await prisma.faceTemplate.upsert({
      where: { employeeId_angle: { employeeId, angle } },
      update: {
        embedding: embedding.map((x) => Number(x)),
        modelName: modelName ?? "unknown",
      },
      create: {
        employeeId,
        angle,
        embedding: embedding.map((x) => Number(x)),
        modelName: modelName ?? "unknown",
      },
    });

    res.json(tpl);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to upsert template", detail: e?.message ?? String(e) });
  }
});

// ---- Attendance (AI posts here)
app.post("/api/attendance", async (req, res) => {
  try {
    const { employeeId, timestamp, cameraId, confidence, snapshotPath } = req.body as {
      employeeId?: string;
      timestamp?: string;
      cameraId?: string | null;
      confidence?: number | null;
      snapshotPath?: string | null;
    };

    if (!employeeId || !timestamp) {
      return res.status(400).json({ error: "employeeId and timestamp are required" });
    }

    // Ensure employee exists (if AI posts an unknown ID)
    await prisma.employee.upsert({
      where: { id: employeeId },
      update: {},
      create: { id: employeeId, name: "Unknown" },
    });

    const row = await prisma.attendance.create({
      data: {
        employeeId,
        timestamp: new Date(timestamp),
        cameraId: cameraId ?? null,
        confidence: typeof confidence === "number" ? confidence : null,
      },
    });

    res.json({ ok: true, attendance: row, snapshotPath: snapshotPath ?? null });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to create attendance", detail: e?.message ?? String(e) });
  }
});

app.get("/api/attendance", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const rows = await prisma.attendance.findMany({
      include: { employee: true },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    res.json(
      rows.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        name: r.employee.name,
        timestamp: r.timestamp.toISOString(),
        cameraId: r.cameraId,
        confidence: r.confidence,
      }))
    );
  } catch (e: any) {
    res.status(500).json({ error: "Failed to load attendance", detail: e?.message ?? String(e) });
  }
});

// ---- Stats for dashboard
app.get("/api/stats", async (_req, res) => {
  try {
    const [employees, attendance] = await Promise.all([
      prisma.employee.count(),
      prisma.attendance.count(),
    ]);

    res.json({ employees, attendance });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to load stats", detail: e?.message ?? String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend running: http://localhost:${PORT}`);
});
