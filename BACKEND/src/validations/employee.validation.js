const { z } = require("zod");
const uuid = z.string().uuid();
const date = z.coerce.date();
const employeeFields = {
  employeeId: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._/-]+$/),
  category: z.enum(["TEACHING", "NON_TEACHING"]),
  status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED", "RESIGNED"]).optional(),
  firstName: z.string().trim().min(1).max(80), middleName: z.string().trim().max(80).nullable().optional(),
  lastName: z.string().trim().min(1).max(80), dateOfBirth: date.nullable().optional(), gender: z.string().trim().max(30).nullable().optional(),
  email: z.string().email().max(254).nullable().optional(), phone: z.string().trim().min(5).max(30), alternatePhone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(), city: z.string().trim().max(100).nullable().optional(), state: z.string().trim().max(100).nullable().optional(), postalCode: z.string().trim().max(20).nullable().optional(),
  emergencyContactName: z.string().trim().max(160).nullable().optional(), emergencyContactRelationship: z.string().trim().max(80).nullable().optional(), emergencyContactPhone: z.string().trim().max(30).nullable().optional(),
  joiningDate: date, relievingDate: date.nullable().optional(), departmentId: uuid.nullable().optional(), designationId: uuid,
};
const employeeSchema = z.object(employeeFields).strict().superRefine((d, ctx) => { if (d.relievingDate && d.relievingDate < d.joiningDate) ctx.addIssue({ code: "custom", path: ["relievingDate"], message: "Relieving date cannot precede joining date" }); });
const updateEmployeeSchema = z.object(Object.fromEntries(Object.entries(employeeFields).map(([k,v])=>[k,v.optional()]))).strict().refine((d)=>Object.keys(d).length>0,"At least one field is required");
const querySchema = z.object({ schoolId: uuid.optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), search: z.string().trim().max(100).optional(), category: z.enum(["TEACHING","NON_TEACHING"]).optional(), status: z.enum(["ACTIVE","INACTIVE","ON_LEAVE","TERMINATED","RESIGNED"]).optional(), departmentId: uuid.optional(), designationId: uuid.optional() }).strict();
const lookupSchema = z.object({ name: z.string().trim().min(1).max(100), code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._/-]+$/), description: z.string().trim().max(500).optional(), category: z.enum(["TEACHING","NON_TEACHING"]).nullable().optional() }).strict();
const lookupUpdateSchema = z.object({ name: z.string().trim().min(1).max(100).optional(), code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._/-]+$/).optional(), description: z.string().trim().max(500).nullable().optional(), category: z.enum(["TEACHING","NON_TEACHING"]).nullable().optional(), status: z.enum(["ACTIVE","INACTIVE"]).optional() }).strict().refine(d=>Object.keys(d).length>0,"At least one field is required");
const departmentUpdateSchema = z.object({ name: z.string().trim().min(1).max(100).optional(), code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._/-]+$/).optional(), description: z.string().trim().max(500).nullable().optional(), status: z.enum(["ACTIVE","INACTIVE"]).optional() }).strict().refine(d=>Object.keys(d).length>0,"At least one field is required");
const teacherSchema = z.object({ qualifications: z.string().trim().max(1000).nullable().optional(), specialization: z.string().trim().max(500).nullable().optional(), experienceYears: z.number().int().min(0).max(70).nullable().optional() }).strict();
module.exports = { employeeSchema, updateEmployeeSchema, querySchema, lookupSchema, lookupUpdateSchema, departmentUpdateSchema, teacherSchema, uuid };
