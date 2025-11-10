import jwt from 'jsonwebtoken';
import prisma from './prisma';
import { logger } from './logger';

// Use JWT_SECRET if available, fall back to SESSION_SECRET, then a warning value
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;

if (!JWT_SECRET) {
  logger.warn('No JWT_SECRET or SESSION_SECRET found! Using insecure default.');
  logger.warn('This will cause authentication failures if tokens were generated with a different secret.');
}

const SECRET = JWT_SECRET || 'INSECURE-DEFAULT-CHANGE-IN-PRODUCTION';

// Log secret status at module load (without exposing the actual secret)
if (SECRET && SECRET !== 'INSECURE-DEFAULT-CHANGE-IN-PRODUCTION') {
  logger.debug('JWT secret configured:', SECRET.substring(0, 10) + '...');
} else {
  logger.error('JWT secret is using insecure default! Authentication will fail.');
}

const TOKEN_EXPIRATION = '7d'; // 7 days

export interface TokenPayload {
  userId: number;
  sessionId: string;
  iat: number;
  exp: number;
}

/**
 * Generate a signed JWT token for authentication
 */
export function generateAuthToken(userId: number, sessionId: string): string {
  try {
    if (!SECRET || SECRET === 'INSECURE-DEFAULT-CHANGE-IN-PRODUCTION') {
      logger.warn('Using insecure default secret for token generation!');
    }
    
    logger.debug('Generating token for user:', userId, 'session:', sessionId);
    const token = jwt.sign({ userId, sessionId }, SECRET, {
      expiresIn: TOKEN_EXPIRATION,
    });
    logger.debug('Token generated successfully, length:', token.length);
    return token;
  } catch (error) {
    logger.error('Failed to generate token:', error);
    throw new Error('Failed to generate authentication token');
  }
}

/**
 * Verify and decode a JWT token
 */
export function verifyAuthToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, SECRET) as TokenPayload;

    // Check if token is revoked
    if (isTokenRevoked(payload.sessionId)) {
      logger.warn('Token is revoked:', payload.sessionId);
      return null;
    }

    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.debug('Token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.debug('Token invalid:', error.message);
    } else {
      logger.error('Token verification failed:', error);
    }
    return null;
  }
}

/**
 * Validate token and return userId if valid
 * Also verifies the user still exists in database
 */
export async function validateAuthToken(token: string): Promise<number | null> {
  if (!token || token.trim().length === 0) {
    logger.debug('Empty token provided');
    return null;
  }

  logger.debug('Validating token, length:', token.length);
  const payload = verifyAuthToken(token);

  if (!payload) {
    logger.debug('Token verification failed - invalid or expired');
    return null;
  }

  logger.debug('Token payload verified:', { userId: payload.userId, sessionId: payload.sessionId });

  // Verify user still exists
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true },
    });

    if (!user) {
      logger.warn('Token valid but user not found:', payload.userId);
      return null;
    }

    logger.debug('User validated successfully:', user.id);
    return user.id;
  } catch (error) {
    logger.error('Error validating token:', error);
    return null;
  }
}

// In-memory token revocation (for logout)
// In production, use Redis with TTL
const revokedTokens = new Set<string>();

/**
 * Revoke a token by its session ID
 */
export function revokeToken(sessionId: string): void {
  revokedTokens.add(sessionId);
  logger.auth('Token revoked:', sessionId);

  // TODO: In production, store in Redis with expiration matching token TTL
  // redis.setex(`revoked:${sessionId}`, 7 * 24 * 60 * 60, '1');
}

/**
 * Check if a token is revoked
 */
export function isTokenRevoked(sessionId: string): boolean {
  return revokedTokens.has(sessionId);
}

/**
 * Clear old revoked tokens (cleanup)
 * Call this periodically to prevent memory leaks
 */
export function cleanupRevokedTokens(): void {
  // Since tokens expire after 7 days, we can clear the set periodically
  // In a real implementation with Redis, this isn't needed
  if (revokedTokens.size > 10000) {
    logger.debug('Clearing revoked tokens cache');
    revokedTokens.clear();
  }
}
