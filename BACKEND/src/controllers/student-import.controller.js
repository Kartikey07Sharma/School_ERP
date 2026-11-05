const studentImportService = require("../services/student-import.service");

const preview = async (req, res, next) => {
  try {
    const data = await studentImportService.preview(
      req.file.buffer,
      req.user,
      req.validatedImportQuery.schoolId,
      req.body
    );
    return res.status(200).json({ success: true, message: "CSV preview completed", data });
  } catch (error) {
    return next(error);
  }
};

const importStudents = async (req, res, next) => {
  try {
    const data = await studentImportService.importStudents(
      req.file.buffer,
      req.user,
      req.validatedImportQuery.schoolId,
      req.body
    );
    if (data.summary.databaseFailure) {
      return res.status(207).json({
        success: false,
        message: "Student import returned a partial report because of database errors",
        error: { code: "STUDENT_IMPORT_DATABASE_FAILURE", message: "Some rows could not be imported because of a database error" },
        data,
      });
    }
    return res.status(200).json({ success: true, message: "Student import completed", data });
  } catch (error) {
    return next(error);
  }
};

module.exports = { preview, importStudents };
