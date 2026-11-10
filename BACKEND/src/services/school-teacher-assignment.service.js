const prisma=require("../repositories/school-teacher-assignment.repository");
const AppError=require("../utils/AppError");
const {randomUUID}=require("node:crypto");
const fail=(m,s=400,c="VALIDATION_ERROR")=>{throw new AppError(m,s,c);};
const includes={teacherProfile:{select:{id:true,qualifications:true,specialization:true,employee:{select:{id:true,employeeId:true,firstName:true,middleName:true,lastName:true,email:true,phone:true,status:true,category:true}}}},academicYear:{select:{id:true,name:true,startDate:true,endDate:true,status:true}},grade:{select:{id:true,name:true,code:true,sequence:true}},section:{select:{id:true,name:true,code:true,gradeId:true,academicYearId:true}},subject:{select:{id:true,name:true,code:true,subjectType:true}}};
async function context(actor,target){if(!actor||!["SUPER_ADMIN","SCHOOL_ADMIN"].includes(actor.role))fail("You do not have permission to manage teacher assignments",403,"FORBIDDEN");if(actor.role!=="SUPER_ADMIN"&&target)fail("School administrators cannot supply schoolId",400,"SCHOOL_ID_FORBIDDEN");const schoolId=actor.role==="SUPER_ADMIN"?target:actor.schoolId;if(!schoolId)fail("schoolId is required for platform administrators",400,"SCHOOL_REQUIRED");const school=await prisma.school.findUnique({where:{id:schoolId},select:{id:true,institutionType:true}});if(!school)fail("Institution not found",404,"NOT_FOUND");if(school.institutionType!=="SCHOOL")fail("School teacher assignments are available only for school institutions",403,"SCHOOL_ONLY");return schoolId;}
async function validateRelationships(d,schoolId){const [teacher,year,grade,section,subject,mapping]=await Promise.all([
 prisma.teacherProfile.findFirst({where:{id:d.teacherProfileId,schoolId,status:"ACTIVE",employee:{is:{schoolId,status:"ACTIVE",category:"TEACHING"}}},select:{id:true}}),
 prisma.academicYear.findFirst({where:{id:d.academicYearId,schoolId,status:"ACTIVE"},select:{id:true}}),
 prisma.grade.findFirst({where:{id:d.gradeId,schoolId,status:"ACTIVE",sequence:{gte:1,lte:12}},select:{id:true}}),
 prisma.section.findFirst({where:{id:d.sectionId,schoolId,gradeId:d.gradeId,academicYearId:d.academicYearId,status:"ACTIVE"},select:{id:true}}),
 prisma.subject.findFirst({where:{id:d.subjectId,schoolId,status:"ACTIVE"},select:{id:true}}),
 prisma.classSubject.findFirst({where:{schoolId,gradeId:d.gradeId,subjectId:d.subjectId,status:"ACTIVE"},select:{id:true}})
 ]);if(!teacher)fail("An active teaching employee with an active teacher profile is required",404,"TEACHER_NOT_FOUND");if(!year)fail("Active academic year not found",404,"ACADEMIC_YEAR_NOT_FOUND");if(!grade)fail("Active class 1–12 not found",404,"CLASS_NOT_FOUND");if(!section)fail("Section must be active and belong to the selected class and academic year",400,"INVALID_SECTION");if(!subject||!mapping)fail("Active subject must belong to this institution and be mapped to the selected class",400,"INVALID_SUBJECT");}
function dataOf(d,schoolId){return {...d,schoolId};}
async function create(input,actor,target){const schoolId=await context(actor,target);await validateRelationships(input,schoolId);const id=randomUUID();try{await prisma.schoolTeacherAssignment.createMany({data:[{...dataOf(input,schoolId),id}]});return await prisma.schoolTeacherAssignment.findFirst({where:{id,schoolId},include:includes});}catch(e){if(e.code==="P2002")fail("An active teacher assignment already exists for this class, section, subject and year",409,"DUPLICATE_ASSIGNMENT");throw e;}}
async function list(q, actor) {
  const schoolId = await context(actor, q.schoolId);
  const where = { schoolId };
  for (const key of ["teacherProfileId", "academicYearId", "gradeId", "sectionId", "subjectId", "status"]) if (q[key]) where[key] = q[key];
  const employeeFilter = {};
  if (q.employeeId) employeeFilter.id = q.employeeId;
  if (q.search) employeeFilter.OR = ["firstName", "lastName", "employeeId"].map((field) => ({ [field]: { contains: q.search, mode: "insensitive" } }));
  if (Object.keys(employeeFilter).length) where.teacherProfile = { is: { employee: { is: employeeFilter } } };
  const orderBy = q.sortBy === "employeeId" || q.sortBy === "lastName"
    ? { teacherProfile: { employee: { [q.sortBy]: q.sortOrder } } }
    : { [q.sortBy]: q.sortOrder };
  const [records, total] = await Promise.all([
    prisma.schoolTeacherAssignment.findMany({ where, include: includes, orderBy, skip: (q.page - 1) * q.limit, take: q.limit }),
    prisma.schoolTeacherAssignment.count({ where }),
  ]);
  return { records, page: q.page, pageSize: q.limit, total, totalPages: Math.ceil(total / q.limit) };
}
async function get(id,actor,target){const schoolId=await context(actor,target);const row=await prisma.schoolTeacherAssignment.findFirst({where:{id,schoolId},include:includes});if(!row)fail("Teacher assignment not found",404,"NOT_FOUND");return row;}
async function update(id,input,actor,target){const schoolId=await context(actor,target);const current=await prisma.schoolTeacherAssignment.findFirst({where:{id,schoolId},select:{id:true,teacherProfileId:true,academicYearId:true,gradeId:true,sectionId:true,subjectId:true,status:true}});if(!current)fail("Teacher assignment not found",404,"NOT_FOUND");const merged={teacherProfileId:current.teacherProfileId,academicYearId:current.academicYearId,gradeId:current.gradeId,sectionId:current.sectionId,subjectId:current.subjectId,...input};await validateRelationships(merged,schoolId);try{await prisma.schoolTeacherAssignment.updateMany({where:{id,schoolId},data:input});return get(id,actor,target);}catch(e){if(e.code==="P2002")fail("An active teacher assignment already exists for this class, section, subject and year",409,"DUPLICATE_ASSIGNMENT");throw e;}}
async function setStatus(id,status,actor,target){const schoolId=await context(actor,target);const current=await prisma.schoolTeacherAssignment.findFirst({where:{id,schoolId}});if(!current)fail("Teacher assignment not found",404,"NOT_FOUND");if(status==="ACTIVE")await validateRelationships(current,schoolId);try{const r=await prisma.schoolTeacherAssignment.updateMany({where:{id,schoolId},data:{status}});if(!r.count)fail("Teacher assignment not found",404,"NOT_FOUND");return get(id,actor,target);}catch(e){if(e.code==="P2002")fail("Cannot activate a duplicate teacher assignment",409,"DUPLICATE_ASSIGNMENT");throw e;}}
module.exports={context,validateRelationships,create,list,get,update,setStatus};
