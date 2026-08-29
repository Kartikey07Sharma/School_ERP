const schoolService = require("./services/school.service");

async function main() {
  try {
    const school = await schoolService.createSchool({
      name: "ABC Public School",
      code: "ABC002",
      email: "school3@test.com",
      phone: "9876543210",
      institutionType: "SCHOOL",
    });

    console.log("School Created");
    console.log(school);
  } catch (error) {
    console.error(error.message);
  }
}

main();