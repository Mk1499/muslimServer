import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: ['http://localhost:8080', '*', 'https://muslimdb.lovable.app'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Muslim Server API')
    .setDescription(
      'Admin and public API. Import endpoints only create drafts; nothing is ' +
        'published automatically. Use the Authorize button with an admin ' +
        'access token to call protected routes.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the admin access token from POST /auth/login.',
      },
      'access-token',
    )
    .addTag(
      'Playlists',
      'Public playlists, including imported YouTube playlists',
    )
    .addTag('Videos', 'Video catalog and admin video management')
    .addTag('Speakers', 'Speakers and their published video counts')
    .addTag('Categories', 'Video categories')
    .addTag('Tags', 'Video tags')
    .addTag('Auth', 'Register, log in and inspect the current user')
    .addTag('Admin - Video imports', 'Manually trigger the channel importer')
    .addTag(
      'Admin - Playlist imports',
      'Manually trigger the playlist importer',
    )
    .addTag('Health', 'Service health check')
    .build();

  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
    {
      swaggerOptions: {
        persistAuthorization: true,
      },
    },
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
