import { AuthService } from '../auth/auth.service';
import { LEGAL_VERSION, PRIVACY_MD, TERMS_MD, VERSOES_PUBLICADAS } from './legal-content';

const usuario = (extra: Record<string, unknown> = {}) => ({
  id: 'u1',
  role: 'PASSENGER',
  name: 'Ana',
  phone: '+5564999990001',
  email: 'ana@exemplo.com',
  avatarUrl: null,
  status: 'ACTIVE',
  driver: null,
  metadata: {},
  cpf: null,
  passwordHash: null,
  termsAcceptedAt: null,
  termsVersion: null,
  ...extra,
});

function montar(atual: ReturnType<typeof usuario>) {
  const registros: any[] = [];
  const gravados: any[] = [];
  const prisma = {
    user: {
      update: async ({ data }: any) => {
        gravados.push(data);
        return { ...atual, ...data };
      },
    },
    auditLog: { create: async ({ data }: any) => registros.push(data) },
  };
  const auth = Object.create(AuthService.prototype) as AuthService;
  Object.assign(auth, { prisma });
  return { auth, registros, gravados };
}

const retrato = (auth: AuthService, u: unknown) => (auth as any).paraUsuario(u);

describe('Aceite dos Termos', () => {
  it('os textos mostram a versao vigente e quem responde por eles', () => {
    for (const texto of [TERMS_MD, PRIVACY_MD]) {
      expect(texto).toContain(`Versão ${LEGAL_VERSION}`);
      expect(texto).toContain('Evandro da Silva Gonchoroski');
      expect(texto).toContain('exigem novo aceite');
      expect(texto).not.toContain('CNPJ em registro');
    }
    expect(VERSOES_PUBLICADAS).toContain(LEGAL_VERSION);
  });

  it('quem nunca aceitou nao aparece como desatualizado (cai no primeiro aceite)', () => {
    const { auth } = montar(usuario());
    expect(retrato(auth, usuario())).toMatchObject({ termsAccepted: false, termosDesatualizados: false });
  });

  it('quem aceitou uma versao antiga precisa aceitar de novo', () => {
    const u = usuario({ termsAcceptedAt: new Date(), termsVersion: '1.1.0' });
    const { auth } = montar(u);
    expect(retrato(auth, u)).toMatchObject({ termsAccepted: true, termosDesatualizados: true });
  });

  it('aceitar a versao vigente resolve e fica registrado', async () => {
    const { auth, registros, gravados } = montar(usuario({ termsAcceptedAt: new Date(), termsVersion: '1.1.0' }));
    const r = await auth.acceptTerms('u1', LEGAL_VERSION);
    expect(r).toMatchObject({ termsAccepted: true, termsVersion: LEGAL_VERSION, termosDesatualizados: false });
    expect(gravados).toHaveLength(1);
    expect(registros).toEqual([
      expect.objectContaining({ actorId: 'u1', action: 'TERMOS_ACEITOS', after: { versao: LEGAL_VERSION } }),
    ]);
  });

  it('aplicativo antigo registra a versao dele e continua desatualizado', async () => {
    const { auth } = montar(usuario());
    const r = await auth.acceptTerms('u1', '1.1.0');
    expect(r).toMatchObject({ termsAccepted: true, termosDesatualizados: true });
  });

  it.each(['', '9.9.9', '1.2', 'vigente'])('recusa versao que nunca foi publicada (%p) sem gravar nada', async (versao) => {
    const { auth, registros, gravados } = montar(usuario());
    await expect(auth.acceptTerms('u1', versao)).rejects.toThrow();
    expect(gravados).toHaveLength(0);
    expect(registros).toHaveLength(0);
  });
});
