import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from './create-app';

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

let cachedHandler: Handler | undefined;

/**
 * One Nest app per serverless instance. Vercel calls the exported function for
 * every request; the Express instance behind it is reused after the first call.
 */
async function getHandler(): Promise<Handler> {
  if (!cachedHandler) {
    const app = await createApp();
    await app.init();
    cachedHandler = app.getHttpAdapter().getInstance() as Handler;
  }

  return cachedHandler;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const app = await getHandler();
  return app(req, res);
}
