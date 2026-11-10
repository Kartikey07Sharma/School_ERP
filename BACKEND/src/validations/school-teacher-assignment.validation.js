const {z}=require("zod");
const uuid=z.string().uuid();
const status=z.enum(["ACTIVE","INACTIVE"]);
const createSchema=z.object({teacherProfileId:uuid,academicYearId:uuid,gradeId:uuid,sectionId:uuid,subjectId:uuid}).strict();
const updateSchema=z.object({teacherProfileId:uuid.optional(),academicYearId:uuid.optional(),gradeId:uuid.optional(),sectionId:uuid.optional(),subjectId:uuid.optional()}).strict().refine(d=>Object.keys(d).length>0,"At least one field is required");
const statusSchema=z.object({status}).strict();
const querySchema=z.object({schoolId:uuid.optional(),page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(100).default(20),teacherProfileId:uuid.optional(),employeeId:uuid.optional(),academicYearId:uuid.optional(),gradeId:uuid.optional(),sectionId:uuid.optional(),subjectId:uuid.optional(),status:status.optional(),search:z.string().trim().max(100).optional(),sortBy:z.enum(["createdAt","updatedAt","employeeId","lastName","academicYearId"]).default("createdAt"),sortOrder:z.enum(["asc","desc"]).default("desc")}).strict();
module.exports={createSchema,updateSchema,statusSchema,querySchema,uuid};
