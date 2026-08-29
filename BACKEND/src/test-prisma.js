const prisma = require("./database/prisma");

async function testConnection() {
  try {
    const result = await prisma.school.findMany();

    console.log("Database Connected Successfully");
    console.log(result);
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();