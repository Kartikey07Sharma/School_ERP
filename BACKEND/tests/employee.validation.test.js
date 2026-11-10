const test=require("node:test");
const assert=require("node:assert/strict");
const {employeeSchema,updateEmployeeSchema,teacherSchema,querySchema}=require("../src/validations/employee.validation");
const base={employeeId:"EMP-001",category:"TEACHING",firstName:"Asha",lastName:"Rao",phone:"9876543210",joiningDate:"2026-06-01",designationId:"d2719f64-d5c1-4e09-b8de-d50ec169f271"};
test("employee input accepts a minimal teaching employee without a login",()=>{const r=employeeSchema.safeParse(base);assert.equal(r.success,true);assert.equal("userId" in r.data,false);});
test("employee input rejects invalid category, dates, and unsupported fields",()=>{assert.equal(employeeSchema.safeParse({...base,category:"STAFF"}).success,false);assert.equal(employeeSchema.safeParse({...base,relievingDate:"2026-05-01"}).success,false);assert.equal(employeeSchema.safeParse({...base,password:"secret"}).success,false);});
test("employee updates reject empty payloads and unsupported fields",()=>{assert.equal(updateEmployeeSchema.safeParse({}).success,false);assert.equal(updateEmployeeSchema.safeParse({userId:"id"}).success,false);});
test("teacher profile and employee list filters validate bounds",()=>{assert.equal(teacherSchema.safeParse({experienceYears:3}).success,true);assert.equal(teacherSchema.safeParse({experienceYears:-1}).success,false);assert.equal(querySchema.safeParse({limit:"101"}).success,false);});
