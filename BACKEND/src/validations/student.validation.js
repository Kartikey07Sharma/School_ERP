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
const phoneNumber = z.string().trim().regex(/^\+?[0-9]{10,15}$/, "Phone number must contain 10–15 digits with an optional leading +");
const optionalPhone = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  phoneNumber.nullable()
).optional();

const studentFields = {
  admissionNumber: z.string().trim().min(1).max(50),
  firstName: requiredText(100),
  middleName: optionalText(100),
  lastName: requiredText(100),
  dateOfBirth: dateOnly.refine((value) => value.toISOString().slice(0, 10) <= new Date().toISOString().slice(0, 10), "Date of birth cannot be in the future"),
  gender: z.enum(["Male", "Female", "Other"]),
  admissionDate: dateOnly,
  // Legacy Phase 3 placement snapshots are optional; Phase 4 enrollment records are authoritative.
  className: optionalText(100),
  section: optionalText(50),
  academicYear: optionalText(30),
  email: optionalEmail,
  phone: optionalPhone,
  address: requiredText(1000),
  guardianName: requiredText(200),
  guardianRelationship: requiredText(100),
  guardianPhone: phoneNumber,
  guardianEmail: optionalEmail,
  guardianAddress: optionalText(1000),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  bloodGroup: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"]).optional()),
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
const changeStudentStatusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED", "WITHDRAWN"]) }).strict();
const studentQuerySchema = z.object({
  schoolId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED", "WITHDRAWN"]).optional(),
  className: z.string().trim().max(100).optional(),
  section: z.string().trim().max(50).optional(),
  academicYear: z.string().trim().max(30).optional(),
}).strict();

const createPortalAccountSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, phoneNumber.optional()),
  password: z.string().min(12).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 bytes"),
}).strict();
const linkPortalAccountSchema = z.object({ userId: z.string().uuid() }).strict();
const portalAccountStatusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) }).strict();
const updateMyStudentProfileSchema = z.object({
  email: optionalEmail,
  phone: optionalPhone,
  address: requiredText(1000).optional(),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  guardianName: requiredText(200).optional(),
  guardianRelationship: requiredText(100).optional(),
  guardianPhone: phoneNumber.optional(),
  guardianEmail: optionalEmail,
  guardianAddress: optionalText(1000),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one profile field is required");
const portalAcademicQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

module.exports = { createStudentSchema, updateStudentSchema, changeStudentStatusSchema, studentQuerySchema, createPortalAccountSchema, linkPortalAccountSchema, portalAccountStatusSchema, updateMyStudentProfileSchema, portalAcademicQuerySchema };
