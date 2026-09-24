import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Fluxo do motorista: cadastro -> documentos -> aprovacao pelo admin -> online.
 * Requer o banco migrado, semeado e o storage (MinIO) configurado.
 */
describe('Onboarding de motorista (e2e)', () => {
  let app: INestApplication;
  let driverToken: string;
  let adminToken: string;
  let driverId: string;

  const phone = `+55119${Math.floor(10000000 + Math.random() * 89999999)}`;
  const cpf = '52998224725'; // CPF valido para testes
  const cnh = `${Math.floor(10000000000 + Math.random() * 89999999999)}`;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    // Login do admin semeado
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/password/login')
      .send({ email: 'admin@ride.local', password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123' })
      .expect(200);
    adminToken = adminLogin.body.data.accessToken;

    // Login do motorista via OTP
    const otp = await request(app.getHttpServer())
      .post('/api/auth/otp/request')
      .send({ phone, purpose: 'LOGIN' })
      .expect(200);

    const login = await request(app.getHttpServer())
      .post('/api/auth/otp/verify')
      .send({ phone, code: otp.body.data.debugCode, purpose: 'LOGIN', role: 'DRIVER' })
      .expect(200);

    driverToken = login.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('cria o cadastro de motorista e a carteira virtual', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/drivers/onboarding')
      .set(auth(driverToken))
      .send({
        cpf,
        birthDate: '1990-05-20',
        cnhNumber: cnh,
        cnhCategory: 'B',
        cnhExpiresAt: '2030-12-31',
      })
      .expect(201);

    expect(response.body.data.status).toBe('PENDING');
    expect(response.body.data.wallet).toBeTruthy();
    expect(response.body.data.wallet.balanceCents).toBe(0);
    expect(response.body.data.progress.isComplete).toBe(false);
    driverId = response.body.data.id;
  });

  it('recusa ficar online antes da aprovacao', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/drivers/me/online')
      .set(auth(driverToken))
      .send({ isOnline: true })
      .expect(403);

    expect(response.body.error.code).toBe('DRIVER_NOT_APPROVED');
  });

  it('gera URL assinada de upload e recusa confirmacao sem arquivo no storage', async () => {
    const upload = await request(app.getHttpServer())
      .post('/api/documents/upload-url')
      .set(auth(driverToken))
      .send({ type: 'CNH_FRONT', fileName: 'cnh.jpg', mimeType: 'image/jpeg', sizeBytes: 204800 })
      .expect(201);

    expect(upload.body.data.uploadUrl).toContain('http');
    expect(upload.body.data.documentId).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/documents/confirm')
      .set(auth(driverToken))
      .send({ documentId: upload.body.data.documentId })
      .expect(422);
  });

  it('lista o motorista na fila do admin com o progresso de documentos', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/admin/drivers?status=PENDING&search=${encodeURIComponent(phone)}`)
      .set(auth(adminToken))
      .expect(200);

    expect(response.body.data.meta.total).toBeGreaterThanOrEqual(1);
    expect(response.body.data.items[0].id).toBe(driverId);
    expect(response.body.data.items[0].progress.missing.length).toBeGreaterThan(0);
  });

  it('impede aprovar o motorista com documentos pendentes', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/admin/drivers/${driverId}/review`)
      .set(auth(adminToken))
      .send({ status: 'APPROVED' })
      .expect(422);

    expect(response.body.error.code).toBe('DOCUMENTS_INCOMPLETE');
  });
});
