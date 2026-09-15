import { prisma } from "../prisma";

async function main() {
  const comps = await prisma.company.findMany();
  const cams = await prisma.camera.findMany();
  console.log("=== DB COMPANIES ===");
  comps.forEach(c => console.log(`  ID: ${c.id} | companyName: ${c.companyName}`));
  console.log("=== DB CAMERAS ===");
  cams.forEach(c => console.log(`  ID: ${c.id} | Name: ${c.name} | companyId: ${c.companyId} | isActive: ${c.isActive}`));
}

main().then(() => prisma.$disconnect()).catch(err => { console.error(err); prisma.$disconnect(); });
