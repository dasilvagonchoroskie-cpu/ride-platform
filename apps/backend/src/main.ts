import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false, bodyParser: false });
  // Fotos (perfil, documentos, carro e logotipos) chegam em base64: ate
  // 4 MB so nas rotas de envio de foto (terminam em /foto ou /logo). O
  // resto aceita ate 256 KB (auditoria de 06/11/2026: corpo gigante de
  // lixo nao derruba o servidor).
  const fotoGrande = express.json({ limit: '4mb' });
  const corpoNormal = express.json({ limit: '256kb' });
  // Formularios das paginas publicas (ex.: pedido de exclusao da conta).
  const formulario = express.urlencoded({ extended: false, limit: '64kb' });
  // Corpo grande demais (413) ou JSON quebrado (400): responde na hora com a
  // mensagem de sempre, sem virar "erro interno" (500).
  const lerCorpo =
    (leitor: express.RequestHandler) => (req: express.Request, res: express.Response, next: express.NextFunction) =>
      leitor(req, res, (erro?: unknown) => {
        const e = erro as { status?: number; type?: string } | undefined;
        if (!e) return next();
        if (e.status === 413 || e.type === 'entity.too.large') {
          return res.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Envio grande demais.' } });
        }
        if (e.status === 400) {
          return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Dados enviados em formato invalido.' } });
        }
        return next(erro);
      });
  app.use(lerCorpo(formulario));
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) =>
    lerCorpo(/\/(foto|logo)\/?$/.test(req.path) ? fotoGrande : corpoNormal)(req, res, next),
  );
  const config = app.get(AppConfigService);

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(compression());
  app.use(cookieParser());

  // Os aplicativos nao usam cookie: "credentials" so com origens listadas.
  const todas = config.corsOrigins.includes('*');
  app.enableCors({
    origin: todas ? true : config.corsOrigins,
    credentials: !todas,
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

  // Mapa completo da API so fora da producao (auditoria de 06/11/2026).
  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(config.port, config.host);

  logger.log(`API disponivel em ${config.apiUrl}/${config.apiPrefix}`);
  if (!config.isProduction) logger.log(`Documentacao Swagger em ${config.apiUrl}/docs`);
  if (config.isDevelopment) {
    logger.warn('Ambiente de desenvolvimento: OTP e impresso no log da API.');
  }
}

void bootstrap();
