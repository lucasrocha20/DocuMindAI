import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

// The API docs describe every endpoint, so they are off in production unless
// explicitly enabled.
function swaggerEnabled(): boolean {
  if (process.env.ENABLE_SWAGGER !== undefined) return process.env.ENABLE_SWAGGER === 'true';
  return process.env.NODE_ENV !== 'production';
}

// Everything main.ts configures beyond the modules, kept here so tests can
// apply exactly the same setup.
export function configureApp(app: NestExpressApplication): void {
  // Without this, SIGTERM (every deploy/restart) kills the process without running
  // shutdown hooks: the DB isn't disconnected and the worker doesn't finish its
  // active job before exiting.
  app.enableShutdownHooks();

  // Only trust X-Forwarded-For when told how many proxies are in front; trusting it
  // blindly would let any client pick its own IP and sidestep rate limiting.
  if (process.env.TRUST_PROXY !== undefined) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY));
  }

  // Sets nosniff, frame and referrer policies, and removes X-Powered-By. The CSP is
  // off because this API serves JSON, and Swagger UI (development only) needs inline scripts.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  });

  if (swaggerEnabled()) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('DocuMind AI API')
      .setDescription('Upload invoice PDFs and query the structured data extracted from them.')
      .setVersion('1.0')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }
}
