// src/main.ts
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createApp } from './create-app';

async function bootstrap() {
  const app = await createApp();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Muslim Server API')
    .setDescription('Admin and public API.')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    // ... نفس الـ tags بتاعتك
    .build();

  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
    { swaggerOptions: { persistAuthorization: true } },
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
