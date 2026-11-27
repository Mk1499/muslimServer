/// <reference types="@cloudflare/workers-types" />
import 'reflect-metadata';
import { httpServerHandler } from 'cloudflare:node';
import { createApp } from './create-app';

const PORT = 3000;

async function init(): Promise<ExportedHandler> {
  const app = await createApp();
  await app.listen(PORT);
  return httpServerHandler({ port: PORT });
}

// Create startup work while the Worker module is being initialized, not in a
// fetch request. Sharing a promise created by one request can produce a
// cross-request promise resolution error when startup outlives that request.
const handlerReady = init();

export default {
  async fetch(request, env, ctx) {
    const handler = await handlerReady;
    return handler.fetch!(request, env, ctx);
  },
} satisfies ExportedHandler;
