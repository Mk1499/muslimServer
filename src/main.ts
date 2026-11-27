// src/main.ts
import { createApp } from './create-app';

async function bootstrap() {
  const app = await createApp();
  const env = (
    globalThis as { process?: { env: Record<string, string | undefined> } }
  ).process?.env;
  await app.listen(env?.PORT ?? 3000);
}
void bootstrap();
