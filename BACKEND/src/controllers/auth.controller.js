const authService = require("../services/auth.service");
const { refreshTokenParts } = require("../services/auth.service");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const crypto = require("node:crypto");

const COOKIE_NAME = "refreshToken";
const COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: env.AUTH_COOKIE_SECURE,
  sameSite: "strict",
  path: "/api/v1/auth",
});

function setRefreshCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    ...COOKIE_OPTIONS,
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && require("node:crypto").timingSafeEqual(a, b);
}

function tokenResponse(res, result) {
  setRefreshCookie(res, result.refreshToken);
  return res.status(200).json({
    success: true,
    data: {
      accessToken: result.accessToken,
      tokenType: "Bearer",
      expiresIn: result.expiresIn,
      csrfToken: result.csrfToken,
      user: result.user,
    },
  });
}

const login = async (req, res, next) => {
  try {
    return tokenResponse(res, await authService.login(req.body.email, req.body.password));
  } catch (error) {
    return next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const result = await authService.refresh(
      req.cookies?.[COOKIE_NAME],
      req.get("x-csrf-token"),
    );
    return tokenResponse(res, result);
  } catch (error) {
    clearRefreshCookie(res);
    return next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const requestCsrfHash = req.get("x-csrf-token")
      ? crypto.createHash("sha256").update(req.get("x-csrf-token")).digest("hex")
      : undefined;
    const cookieSession = refreshTokenParts(req.cookies?.[COOKIE_NAME]);
    if (req.cookies?.[COOKIE_NAME] && (cookieSession?.sid !== req.auth.sessionId || !constantTimeEqual(req.auth.csrfHash, requestCsrfHash))) {
      throw new AppError("A valid CSRF token is required", 403, "CSRF_REJECTED");
    }
    await authService.logout(req.user.id, req.auth.sessionId);
    clearRefreshCookie(res);
    return res.status(200).json({ success: true, message: "Logged out" });
  } catch (error) {
    return next(error);
  }
};

const me = (req, res) => res.status(200).json({ success: true, data: { user: req.user } });

const changePassword = async (req, res, next) => {
  try {
    await authService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
    if (refreshTokenParts(req.cookies?.[COOKIE_NAME])?.sid === req.auth.sessionId) clearRefreshCookie(res);
    return res.status(200).json({ success: true, message: "Password changed; sign in again" });
  } catch (error) {
    return next(error);
  }
};

module.exports = { login, refresh, logout, me, changePassword, COOKIE_NAME, COOKIE_OPTIONS, tokenResponse };
