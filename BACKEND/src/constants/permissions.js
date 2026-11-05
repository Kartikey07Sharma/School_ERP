const ROLE = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  SCHOOL_ADMIN: "SCHOOL_ADMIN",
  TEACHER: "TEACHER",
  STUDENT: "STUDENT",
  PARENT: "PARENT",
});

const PERMISSIONS = Object.freeze({
  [ROLE.SUPER_ADMIN]: Object.freeze([
    "schools:manage",
    "users:read:any",
    "users:create:school-members",
    "users:update:any",
    "users:status:any",
    "users:deactivate:any",
    "students:read:any",
    "students:manage:any",
  ]),
  [ROLE.SCHOOL_ADMIN]: Object.freeze([
    "users:read:school",
    "users:create:school-members",
    "users:update:school-members",
    "users:status:school-members",
    "users:deactivate:school-members",
    "students:read:school",
    "students:manage:school",
  ]),
  [ROLE.TEACHER]: Object.freeze([]),
  [ROLE.STUDENT]: Object.freeze([]),
  [ROLE.PARENT]: Object.freeze([]),
});

function hasPermission(role, permission) {
  return Boolean(PERMISSIONS[role]?.includes(permission));
}

module.exports = { ROLE, PERMISSIONS, hasPermission };
