import { prisma } from "./prisma";
import { findCameraByAnyId } from "./utils/camera";

export async function bootstrap() {
  const looksLikeCuid = (v: string) => /^c[a-z0-9]{24}$/.test(String(v || ""));

  // Ensure default laptop webcam exists
  const webcamId = "cam1";

  const existing = await findCameraByAnyId(webcamId);
  if (!existing) {
    await prisma.camera.create({
      data: {
        camId: webcamId,
        name: "Laptop Camera",
        rtspUrl: "0",
        isActive: false,
      },
    });
    console.log("✅ Default camera created: cam1 (Laptop Camera)");
  }

  // Migrate legacy cameras where the UI id was stored as the primary key.
  // After this, the PK "id" will be auto-generated (cuid), while UI id stays in camId.
  const legacy = await prisma.camera.findMany({
    where: { camId: { not: null } },
    select: { id: true, camId: true, name: true, rtspUrl: true, isActive: true },
  });

  for (const cam of legacy) {
    const publicId = String(cam.camId ?? "").trim();
    if (!publicId) continue;
    if (cam.id !== publicId) continue;

    await prisma.$transaction(async (tx) => {
      const current = await tx.camera.findUnique({
        where: { id: cam.id },
        select: {
          id: true,
          camId: true,
          name: true,
          rtspUrl: true,
          isActive: true,
        },
      });
      if (!current) return;
      if (String(current.camId ?? "").trim() !== publicId) return;

      // free unique camId so we can recreate with a generated PK id
      await tx.camera.update({
        where: { id: current.id },
        data: { camId: `legacy__${publicId}__${Date.now()}` },
      });

      await tx.camera.create({
        data: {
          camId: publicId,
          name: current.name,
          rtspUrl: current.rtspUrl,
          isActive: current.isActive,
        },
      });

      await tx.camera.delete({ where: { id: current.id } });
    });

    console.log(`✅ Migrated camera PK for camId=${publicId}`);
  }

  // Migrate legacy employees where the UI employee id was stored as the primary key.
  // After this, the PK "id" will be auto-generated (cuid), while UI id stays in empId.
  const employees = await prisma.employee.findMany({
    select: { id: true, empId: true, name: true },
  });

  for (const emp of employees) {
    if (looksLikeCuid(emp.id)) continue;

    const publicId = String(emp.empId ?? emp.id).trim();
    if (!publicId) continue;

    await prisma.$transaction(async (tx) => {
      const current = await tx.employee.findUnique({
        where: { id: emp.id },
        select: { id: true, empId: true, name: true },
      });
      if (!current) return;
      if (looksLikeCuid(current.id)) return;

      const currentPublicId = String(current.empId ?? current.id).trim();
      if (currentPublicId !== publicId) return;

      if (current.empId) {
        // free unique empId so we can recreate with a generated PK id
        await tx.employee.update({
          where: { id: current.id },
          data: { empId: `legacy__${publicId}__${Date.now()}` },
        });
      }

      const created = await tx.employee.create({
        data: {
          empId: publicId,
          name: current.name,
        },
        select: { id: true },
      });

      await tx.faceTemplate.updateMany({
        where: { employeeId: current.id },
        data: { employeeId: created.id },
      });

      await tx.attendance.updateMany({
        where: { employeeId: current.id },
        data: { employeeId: created.id },
      });

      await tx.employee.delete({ where: { id: current.id } });
    });

    console.log(`✅ Migrated employee PK for empId=${publicId}`);
  }
}
