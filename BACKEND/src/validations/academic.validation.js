const { z } = require("zod");
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => { const d = new Date(`${v}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; }, "Invalid calendar date").transform((v) => new Date(`${v}T00:00:00Z`));
const common = { schoolId: uuid.optional() };
const schemas = {
  years: z.object({ ...common, name: z.string().trim().min(1).max(50), startDate: date, endDate: date, status: z.enum(["ACTIVE", "INACTIVE"]).optional() }).strict(),
  periods: z.object({ ...common, academicYearId: uuid, name: z.string().trim().min(1).max(80), code: z.string().trim().min(1).max(30), periodType: z.enum(["TERM", "QUARTER", "TRIMESTER", "OTHER"]).optional(), sequence: z.number().int().positive(), startDate: date, endDate: date }).strict(),
  sections: z.object({ ...common, gradeId: uuid, academicYearId: uuid, name: z.string().trim().min(1).max(50), code: z.string().trim().min(1).max(30), capacity: z.number().int().positive().optional(), roomNumber: z.string().trim().max(30).optional() }).strict(),
  subjects: z.object({ ...common, name: z.string().trim().min(1).max(100), code: z.string().trim().min(1).max(30), description: z.string().max(500).optional(), subjectType: z.enum(["CORE", "ELECTIVE", "OPTIONAL", "PRACTICAL", "OTHER"]).optional() }).strict(),
  enrollments: z.object({ ...common, studentId: uuid, academicYearId: uuid, gradeId: uuid, sectionId: uuid, rollNumber: z.string().trim().max(30).optional(), enrollmentDate: date, remarks: z.string().max(500).optional() }).strict(),
  transfer: z.object({ ...common, gradeId: uuid, sectionId: uuid, transferDate: date, rollNumber: z.string().trim().max(30).nullable().optional(), remarks: z.string().max(500).optional() }).strict(),
  classSubjects: z.object({ ...common, gradeId: uuid, subjectId: uuid, isMandatory: z.boolean().optional(), weeklyPeriods: z.number().int().positive().optional(), displayOrder: z.number().int().min(0).optional() }).strict(),
  status: z.object({ status: z.enum(["ACTIVE", "INACTIVE", "WITHDRAWN", "COMPLETED"]) }).strict(),
  academicStatus: z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) }).strict(),
};
const querySchema = z.object({ schoolId: uuid.optional(), academicYearId: uuid.optional(), gradeId: uuid.optional(), subjectId: uuid.optional(), sectionId: uuid.optional(), studentId: uuid.optional(), status: z.string().optional(), subjectType: z.enum(["CORE", "ELECTIVE", "OPTIONAL", "PRACTICAL", "OTHER"]).optional(), search: z.string().max(100).optional(), page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }).strict();
module.exports = { schemas, querySchema };
