const { z } = require("zod");

const createSchoolSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "School name must be at least 3 characters")
    .max(100, "School name cannot exceed 100 characters"),

  code: z
    .string()
    .trim()
    .min(3, "School code must be at least 3 characters")
    .max(20, "School code cannot exceed 20 characters"),

  email: z.email("Invalid email format"),

  phone: z
    .string()
    .regex(
      /^[0-9]{10,15}$/,
      "Phone number must contain 10 to 15 digits"
    ),

  address: z.string().optional(),

  logoUrl: z.url().optional(),

  institutionType: z.enum(
    ["SCHOOL", "COLLEGE"],
    {
      error: "Institution type must be SCHOOL or COLLEGE",
    }
  ),
});

module.exports = {
  createSchoolSchema,
};