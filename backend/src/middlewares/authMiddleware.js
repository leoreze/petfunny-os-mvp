import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';

function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

export async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token ausente.' });
    }

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }

    const result = await query(`
      SELECT id, name, email, role, permissions, is_active
      FROM users
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `, [payload.sub]);

    const user = result.rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Usuário inativo ou não encontrado.' });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: Array.isArray(user.permissions) ? user.permissions : ['full_access']
    };

    next();
  } catch (error) {
    next(error);
  }
}
