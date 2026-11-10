const service=require("../services/employee.service");
const wrap=(fn,status=200)=>async(req,res,next)=>{try{const data=await fn(req);res.status(status).json({success:true,data});}catch(e){next(e);}};
module.exports={
 list:wrap(r=>service.listEmployees(r.validatedQuery,r.user)), create:wrap(r=>service.createEmployee(r.body,r.user,r.validatedQuery.schoolId),201), get:wrap(r=>service.getEmployee(r.params.id,r.user,r.validatedQuery.schoolId)), update:wrap(r=>service.updateEmployee(r.params.id,r.body,r.user,r.validatedQuery.schoolId)),
 listDepartments:wrap(r=>service.listLookups("departments",r.user,r.validatedQuery)), createDepartment:wrap(r=>service.createLookup("departments",r.body,r.user,r.validatedQuery.schoolId),201),
 listDesignations:wrap(r=>service.listLookups("designations",r.user,r.validatedQuery)), createDesignation:wrap(r=>service.createLookup("designations",r.body,r.user,r.validatedQuery.schoolId),201),
 updateDepartment:wrap(r=>service.updateLookup("departments",r.params.id,r.body,r.user,r.validatedQuery.schoolId)), updateDesignation:wrap(r=>service.updateLookup("designations",r.params.id,r.body,r.user,r.validatedQuery.schoolId)),
 createTeacher:wrap(r=>service.setTeacher(r.params.id,r.body,r.user,r.validatedQuery.schoolId),201), getTeacher:wrap(async r=>{const e=await service.getEmployee(r.params.id,r.user,r.validatedQuery.schoolId); if(!e.teacherProfile)throw Object.assign(new Error("Teacher profile not found"),{statusCode:404,code:"NOT_FOUND"}); return e.teacherProfile;}), updateTeacher:wrap(async r=>{await service.setTeacher(r.params.id,r.body,r.user,r.validatedQuery.schoolId,false);return (await service.getEmployee(r.params.id,r.user,r.validatedQuery.schoolId)).teacherProfile;}),
 link:wrap(r=>service.link(r.params.id,r.body.userId,r.user,r.validatedQuery.schoolId)), unlink:wrap(r=>service.link(r.params.id,null,r.user,r.validatedQuery.schoolId,true)),
};
