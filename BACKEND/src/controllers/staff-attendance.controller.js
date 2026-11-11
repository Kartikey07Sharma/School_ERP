const service = require("../services/staff-attendance.service");
const wrap = (fn, status = 200) => async (req, res, next) => { try { res.status(status).json({ success: true, data: await fn(req) }); } catch (error) { next(error); } };
module.exports = {
  roster: wrap((req) => service.roster(req.validatedQuery, req.user)),
  mark: wrap((req) => service.mark(req.body, req.user), 201),
  list: wrap((req) => service.list(req.validatedQuery, req.user)),
  history: wrap((req) => service.history(req.params.employeeId, req.validatedQuery, req.user)),
  checkIn: wrap((req) => service.checkIn(req.params.attendanceId, req.body, req.user)),
  checkOut: wrap((req) => service.checkOut(req.params.attendanceId, req.body, req.user)),
  correct: wrap((req) => service.correct(req.params.attendanceId, req.body, req.user)),
  audit: wrap((req) => service.audit(req.params.attendanceId, req.validatedQuery, req.user)),
  summary: wrap((req) => service.summary(req.validatedQuery, req.user)),
  report: wrap((req) => service.summary(req.validatedQuery, req.user)),
  me: wrap((req) => service.me(req.validatedQuery, req.user)),
  meSummary: wrap((req) => service.summary(req.validatedQuery, req.user, true)),
};
