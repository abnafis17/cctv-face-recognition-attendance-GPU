import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export async function bootstrap() {
  const looksLikeCuid = (v: string) => /^c[a-z0-9]{24}$/.test(String(v || ""));
  type CameraLegacyRow = {
    id: string;
    camId: string | null;
    name: string;
    rtspUrl: string | null;
    isActive: boolean;
    companyId: string | null;
    relayAgentId: string | null;
    rtspUrlEnc: string | null;
    sendFps: number;
    sendWidth: number;
    sendHeight: number;
    jpegQuality: number;
    attendance?: boolean | null;
    task?: string | null;
  };
  const cameraHasAttendanceField = Prisma.dmmf.datamodel.models
    .find((m) => m.name === "Camera")
    ?.fields.some((f) => f.name === "attendance");
  const cameraHasTaskField = Prisma.dmmf.datamodel.models
    .find((m) => m.name === "Camera")
    ?.fields.some((f) => f.name === "task");

  const cameraSelect: Record<string, boolean> = {
    id: true,
    camId: true,
    name: true,
    rtspUrl: true,
    isActive: true,
    companyId: true,
    relayAgentId: true,
    rtspUrlEnc: true,
    sendFps: true,
    sendWidth: true,
    sendHeight: true,
    jpegQuality: true,
  };
  if (cameraHasAttendanceField) cameraSelect.attendance = true;
  if (cameraHasTaskField) cameraSelect.task = true;

  // Migrate legacy cameras where the UI id was stored as the primary key.
  // After this, the PK "id" will be auto-generated (cuid), while UI id stays in camId.
  const legacy = (await prisma.camera.findMany({
    where: { camId: { not: null } },
    select: cameraSelect as any,
  })) as unknown as CameraLegacyRow[];

  for (const cam of legacy) {
    const publicId = String(cam.camId ?? "").trim();
    if (!publicId) continue;
    if (cam.id !== publicId) continue;

    await prisma.$transaction(async (tx) => {
      const current = (await tx.camera.findUnique({
        where: { id: cam.id },
        select: cameraSelect as any,
      })) as CameraLegacyRow | null;
      if (!current) return;
      if (String(current.camId ?? "").trim() !== publicId) return;

      // free unique camId so we can recreate with a generated PK id
      await tx.camera.update({
        where: { id: current.id },
        data: { camId: `legacy__${publicId}__${Date.now()}` },
      });

      const created = await tx.camera.create({
        data: {
          camId: publicId,
          name: current.name,
          rtspUrl: current.rtspUrl,
          isActive: current.isActive,
          companyId: current.companyId,
          relayAgentId: current.relayAgentId,
          rtspUrlEnc: current.rtspUrlEnc,
          sendFps: current.sendFps,
          sendWidth: current.sendWidth,
          sendHeight: current.sendHeight,
          jpegQuality: current.jpegQuality,
          ...(cameraHasAttendanceField
            ? { attendance: (current as any).attendance }
            : {}),
          ...(cameraHasTaskField ? { task: (current as any).task } : {}),
        } as any,
        select: { id: true },
      });

      await tx.attendance.updateMany({
        where: { cameraId: current.id },
        data: { cameraId: created.id },
      });
      await tx.headcount.updateMany({
        where: { cameraId: current.id },
        data: { cameraId: created.id },
      });
      await tx.otRequisition.updateMany({
        where: { cameraId: current.id },
        data: { cameraId: created.id },
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

  // Seed modules if table is empty
  try {
    const modulesCount = await prisma.module.count();
    if (modulesCount === 0) {
      console.log("Seeding default system modules...");

      // Top-level modules
      const cameras = await prisma.module.create({
        data: { name: "Cameras (Live)", route: "/cameras", sortOrder: 10 }
      });
      const cameraList = await prisma.module.create({
        data: { name: "Camera List", route: "/camera-list", sortOrder: 20 }
      });
      const enroll = await prisma.module.create({
        data: { name: "Enrollment (Auto)", route: "/enroll", sortOrder: 30 }
      });
      const employees = await prisma.module.create({
        data: { name: "Employees", route: "/employees", sortOrder: 40 }
      });
      const dailyAttendance = await prisma.module.create({
        data: { name: "Daily Attendance", route: "/daily-attendance", sortOrder: 50 }
      });
      const attendance = await prisma.module.create({
        data: { name: "Recognition History", route: "/attendance", sortOrder: 60 }
      });
      const unknownRecognition = await prisma.module.create({
        data: { name: "Unknown History", route: "/unknown-recognition", sortOrder: 70 }
      });

      // Parent group: Gate Pass
      const gatepassGroup = await prisma.module.create({
        data: { name: "Gate Pass", sortOrder: 80 }
      });
      await prisma.module.create({
        data: { name: "Gate Pass Form", route: "/gatepass", parentId: gatepassGroup.id, sortOrder: 81 }
      });
      await prisma.module.create({
        data: { name: "Gate Pass Log", route: "/gatepass/history", parentId: gatepassGroup.id, sortOrder: 82 }
      });

      // Parent group: Visitor
      const visitorGroup = await prisma.module.create({
        data: { name: "Visitor", sortOrder: 90 }
      });
      await prisma.module.create({
        data: { name: "Add Visitor", route: "/visitors/add", parentId: visitorGroup.id, sortOrder: 91 }
      });
      await prisma.module.create({
        data: { name: "Visitor List", route: "/visitors", parentId: visitorGroup.id, sortOrder: 92 }
      });
      await prisma.module.create({
        data: { name: "Employee Wise Visit", route: "/visitors/employee-wise-visit", parentId: visitorGroup.id, sortOrder: 93 }
      });
      await prisma.module.create({
        data: { name: "Visitor Wise Visit", route: "/visitors/visitor-wise-visit", parentId: visitorGroup.id, sortOrder: 94 }
      });

      // Remainder
      await prisma.module.create({
        data: { name: "Master Data", route: "/master-data", sortOrder: 100 }
      });
      const settingsGroup = await prisma.module.create({
        data: { name: "Settings", sortOrder: 110 }
      });
      await prisma.module.create({
        data: { name: "URLs", route: "/settings/urls", parentId: settingsGroup.id, sortOrder: 111 }
      });
      await prisma.module.create({
        data: { name: "Permissions", route: "/permissions", sortOrder: 120 }
      });

      console.log("Seeding system modules completed.");
    } else {
      // Migrate legacy database structure for Settings module
      const oldSettings = await prisma.module.findFirst({
        where: { route: "/settings" }
      });

      if (oldSettings) {
        console.log("Migrating legacy settings module in database...");
        
        // Remove route from parent Settings module
        await prisma.module.update({
          where: { id: oldSettings.id },
          data: { route: null }
        });

        // Ensure "URLs" submodule exists under Settings parent module
        let urlsSubModule = await prisma.module.findFirst({
          where: { route: "/settings/urls", parentId: oldSettings.id }
        });

        if (!urlsSubModule) {
          urlsSubModule = await prisma.module.create({
            data: {
              name: "URLs",
              route: "/settings/urls",
              parentId: oldSettings.id,
              sortOrder: 111
            }
          });
          console.log("Created URLs submodule under Settings.");
        }

        // Migrate any existing permissions mapped to "/settings" to "/settings/urls"
        const oldPermissions = await prisma.permission.findMany({
          where: { module: "/settings" }
        });

        if (oldPermissions.length > 0) {
          console.log(`Migrating ${oldPermissions.length} permissions from /settings to /settings/urls...`);
          for (const perm of oldPermissions) {
            const companyId = perm.companyId || "";
            // Check if /settings/urls permission already exists
            const existingPerm = await prisma.permission.findUnique({
              where: {
                companyId_role_module: {
                  companyId: companyId,
                  role: perm.role,
                  module: "/settings/urls"
                }
              }
            });

            if (!existingPerm) {
              await prisma.permission.create({
                data: {
                  companyId: perm.companyId,
                  role: perm.role,
                  module: "/settings/urls",
                  allowed: perm.allowed
                }
              });
            } else {
              await prisma.permission.update({
                where: { id: existingPerm.id },
                data: { allowed: perm.allowed }
              });
            }
          }

          // Clean up old permissions
          await prisma.permission.deleteMany({
            where: { module: "/settings" }
          });
          console.log("Settings permissions migration completed.");
        }
      }
    }

    // Ensure Employee action submodules exist (Edit, Re-enroll Face, Delete)
    const employeesModule = await prisma.module.findFirst({
      where: { route: "/employees" }
    });
    if (employeesModule) {
      const actions = [
        { name: "Edit", route: "/employees/edit", sortOrder: 41 },
        { name: "Re-enroll Face", route: "/employees/re-enroll", sortOrder: 42 },
        { name: "Delete", route: "/employees/delete", sortOrder: 43 }
      ];
      for (const act of actions) {
        const existing = await prisma.module.findFirst({
          where: { route: act.route }
        });
        if (!existing) {
          await prisma.module.create({
            data: {
              name: act.name,
              route: act.route,
              parentId: employeesModule.id,
              sortOrder: act.sortOrder
            }
          });
          console.log(`✅ Seeded missing employee action module: ${act.name}`);
        }
      }
    }

    // Ensure Settings submodules exist (URLs, Users)
    const settingsModule = await prisma.module.findFirst({
      where: { name: "Settings", parentId: null }
    });
    if (settingsModule) {
      const submods = [
        { name: "URLs", route: "/settings/urls", sortOrder: 111 },
        { name: "Users", route: "/settings/users", sortOrder: 112 }
      ];
      for (const sub of submods) {
        const existing = await prisma.module.findFirst({
          where: { route: sub.route }
        });
        if (!existing) {
          await prisma.module.create({
            data: {
              name: sub.name,
              route: sub.route,
              parentId: settingsModule.id,
              sortOrder: sub.sortOrder
            }
          });
          console.log(`✅ Seeded missing settings submodule: ${sub.name}`);
        }
      }
    }
  } catch (err) {
    console.error("Failed to seed system modules:", err);
  }
}
