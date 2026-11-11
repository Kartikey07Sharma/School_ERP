const { z } = require("zod");
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { const parsed = new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value; }, "Use a valid calendar date (YYYY-MM-DD)").transform((value) => new Date(`${value}T00:00:00.000Z`));
const timestamp = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const status = z.enum(["PRESENT", "ABSENT", "LATE", "LEAVE"]);
const category = z.enum(["TEACHING", "NON_TEACHING"]);
const employeeStatus = z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED", "RESIGNED"]);
const attendanceEntry = z.object({ employeeId: uuid, status, checkInAt: timestamp.optional(), checkOutAt: timestamp.optional(), remarks: z.string().trim().max(500).nullable().optional() }).strict().superRefine((value, ctx) => {
  if (value.checkOutAt && !value.checkInAt) ctx.addIssue({ code: "custom", path: ["checkInAt"], message: "Check-in is required when check-out is supplied" });
  if (value.checkInAt && value.checkOutAt && value.checkOutAt < value.checkInAt) ctx.addIssue({ code: "custom", path: ["checkOutAt"], message: "Check-out cannot precede check-in" });
  if (["ABSENT", "LEAVE"].includes(value.status) && (value.checkInAt || value.checkOutAt)) ctx.addIssue({ code: "custom", path: ["status"], message: "Absent or leave records cannot include check-in or check-out timestamps" });
});
const uniqueEmployees = (entries) => new Set(entries.map((item) => item.employeeId)).size === entries.length;
const roster = z.object({ schoolId: uuid.optional(), date, departmentId: uuid.optional(), designationId: uuid.optional(), category, employeeStatus, page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50) }).partial({ category: true, employeeStatus: true }).strict();
const mark = z.object({ schoolId: uuid.optional(), attendanceDate: date, attendance: z.array(attendanceEntry).min(1).max(100) }).strict().refine((value) => uniqueEmployees(value.attendance), { path: ["attendance"], message: "Employee IDs must be unique" });
const query = z.object({ schoolId: uuid.optional(), date: date.optional(), from: date.optional(), to: date.optional(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(), departmentId: uuid.optional(), designationId: uuid.optional(), category, status: z.enum(["PRESENT", "ABSENT", "LATE", "LEAVE"]).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50) }).partial({ category: true }).strict().refine((value) => !value.from || !value.to || value.from <= value.to, { path: ["to"], message: "End date must not precede start date" }).refine((value) => !(value.month && (value.date || value.from || value.to)) && !(value.date && (value.from || value.to)), { path: ["month"], message: "Use either a date, month, or from/to date range filters" });
const checkIn = z.object({ schoolId: uuid.optional(), checkInAt: timestamp }).strict();
const checkOut = z.object({ schoolId: uuid.optional(), checkOutAt: timestamp }).strict();
const correction = z.object({ schoolId: uuid.optional(), status: status.optional(), checkInAt: timestamp.nullable().optional(), checkOutAt: timestamp.nullable().optional(), reason: z.string().trim().min(5).max(1000) }).strict().refine((value) => value.status !== undefined || value.checkInAt !== undefined || value.checkOutAt !== undefined, { message: "At least one attendance field must be corrected" }).superRefine((value, ctx) => {
  if (value.checkOutAt && value.checkInAt === undefined) return;
  if (value.checkOutAt && value.checkInAt && value.checkOutAt < value.checkInAt) ctx.addIssue({ code: "custom", path: ["checkOutAt"], message: "Check-out cannot precede check-in" });
  if (["ABSENT", "LEAVE"].includes(value.status) && (value.checkInAt || value.checkOutAt)) ctx.addIssue({ code: "custom", path: ["status"], message: "Absent or leave records cannot include check-in or check-out timestamps" });
});
module.exports = { uuid, date, timestamp, status, category, employeeStatus, roster, mark, query, checkIn, checkOut, correction };
