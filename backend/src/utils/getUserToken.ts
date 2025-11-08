/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest } from 'fastify';
import prisma from '../utils/prisma';

/**
 * Get the GitHub access token for the authenticated user from the session.
 * Falls back to environment variable GITHUB_TOKEN if user is not authenticated.
 * 
 * @param request Fastify request object
 * @returns GitHub access token or null
 */
export async function getUserToken(request: FastifyRequest): Promise<string | null> {
  const userId = request.session?.userId;

  if (userId) {
    // User is authenticated, get their token from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { accessToken: true },
    });

    if (user?.accessToken) {
      return user.accessToken;
    }
  }

  // Fall back to environment variable token (for backward compatibility)
  return process.env.GITHUB_TOKEN || null;
}

