const {
  createUserSchema,
} = require("./validations/user.validation");

const result = createUserSchema.safeParse({
  firstName: "Kartikey",
  lastName: "Sharma",
  email: "kartikey@gmail.com",
  phone: "9876543210",
  password: "password123",
  role: "SCHOOL_ADMIN",
  schoolId: "16128d3a-c8f3-4ee6-b12b-659ba24e02dd",
});

console.log(result);