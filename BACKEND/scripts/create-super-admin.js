const bcrypt = require("bcrypt");
const { z } = require("zod");
const prisma = require("../src/database/prisma");

async function main() {
  const input = z.object({
    SUPER_ADMIN_EMAIL: z.string().trim().email().max(254),
    SUPER_ADMIN_FIRST_NAME: z.string().trim().min(2).max(100),
    SUPER_ADMIN_PASSWORD: z.string().min(12).max(72).refine(
      (value) => Buffer.byteLength(value, "utf8") <= 72,
    ),
  }).safeParse(process.env);

  if (!input.success) {
    throw new Error("Provide valid SUPER_ADMIN_EMAIL, SUPER_ADMIN_FIRST_NAME, and SUPER_ADMIN_PASSWORD environment variables");
  }

  await prisma.$connect();
  const existing = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" }, select: { id: true } });
  if (existing) throw new Error("A SUPER_ADMIN already exists; refusing to create another bootstrap account");

  const password = await bcrypt.hash(input.data.SUPER_ADMIN_PASSWORD, 12);
  await prisma.user.create({
    data: {
      firstName: input.data.SUPER_ADMIN_FIRST_NAME,
      email: input.data.SUPER_ADMIN_EMAIL.toLowerCase(),
      password,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      schoolId: null,
    },
    select: { id: true },
  });
  console.info("Initial platform administrator created");
}

main()
  .catch(() => {
    console.error("Unable to create the initial platform administrator; verify the migration and database configuration");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
