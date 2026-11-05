const studentService = require("../services/student.service");

const createStudent = async (req, res, next) => {
  try { const student = await studentService.createStudent(req.body, req.user); res.status(201).json({ success: true, message: "Student admitted successfully", data: student }); }
  catch (error) { next(error); }
};
const getStudents = async (req, res, next) => {
  try { const data = await studentService.getStudents(req.validatedQuery, req.user); res.status(200).json({ success: true, ...data }); }
  catch (error) { next(error); }
};
const getStudentById = async (req, res, next) => {
  try { const student = await studentService.getStudentById(req.params.id, req.validatedQuery.schoolId, req.user); res.status(200).json({ success: true, data: student }); }
  catch (error) { next(error); }
};
const updateStudent = async (req, res, next) => {
  try { const student = await studentService.updateStudent(req.params.id, req.body, req.validatedQuery.schoolId, req.user); res.status(200).json({ success: true, message: "Student updated successfully", data: student }); }
  catch (error) { next(error); }
};
const changeStudentStatus = async (req, res, next) => {
  try { const student = await studentService.changeStudentStatus(req.params.id, req.body.status, req.validatedQuery.schoolId, req.user); res.status(200).json({ success: true, message: "Student status updated successfully", data: student }); }
  catch (error) { next(error); }
};
const deleteStudent = async (req, res, next) => {
  try { const student = await studentService.deleteStudent(req.params.id, req.validatedQuery.schoolId, req.user); res.status(200).json({ success: true, message: "Student deactivated successfully", data: student }); }
  catch (error) { next(error); }
};
const getMyStudentProfile = async (req, res, next) => {
  try { const student = await studentService.getStudentByPortalUser(req.user); res.status(200).json({ success: true, data: student }); }
  catch (error) { next(error); }
};

module.exports = { createStudent, getStudents, getStudentById, updateStudent, changeStudentStatus, deleteStudent, getMyStudentProfile };
