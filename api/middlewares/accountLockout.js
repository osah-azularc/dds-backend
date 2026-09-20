// Simple in-memory account lockout utility and Express middleware.
// NOTE: This is an in-memory store meant for quick mitigation. Use DB/Redis for production persistence.

const DEFAULT_MAX_ATTEMPTS = parseInt(
  process.env.LOCKOUT_MAX_ATTEMPTS || "5",
  10
);
const DEFAULT_LOCKOUT_MS = parseInt(
  process.env.LOCKOUT_DURATION_MS || String(15 * 60 * 1000),
  10
); // 15 minutes default

const lockoutMap = new Map(); // email => { count, lockedUntil }

const getState = (email) =>
  lockoutMap.get(email) || { count: 0, lockedUntil: 0 };

const recordFailedAttempt = (email) => {
  const state = getState(email);
  const now = Date.now();
  if (state.lockedUntil && state.lockedUntil > now) {
    // already locked
    lockoutMap.set(email, state);
    return;
  }

  const newCount = state.count + 1;
  let lockedUntil = 0;
  if (newCount >= DEFAULT_MAX_ATTEMPTS) {
    lockedUntil = now + DEFAULT_LOCKOUT_MS;
  }

  lockoutMap.set(email, { count: newCount, lockedUntil });
};

const resetAttempts = (email) => {
  lockoutMap.delete(email);
};

const isLocked = (email) => {
  const state = getState(email);
  return state.lockedUntil && state.lockedUntil > Date.now();
};

// Express middleware to block attempts when account is locked
const accountLockoutMiddleware = (req, res, next) => {
  const { username } = req.body;
  if (!username) return next();
  const email = `${username}@osah.ga.gov`;
  if (isLocked(email)) {
    return res
      .status(429)
      .json({
        success: false,
        message: "Too many login attempts, try again later",
      });
  }
  next();
};

export { accountLockoutMiddleware, recordFailedAttempt, resetAttempts, isLocked };
