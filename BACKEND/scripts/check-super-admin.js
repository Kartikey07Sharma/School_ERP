require("dotenv").config();

const prisma = require("../src/database/prisma");

async function main() {
  const user = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: {
      id: true,
      email: true,
      firstName: true,
      role: true,
      status: true,
      schoolId: true,
    },
  });

  if (!user) {
    console.log("No Super Admin found");
    return;
  }

  console.log("Existing Super Admin:", user);
  console.log(
    "Email matches .env:",
    user.email.toLowerCase() ===
      process.env.SUPER_ADMIN_EMAIL.trim().toLowerCase()
  );
}

main()
  .catch((error) => console.error(error.message))
  .finally(() => prisma["$disconnect"]());