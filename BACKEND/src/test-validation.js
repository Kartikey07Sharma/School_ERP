const {
  createSchoolSchema,
} = require("./validations/school.validation");

const result = createSchoolSchema.safeParse({
  name: "ABC Public School",
  code: "ABC001",
  email: "admin@abcschool.com",
  phone: "9876543210",
  institutionType: "SCHOOL",
});

console.log(result);