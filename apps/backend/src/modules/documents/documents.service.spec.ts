import { DocumentsService } from './documents.service';

/**
 * Documentos do motorista: envio em duas etapas, conferencia da Central e troca de
 * documento (a versao aprovada nova substitui a antiga). Banco e storage de mentira.
 */
function montar(opcoes: { documento?: Record<string, unknown> | null; existeNoStorage?: boolean; completo?: boolean; statusDriver?: string } = {}) {
  const doc = opcoes.documento === undefined ? null : opcoes.documento;
  const prisma = {
    driver: {
      findUnique: jest.fn(async () => ({ id: 'd1', userId: 'u1', status: opcoes.statusDriver ?? 'PENDING' })),
      update: jest.fn(async () => ({})),
    },
    driverDocument: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'doc1', ...data })),
      findFirst: jest.fn(async (a: { where: { status?: string } }) => (a.where?.status === 'APPROVED' ? { fileUrl: '/arquivos/aprovada' } : doc)),
      findUnique: jest.fn(async () => doc),
      findMany: jest.fn(async () => [] as unknown[]),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...(doc ?? {}), ...data })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      delete: jest.fn(async () => ({})),
    },
    arquivo: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    user: {
      update: jest.fn(async () => ({})),
      findUnique: jest.fn(async () => ({ avatarUrl: '/arquivos/nova' })),
    },
  };
  const storage = {
    buildDocumentKey: jest.fn(() => 'docs/d1/CNH_FRONT/a.jpg'),
    createPresignedUpload: jest.fn(async () => ({ uploadUrl: 'https://armazenamento.exemplo/envio', expiresIn: 600, documentKey: 'docs/d1/CNH_FRONT/a.jpg' })),
    exists: jest.fn(async () => opcoes.existeNoStorage ?? true),
    delete: jest.fn(async () => undefined),
    createPresignedDownload: jest.fn(async () => 'https://armazenamento.exemplo/ver'),
  };
  const drivers = { getDocumentProgress: jest.fn(async () => ({ isComplete: opcoes.completo ?? false })) };
  const caixa = { avisarMotorista: jest.fn(async () => undefined) };
  return { servico: new DocumentsService(prisma as never, storage as never, drivers as never, caixa as never), prisma, storage, caixa, drivers };
}

const enviado = (extra: Record<string, unknown> = {}) => ({
  id: 'doc1',
  driverId: 'd1',
  type: 'CNH_FRONT',
  status: 'PENDING',
  fileKey: 'docs/d1/CNH_FRONT/a.jpg',
  fileUrl: null,
  mimeType: 'image/jpeg',
  sizeBytes: 1000,
  uploadedAt: new Date(),
  reviewedAt: null,
  rejectionReason: null,
  createdAt: new Date(),
  ...extra,
});

describe('Documentos do motorista', () => {
  it('pedir envio: cria o registro PENDENTE e devolve o link de envio com o mesmo Content-Type', async () => {
    const { servico, prisma } = montar();
    const r = await servico.requestUpload('u1', { type: 'CNH_FRONT', fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 } as never);
    expect(prisma.driverDocument.create).toHaveBeenCalledWith({ data: expect.objectContaining({ driverId: 'd1', status: 'PENDING' }) });
    expect(r.requiredHeaders).toEqual({ 'Content-Type': 'image/jpeg' });
    expect(r.uploadUrl).toContain('https://');
  });

  it('pedir envio sem cadastro de motorista: erro', async () => {
    const { servico, prisma } = montar();
    (prisma.driver.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(servico.requestUpload('u1', { type: 'CNH_FRONT', fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 1 } as never)).rejects.toThrow('Cadastro de motorista');
  });

  it('confirmar envio: recusa se o arquivo nao chegou ao storage', async () => {
    const { servico, prisma } = montar({ documento: enviado({ uploadedAt: null }), existeNoStorage: false });
    await expect(servico.confirmUpload('u1', 'doc1')).rejects.toThrow('Arquivo nao encontrado');
    expect(prisma.driverDocument.update).not.toHaveBeenCalled();
  });

  it('confirmar envio duas vezes nao refaz nada', async () => {
    const { servico, prisma } = montar({ documento: enviado() });
    await servico.confirmUpload('u1', 'doc1');
    expect(prisma.driverDocument.update).not.toHaveBeenCalled();
  });

  it('confirmar envio de documento de outro motorista: nao encontrado', async () => {
    const { servico } = montar({ documento: null });
    await expect(servico.confirmUpload('u1', 'doc-de-outro')).rejects.toThrow('Documento nao encontrado');
  });

  it('cadastro recusado volta para PENDENTE quando o ultimo documento completa a lista', async () => {
    const { servico, prisma } = montar({ documento: enviado({ uploadedAt: null }), completo: true, statusDriver: 'REJECTED' });
    await servico.confirmUpload('u1', 'doc1');
    expect(prisma.driver.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { status: 'PENDING' } });
  });

  it('aprovado ou ainda incompleto nao muda o status do cadastro', async () => {
    const { servico, prisma } = montar({ documento: enviado({ uploadedAt: null }), completo: false, statusDriver: 'REJECTED' });
    await servico.confirmUpload('u1', 'doc1');
    expect(prisma.driver.update).not.toHaveBeenCalled();
  });

  it('conferir: documento que o motorista nao enviou nao pode ser conferido', async () => {
    const { servico } = montar({ documento: enviado({ uploadedAt: null }) });
    await expect(servico.review('doc1', 'admin1', { status: 'APPROVED' } as never)).rejects.toThrow('ainda nao enviou');
  });

  it('conferir: documento que nao existe', async () => {
    const { servico } = montar({ documento: null });
    await expect(servico.review('x', 'admin1', { status: 'APPROVED' } as never)).rejects.toThrow('Documento nao encontrado');
  });

  it('aprovar: grava quem conferiu, avisa o motorista e tira a versao aprovada antiga', async () => {
    const { servico, prisma, caixa } = montar({ documento: enviado() });
    (prisma.driverDocument.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'velho', fileKey: 'arquivo-banco-1' }]);
    const r = await servico.review('doc1', 'admin1', { status: 'APPROVED' } as never);
    expect(prisma.driverDocument.update).toHaveBeenCalledWith({
      where: { id: 'doc1' },
      data: expect.objectContaining({ status: 'APPROVED', reviewedBy: 'admin1', rejectionReason: null }),
    });
    expect(prisma.driverDocument.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['velho'] } } });
    expect(caixa.avisarMotorista).toHaveBeenCalledWith('d1', 'CNH (frente): aprovado', expect.any(String), expect.objectContaining({ tipo: 'documento' }));
    expect(r).toHaveProperty('driverProgress');
  });

  it('reprovar: guarda o motivo e avisa com o motivo', async () => {
    const { servico, prisma, caixa } = montar({ documento: enviado({ type: 'CRLV' }) });
    await servico.review('doc1', 'admin1', { status: 'REJECTED', rejectionReason: 'Foto cortada' } as never);
    expect(prisma.driverDocument.update).toHaveBeenCalledWith({
      where: { id: 'doc1' },
      data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'Foto cortada' }),
    });
    expect(caixa.avisarMotorista).toHaveBeenCalledWith('d1', 'CRLV do carro: recusado', expect.stringContaining('Foto cortada'), expect.anything());
    // Reprovar nao apaga a versao aprovada antiga.
    expect(prisma.driverDocument.deleteMany).not.toHaveBeenCalled();
  });

  it('foto de perfil aprovada vira a foto que o passageiro ve', async () => {
    const { servico, prisma } = montar({ documento: enviado({ type: 'PROFILE_PHOTO', fileUrl: '/arquivos/nova' }) });
    await servico.review('doc1', 'admin1', { status: 'APPROVED' } as never);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { avatarUrl: '/arquivos/nova' } });
  });

  it('foto de perfil recusada volta para a ultima aprovada', async () => {
    const { servico, prisma } = montar({ documento: enviado({ type: 'PROFILE_PHOTO', fileUrl: '/arquivos/nova' }) });
    await servico.review('doc1', 'admin1', { status: 'REJECTED', rejectionReason: 'Escura' } as never);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { avatarUrl: '/arquivos/aprovada' } });
  });

  it('remover: documento aprovado nao sai; reprovado sai do storage e do banco', async () => {
    const aprovado = montar({ documento: enviado({ status: 'APPROVED' }) });
    await expect(aprovado.servico.removeMine('u1', 'doc1')).rejects.toThrow('aprovados nao podem');
    expect(aprovado.storage.delete).not.toHaveBeenCalled();

    const reprovado = montar({ documento: enviado({ status: 'REJECTED' }) });
    await reprovado.servico.removeMine('u1', 'doc1');
    expect(reprovado.storage.delete).toHaveBeenCalledWith('docs/d1/CNH_FRONT/a.jpg');
    expect(reprovado.prisma.driverDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc1' } });
  });

  it('listar os meus: foto guardada no banco mantem o endereco; as demais ganham link assinado', async () => {
    const { servico, prisma } = montar();
    (prisma.driverDocument.findMany as jest.Mock).mockResolvedValueOnce([
      enviado({ fileUrl: '/arquivos/abc' }),
      enviado({ id: 'doc2', fileUrl: null }),
    ]);
    const r = await servico.listMine('u1');
    expect(r.documents[0].fileUrl).toBe('/arquivos/abc');
    expect(r.documents[1].fileUrl).toBe('https://armazenamento.exemplo/ver');
  });
});
