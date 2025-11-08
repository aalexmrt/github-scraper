import { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    githubOAuth2: {
      getAccessTokenFromAuthorizationCodeFlow(
        request: FastifyRequest
      ): Promise<{ token: { access_token: string } }>;
    };
  }

  interface FastifyRequest {
    session: {
      userId?: number;
      githubToken?: string;
      destroy(): Promise<void>;
    };
  }
}

