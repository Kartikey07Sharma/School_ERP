const service = require("../services/attendance.service");
const send = (fn) => async (req, res, next) => { try { res.json({ success: true, data: await fn(req) }); } catch (e) { next(e); } };
module.exports = {
  schoolRoster: send((r) => service.schoolRoster(r.validatedQuery, r.user)),
  schoolMark: send((r) => service.markSchool(r.body, r.user)),
  schoolList: send((r) => service.list("school", r.validatedQuery, r.user)),
  schoolHistory: send((r) => service.history("school", r.params.studentId, r.user, r.validatedQuery)),
  schoolCorrection: send((r) => service.correct("school", r.params.attendanceId, r.body, r.user)),
  schoolSummary: send((r) => service.report("school", r.validatedQuery, r.user)),
  schoolReport: send((r) => service.report("school", r.validatedQuery, r.user)),
  collegeCreateSession: send((r) => service.createCollegeSession(r.body, r.user)),
  collegeSessions: send((r) => service.sessions(r.validatedQuery, r.user)),
  collegeSession: send(async (r) => { const { session } = await service.sessionFor(r.user, r.params.sessionId, r.validatedQuery.schoolId); return session; }),
  collegeRoster: send((r) => service.collegeRoster(r.user, r.params.sessionId, r.validatedQuery.schoolId)),
  collegeMark: send((r) => service.markCollege(r.user, r.params.sessionId, r.body)),
  collegeList: send((r) => service.list("college", r.validatedQuery, r.user)),
  collegeHistory: send((r) => service.history("college", r.params.studentId, r.user, r.validatedQuery)),
  collegeCorrection: send((r) => service.correct("college", r.params.attendanceId, r.body, r.user)),
  collegeSummary: send((r) => service.report("college", r.validatedQuery, r.user)),
  collegeReport: send((r) => service.report("college", r.validatedQuery, r.user)),
};
