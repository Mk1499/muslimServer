/// <reference types="@cloudflare/workers-types" />
import 'reflect-metadata';
import { httpServerHandler } from 'cloudflare:node';
import { createApp } from './create-app';

const PORT = 3000;

let handler: ExportedHandler | undefined;
let ready: Promise<void> | undefined;

async function init(): Promise<void> {
  const app = await createApp();
  await app.listen(PORT);
  handler = httpServerHandler({ port: PORT });
}

export default {
  async fetch(request, env, ctx) {
    // Initialize once, reuse for later requests
    ready ??= init();
    await ready;
    return handler!.fetch!(request, env, ctx);
  },
} satisfies ExportedHandler;
