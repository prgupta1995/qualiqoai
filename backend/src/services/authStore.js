const { randomUUID } = require('crypto');
const prisma = require('../utils/prisma');

const sessions = new Map();

function getUserModel() {
  if (!prisma.user) {
    const error = new Error(
      'Prisma User model is unavailable. Restart the backend after running `npx prisma generate`.',
    );
    error.status = 500;
    throw error;
  }

  return prisma.user;
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

async function findUserByEmail(email) {
  return getUserModel().findUnique({
    where: { email: String(email).trim().toLowerCase() },
  });
}

async function findUserById(id) {
  if (!id) {
    return null;
  }

  const user = await getUserModel().findUnique({
    where: { id },
  });

  return sanitizeUser(user);
}

async function createUser({ name, email, password }) {
  const user = await getUserModel().create({
    data: {
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      password: String(password),
    },
  });

  return sanitizeUser(user);
}

async function validateCredentials(email, password) {
  const user = await findUserByEmail(email);

  if (!user || user.password !== String(password)) {
    return null;
  }

  return sanitizeUser(user);
}

function createSession(user) {
  const token = `dummy-jwt-token-${user.id}-${randomUUID()}`;
  sessions.set(token, {
    userId: user.id,
    createdAt: new Date(),
  });
  return token;
}

async function validateSessionToken(token) {
  const sessionToken = String(token || '').trim();
  const session = sessions.get(sessionToken);

  if (session) {
    return findUserById(session.userId);
  }

  const tokenMatch = sessionToken.match(/^dummy-jwt-token-([0-9a-f-]{36})-/i);

  if (!tokenMatch) {
    return null;
  }

  return findUserById(tokenMatch[1]);
}

module.exports = {
  createSession,
  createUser,
  findUserByEmail,
  findUserById,
  sanitizeUser,
  validateCredentials,
  validateSessionToken,
};
