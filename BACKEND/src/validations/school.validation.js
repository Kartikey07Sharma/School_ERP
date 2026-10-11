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

const updateSchoolSchema = z.object({
  name: z.string().trim().min(3).max(100).optional(),
  code: z.string().trim().min(3).max(20).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().regex(/^[0-9]{10,15}$/).optional(),
  address: z.string().max(500).nullable().optional(),
  logoUrl: z.url().nullable().optional(),
  institutionType: z.enum(["SCHOOL", "COLLEGE"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

const changeSchoolStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
}).strict();

module.exports = {
  createSchoolSchema,
  updateSchoolSchema,
  changeSchoolStatusSchema,
};
