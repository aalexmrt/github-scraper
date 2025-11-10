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
      id?: string;
      destroy(): Promise<void>;
      save(): Promise<void>;
    };
  }
}

