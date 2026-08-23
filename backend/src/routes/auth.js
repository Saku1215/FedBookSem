const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { read, write } = require('../graph/neo4j');

const router = express.Router();

const DOMAIN = () => process.env.DOMAIN || 'localhost:3001';
const BASE_URL = () => process.env.BASE_URL || 'http://localhost:3001';
const USERNAME_RE = /^[a-z0-9_]{3,30}$/i;

function signActor(actor) {
  return jwt.sign(actor, process.env.JWT_SECRET, { expiresIn: '7d' });
}

router.post('/login', async (req, res) => {
  const rawUsername = req.body.username;
  const password = req.body.password;
  if (!rawUsername || !password) return res.status(400).json({ error: 'username and password required' });

  // Register lowercases the username on write, so login must lowercase on
  // read too — otherwise "MixedCase" (typed here) never matches "mixedcase"
  // (stored) and every mixed-case account fails to log in.
  const username = String(rawUsername).trim().toLowerCase();

  const records = await read(
    'MATCH (p:Person {username: $username}) RETURN p',
    { username }
  );

  if (!records.length) return res.status(401).json({ error: 'Invalid credentials' });

  const p = records[0].get('p').properties;

  const valid = await bcrypt.compare(password, p.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const actor = {
    id: p.id,
    username: p.username,
    displayName: p.displayName,
    bio: p.bio,
    domain: p.domain,
    avatarUrl: p.avatarUrl || null,
  };

  const token = signActor(actor);
  res.json({ token, actor });
});

// POST /api/auth/register — creates a new local user and returns a JWT.
// Body: { username, password, displayName?, bio? }
// Constraints: username 3-30 chars [a-z0-9_], password >= 6 chars.
// Uniqueness is enforced by the CONSTRAINT on :Person(username) — a duplicate
// throws a Neo.ClientError.Schema.ConstraintValidationFailed which we catch
// and turn into a 409.
router.post('/register', async (req, res) => {
  const username = (req.body.username || '').trim().toLowerCase();
  const password = req.body.password || '';
  const displayName = (req.body.displayName || '').trim() || username;
  const bio = (req.body.bio || '').trim() || '';

  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters (letters, digits, underscore).' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const id = `${BASE_URL()}/users/${username}`;
    const domain = DOMAIN();

    await write(
      `CREATE (p:Person {
        id: $id,
        username: $username,
        displayName: $displayName,
        bio: $bio,
        domain: $domain,
        passwordHash: $passwordHash,
        avatarUrl: null,
        createdAt: datetime()
      })`,
      { id, username, displayName, bio, domain, passwordHash }
    );

    const actor = { id, username, displayName, bio, domain, avatarUrl: null };
    const token = signActor(actor);
    res.status(201).json({ token, actor });
  } catch (err) {
    if (err.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
    console.error('[register]', err);
    res.status(500).json({ error: 'Could not create account. Please try again.' });
  }
});

module.exports = router;
