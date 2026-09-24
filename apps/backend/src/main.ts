import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(AppConfigService);

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix(config.apiPrefix, { exclude: ['docs'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Ride API')
    .setDescription(
      'API da plataforma de transporte sob demanda. Autenticacao por OTP (SMS/e-mail) com JWT + refresh token rotativo.',
    )
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addTag('Autenticacao')
    .addTag('Usuarios')
    .addTag('Motorista')
    .addTag('Documentos do motorista')
    .addTag('Veiculos do motorista')
    .addTag('Admin - Usuarios')
    .addTag('Admin - Motoristas')
    .addTag('Admin - Documentos')
    .addTag('Admin - Categorias e tarifas')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(config.port, config.host);

  logger.log(`API disponivel em ${config.apiUrl}/${config.apiPrefix}`);
  logger.log(`Documentacao Swagger em ${config.apiUrl}/docs`);
  if (config.isDevelopment) {
    logger.warn('Ambiente de desenvolvimento: OTP e impresso no log da API.');
  }
}

void bootstrap();
