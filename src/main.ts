// src/main.ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, configureSwagger } from './create-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  configureSwagger(app);

  // Vercel injects PORT; keep the global access typed for Node/Worker builds.
  const env = (
    globalThis as { process?: { env: Record<string, string | undefined> } }
  ).process?.env;
  await app.listen(env?.PORT ?? 3000);
}
void bootstrap();
