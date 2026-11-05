const { z } = require("zod");

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD").refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid calendar date").transform((value) => new Date(`${value}T00:00:00.000Z`));
const requiredText = (max = 200) => z.string().trim().min(1).max(max);
const optionalText = (max = 200) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().max(max).nullable()
).optional();
const optionalEmail = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().email().max(254).transform((value) => value.toLowerCase()).nullable()
).optional();

const studentFields = {
  admissionNumber: z.string().trim().min(1).max(50),
  firstName: requiredText(100),
  middleName: optionalText(100),
  lastName: requiredText(100),
  dateOfBirth: dateOnly.refine((value) => value.toISOString().slice(0, 10) <= new Date().toISOString().slice(0, 10), "Date of birth cannot be in the future"),
  gender: z.enum(["Male", "Female", "Other"]),
  admissionDate: dateOnly,
  className: requiredText(100),
  section: requiredText(50),
  academicYear: requiredText(30),
  email: optionalEmail,
  phone: optionalText(30),
  address: requiredText(1000),
  guardianName: requiredText(200),
  guardianRelationship: requiredText(100),
  guardianPhone: z.string().trim().min(1).max(30),
  guardianEmail: optionalEmail,
};

const dateOrderIssue = (data, context) => {
  if (data.dateOfBirth && data.admissionDate && data.admissionDate < data.dateOfBirth) {
    context.addIssue({ code: "custom", path: ["admissionDate"], message: "Admission date cannot be earlier than date of birth" });
  }
};
const createStudentSchema = z.object({
  ...studentFields,
  schoolId: z.string().uuid().optional(),
}).strict().superRefine(dateOrderIssue);
const updateStudentSchema = z.object(Object.fromEntries(Object.entries(studentFields).map(([key, schema]) => [key, schema.optional()]))).strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required")
  .superRefine(dateOrderIssue);
const changeStudentStatusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED"]) }).strict();
const studentQuerySchema = z.object({
  schoolId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED"]).optional(),
  className: z.string().trim().max(100).optional(),
  section: z.string().trim().max(50).optional(),
  academicYear: z.string().trim().max(30).optional(),
}).strict();

module.exports = { createStudentSchema, updateStudentSchema, changeStudentStatusSchema, studentQuerySchema };
