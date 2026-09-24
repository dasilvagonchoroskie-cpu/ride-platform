import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Fluxo de autenticacao ponta a ponta.
 * Requer OTP_DEBUG_RETURN=true para receber o codigo na resposta.
 */
describe('Autenticacao (e2e)', () => {
  let app: INestApplication;
  const phone = `+55119${Math.floor(10000000 + Math.random() * 89999999)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('solicita OTP, autentica, acessa /auth/me e renova o token', async () => {
    const otpResponse = await request(app.getHttpServer())
      .post('/api/auth/otp/request')
      .send({ phone, purpose: 'LOGIN' })
      .expect(200);

    expect(otpResponse.body.success).toBe(true);
    const code = otpResponse.body.data.debugCode as string;
    expect(code).toMatch(/^\d{6}$/);

    const verifyResponse = await request(app.getHttpServer())
      .post('/api/auth/otp/verify')
      .send({
        phone,
        code,
        purpose: 'LOGIN',
        role: 'PASSENGER',
        device: { deviceId: 'e2e-device', platform: 'ANDROID' },
      })
      .expect(200);

    const { accessToken, refreshToken, user } = verifyResponse.body.data;
    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();
    expect(user.phone).toBe(phone);
    expect(verifyResponse.body.data.isNewUser).toBe(true);

    const meResponse = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meResponse.body.data.phone).toBe(phone);
    expect(meResponse.body.data.role).toBe('PASSENGER');

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(refreshResponse.body.data.accessToken).toBeDefined();

    // O refresh token antigo deve ter sido invalidado (rotacao de uso unico)
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('recusa OTP incorreto com codigo OTP_INVALID', async () => {
    const target = `+55119${Math.floor(10000000 + Math.random() * 89999999)}`;

    await request(app.getHttpServer())
      .post('/api/auth/otp/request')
      .send({ phone: target, purpose: 'LOGIN' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post('/api/auth/otp/verify')
      .send({ phone: target, code: '000000', purpose: 'LOGIN', role: 'PASSENGER' })
      .expect(401);

    expect(['OTP_INVALID', 'OTP_EXPIRED']).toContain(response.body.error.code);
  });

  it('bloqueia rota protegida sem token', async () => {
    const response = await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    expect(response.body.success).toBe(false);
  });
});
