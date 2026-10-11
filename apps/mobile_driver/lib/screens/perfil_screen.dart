import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/fotos.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../state/driver_state.dart';
import 'meus_dados_screen.dart';

/// Os documentos que a Central confere (as fotos ficam guardadas no
/// servidor e aparecem na Central para aprovar ou rejeitar). A foto do carro
/// tambem aparece para o passageiro na tela "motorista a caminho".
const documentosDoMotorista = [
  ('CNH_FRONT', 'CNH', Icons.badge_outlined),
  ('CRLV', 'CRLV do veículo', Icons.description_outlined),
  ('PROFILE_PHOTO', 'Foto de perfil', Icons.face_outlined),
  ('VEHICLE_FRONT', 'Foto do carro (de frente, com a placa)', Icons.directions_car_outlined),
  ('CRIMINAL_RECORD', 'Antecedentes criminais', Icons.gavel_outlined),
];

/// Perfil e Documentos: dados, situacao do cadastro, envio das fotos dos
/// documentos, troca de senha e Sair.
class PerfilScreen extends StatefulWidget {
  const PerfilScreen({super.key});

  @override
  State<PerfilScreen> createState() => _PerfilScreenState();
}

class _PerfilScreenState extends State<PerfilScreen> {
  Map<String, dynamic>? _motorista;
  String? _erro;

  /// Ultima foto de perfil enviada e se ja existe uma aprovada.
  Map<String, dynamic>? _ultimaFoto;
  bool _temFotoAprovada = false;
  bool _enviandoFoto = false;

  /// Muda quando a foto e trocada: a lista de documentos recarrega.
  int _versao = 0;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    final api = context.read<DriverState>().api;
    try {
      final r = await api.request('GET', '/drivers/me') as Map<String, dynamic>;
      if (mounted) setState(() => _motorista = r);
    } catch (e) {
      if (mounted) setState(() => _erro = e is ApiException ? e.message : '$e');
    }
    await _carregarFoto();
  }

  Future<void> _carregarFoto() async {
    if (!mounted) return;
    try {
      final r = await context.read<DriverState>().api.request('GET', '/documents/me') as Map<String, dynamic>;
      final fotos = [
        for (final d in (r['documents'] as List? ?? const []).whereType<Map<String, dynamic>>())
          if (d['type'] == 'PROFILE_PHOTO') d,
      ];
      if (!mounted) return;
      setState(() {
        _ultimaFoto = fotos.isEmpty ? null : fotos.first;
        _temFotoAprovada = fotos.any((d) => d['status'] == 'APPROVED');
      });
    } catch (_) {
      // Sem cadastro ainda ou sem rede: fica sem o aviso da foto.
    }
  }

  /// Toque na foto: camera ou galeria, e manda para o servidor.
  Future<void> _trocarFoto() async {
    final driver = context.read<DriverState>();
    final foto = await escolherFoto(context, titulo: 'Foto de perfil');
    if (foto == null || !mounted) return;
    setState(() => _enviandoFoto = true);
    try {
      final aguarda = await driver.trocarFotoDePerfil(mime: foto.mime, base64: foto.base64);
      avisar(aguarda
          ? 'Foto enviada. Os passageiros continuam vendo a foto atual até a Central conferir a nova.'
          : 'Foto enviada. A Central vai conferir.');
      await _carregarFoto();
      if (mounted) setState(() => _versao++);
    } on ApiException catch (e) {
      avisar(e.message);
    } catch (_) {
      avisar('Sem conexão com o servidor.');
    } finally {
      if (mounted) setState(() => _enviandoFoto = false);
    }
  }

  /// O que mostrar embaixo da foto.
  (String, Color) _situacaoDaFoto(String? fotoUrl) {
    final ultima = _ultimaFoto;
    final status = '${ultima?['status'] ?? ''}';
    if (status == 'PENDING' && _temFotoAprovada) {
      return ('Foto nova aguardando a Central conferir. Até lá, os passageiros veem a foto atual.', AppColors.warning);
    }
    if (status == 'PENDING') return ('Foto enviada: a Central vai conferir.', AppColors.warning);
    if (status == 'REJECTED') {
      final motivo = ultima?['rejectionReason'] as String?;
      return ('A Central recusou a última foto${motivo == null ? '' : ': $motivo'}. Toque na foto para mandar outra.', AppColors.danger);
    }
    if (fotoUrl == null) return ('Toque no círculo para pôr sua foto. O passageiro vê a sua foto para reconhecer você.', AppColors.textMuted);
    return ('Toque na foto para trocar.', AppColors.textMuted);
  }

  Future<void> _trocarSenha() async {
    final atual = TextEditingController();
    final nova = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Alterar senha'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: atual, obscureText: true, decoration: const InputDecoration(labelText: 'Senha atual')),
            TextField(controller: nova, obscureText: true, decoration: const InputDecoration(labelText: 'Senha nova (mínimo 8)')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Voltar')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Alterar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await context.read<DriverState>().api.request('PATCH', '/auth/password', body: {
        'currentPassword': atual.text,
        'newPassword': nova.text,
      });
      avisar('Senha alterada.');
    } on ApiException catch (e) {
      avisar(e.message);
    } catch (_) {
      avisar('Sem conexão com o servidor.');
    }
  }

  Future<void> _sair() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sair da conta?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Voltar')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Sair')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await context.read<DriverState>().logout();
    if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final d = context.watch<DriverState>();
    final p = d.profile;
    final m = _motorista;
    final status = '${m?['status'] ?? ''}';
    final (rotulo, cor, icone) = switch (status) {
      'APPROVED' => ('Aprovado', AppColors.primary, Icons.verified),
      'REJECTED' => ('Rejeitado', AppColors.danger, Icons.error_outline),
      'SUSPENDED' => ('Suspenso', AppColors.warning, Icons.pause_circle_outline),
      'BLOCKED' => ('Bloqueado', AppColors.danger, Icons.block),
      _ => ('Pendente de aprovação', AppColors.warning, Icons.hourglass_top),
    };
    final motivo = m?['rejectionReason'] as String?;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Perfil e documentos')),
      body: RefreshIndicator(
        onRefresh: _carregar,
        child: ListView(
          padding: const EdgeInsets.all(Spacing.lg),
          children: [
            _Bloco(
              filhos: [
                Row(
                  children: [
                    _FotoDoPerfil(
                      fotoUrl: p?.avatarUrl,
                      iniciais: p?.initials ?? 'M',
                      enviando: _enviandoFoto,
                      aoTocar: _trocarFoto,
                    ),
                    const SizedBox(width: Spacing.lg),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p?.name ?? 'Motorista', style: AppText.title, maxLines: 2, overflow: TextOverflow.ellipsis),
                          const SizedBox(height: Spacing.xs),
                          // Icone no lugar do rotulo: "Telefone: (64)" quebrava
                          // a linha no meio do numero.
                          _LinhaIcone(
                            icone: Icons.phone_outlined,
                            texto: telefoneBonito(p?.phone).isEmpty ? '-' : telefoneBonito(p?.phone),
                          ),
                          _LinhaIcone(icone: Icons.directions_car_outlined, texto: d.vehicle?.plate ?? '-'),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: Spacing.sm),
                Builder(builder: (context) {
                  final (texto, cor) = _situacaoDaFoto(p?.avatarUrl);
                  return Text(texto, style: AppText.caption.copyWith(color: cor));
                }),
                const SizedBox(height: Spacing.xs),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: _enviandoFoto ? null : _trocarFoto,
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: Text(p?.avatarUrl == null ? 'Pôr foto de perfil' : 'Trocar foto de perfil'),
                  ),
                ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const MeusDadosScreen())),
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('Ver e mudar meus dados'),
                  ),
                ),
              ],
            ),
            _Bloco(
              filhos: [
                const Text('Situação do cadastro', style: AppText.heading),
                const SizedBox(height: Spacing.sm),
                if (_erro != null)
                  Text('Não carregou: $_erro', style: AppText.caption.copyWith(color: AppColors.danger))
                else if (m == null)
                  const LinearProgressIndicator()
                else
                  Row(
                    children: [
                      Icon(icone, color: cor),
                      const SizedBox(width: Spacing.sm),
                      Expanded(child: Text(rotulo, style: AppText.bodyStrong.copyWith(color: cor))),
                    ],
                  ),
                if (motivo != null && status != 'APPROVED')
                  Padding(
                    padding: const EdgeInsets.only(top: Spacing.xs),
                    child: Text('Motivo informado pela Central: $motivo', style: AppText.caption.copyWith(color: AppColors.danger)),
                  ),
              ],
            ),
            DocumentosDoMotorista(key: ValueKey(_versao), aoTrocarFoto: _carregarFoto),
            const SizedBox(height: Spacing.md),
            OutlinedButton.icon(onPressed: _trocarSenha, icon: const Icon(Icons.lock_outline), label: const Text('Alterar senha')),
            const SizedBox(height: Spacing.sm),
            TextButton.icon(
              onPressed: _sair,
              icon: const Icon(Icons.logout, color: AppColors.danger),
              label: const Text('Sair', style: TextStyle(color: AppColors.danger)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Foto de perfil redonda com o selo da camera (toque para trocar).
class _FotoDoPerfil extends StatelessWidget {
  const _FotoDoPerfil({required this.fotoUrl, required this.iniciais, required this.enviando, required this.aoTocar});

  final String? fotoUrl;
  final String iniciais;
  final bool enviando;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final letras = Text(iniciais.isEmpty ? '?' : iniciais, style: AppText.title.copyWith(color: Colors.white, fontSize: 30));
    return Semantics(
      container: true,
      button: true,
      label: 'Trocar foto de perfil',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: enviando ? null : aoTocar,
        child: SizedBox(
          width: 96,
          height: 96,
          child: Stack(
            children: [
              Container(
                width: 92,
                height: 92,
                alignment: Alignment.center,
                decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.primary),
                child: fotoUrl != null && fotoUrl!.startsWith('/') ? FotoDoServidor(caminho: fotoUrl!, tamanho: 92, reserva: letras) : letras,
              ),
              Positioned(
                right: 0,
                bottom: 0,
                child: Container(
                  width: 34,
                  height: 34,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.primary,
                    border: Border.all(color: AppColors.surface, width: 3),
                  ),
                  child: enviando
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.photo_camera, size: 17, color: Colors.white),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Bloco extends StatelessWidget {
  const _Bloco({required this.filhos});

  final List<Widget> filhos;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: Spacing.md),
      padding: const EdgeInsets.all(Spacing.lg),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(Radii.md)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: filhos),
    );
  }
}

/// Lista dos documentos com a situacao de cada um e o botao de enviar foto.
/// Usada no Perfil e na tela de cadastro em analise.
class DocumentosDoMotorista extends StatefulWidget {
  const DocumentosDoMotorista({super.key, this.aoTrocarFoto});

  /// Avisa o Perfil quando a foto de perfil foi trocada pela lista.
  final VoidCallback? aoTrocarFoto;

  @override
  State<DocumentosDoMotorista> createState() => _DocumentosDoMotoristaState();
}

class _DocumentosDoMotoristaState extends State<DocumentosDoMotorista> {
  Map<String, Map<String, dynamic>> _ultimos = const {};

  /// Tipos que ja tem um aprovado (a troca nao tira o motorista do ar).
  Set<String> _aprovados = const {};
  String? _enviando;
  bool _carregou = false;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    try {
      final r = await context.read<DriverState>().api.request('GET', '/documents/me') as Map<String, dynamic>;
      final mapa = <String, Map<String, dynamic>>{};
      final aprovados = <String>{};
      for (final d in (r['documents'] as List? ?? const []).whereType<Map<String, dynamic>>()) {
        mapa.putIfAbsent('${d['type']}', () => d);
        if (d['status'] == 'APPROVED') aprovados.add('${d['type']}');
      }
      if (mounted) {
        setState(() {
          _ultimos = mapa;
          _aprovados = aprovados;
          _carregou = true;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _carregou = true);
    }
  }

  Future<void> _enviar(String tipo, String nome) async {
    final foto = await escolherFoto(context, titulo: nome);
    if (foto == null || !mounted) return;
    setState(() => _enviando = tipo);
    final driver = context.read<DriverState>();
    final substitui = _aprovados.contains(tipo);
    try {
      if (tipo == 'PROFILE_PHOTO') {
        await driver.trocarFotoDePerfil(mime: foto.mime, base64: foto.base64);
        widget.aoTrocarFoto?.call();
      } else {
        await driver.api.request('POST', '/documents/foto', body: {
          'type': tipo,
          'mime': foto.mime,
          'dados': foto.base64,
        });
      }
      avisar(substitui
          ? '$nome enviado. O atual continua valendo até a Central conferir o novo.'
          : '$nome enviado. A Central vai conferir.');
      await _carregar();
    } on ApiException catch (e) {
      avisar(e.message);
    } catch (_) {
      avisar('Sem conexão com o servidor.');
    } finally {
      if (mounted) setState(() => _enviando = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(Spacing.lg),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(Radii.md)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Documentos', style: AppText.heading),
          Text('Tire uma foto nítida de cada um. A Central confere e aprova.', style: AppText.caption.copyWith(color: AppColors.textMuted)),
          if (!_carregou) const Padding(padding: EdgeInsets.all(Spacing.md), child: LinearProgressIndicator()),
          for (final (tipo, nome, icone) in documentosDoMotorista)
            _LinhaDocumento(
              nome: nome,
              icone: icone,
              doc: _ultimos[tipo],
              temAprovado: _aprovados.contains(tipo),
              enviando: _enviando == tipo,
              aoEnviar: () => _enviar(tipo, nome),
            ),
        ],
      ),
    );
  }
}

class _LinhaDocumento extends StatelessWidget {
  const _LinhaDocumento({
    required this.nome,
    required this.icone,
    required this.doc,
    required this.temAprovado,
    required this.enviando,
    required this.aoEnviar,
  });

  final String nome;
  final IconData icone;
  final Map<String, dynamic>? doc;

  /// Ja existe um aprovado deste tipo (a ultima pode ser uma troca).
  final bool temAprovado;
  final bool enviando;
  final VoidCallback aoEnviar;

  @override
  Widget build(BuildContext context) {
    final status = '${doc?['status'] ?? ''}';
    final (texto, cor) = switch (status) {
      'APPROVED' => ('Aprovado', AppColors.primary),
      'REJECTED' when temAprovado => ('Novo recusado (o aprovado continua valendo)', AppColors.danger),
      'REJECTED' => ('Rejeitado', AppColors.danger),
      'PENDING' when temAprovado => ('Novo enviado: aguardando a Central (o aprovado continua valendo)', AppColors.warning),
      'PENDING' => ('Enviado: aguardando a Central', AppColors.warning),
      _ => ('Não enviado', AppColors.textMuted),
    };
    final motivo = doc?['rejectionReason'] as String?;
    final url = doc?['fileUrl'] as String?;
    return Padding(
      padding: const EdgeInsets.only(top: Spacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (url != null && url.startsWith('/'))
            FotoDoServidor(caminho: url, tamanho: 44, reserva: Icon(icone, size: 32, color: AppColors.textMuted))
          else
            Icon(icone, size: 32, color: AppColors.textMuted),
          const SizedBox(width: Spacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(nome, style: AppText.bodyStrong),
                Text(texto, style: AppText.caption.copyWith(color: cor)),
                if (motivo != null && status == 'REJECTED') Text('Motivo: $motivo', style: AppText.caption.copyWith(color: AppColors.danger)),
                if (doc?['uploadedAt'] != null)
                  Text('Enviado em ${formatDateTime('${doc!['uploadedAt']}')}', style: AppText.caption.copyWith(color: AppColors.textFaint)),
              ],
            ),
          ),
          enviando
              ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
              : TextButton(
                  // Aprovado tambem pode ser atualizado (CNH renovada, foto
                  // nova): o atual vale ate a Central conferir o novo.
                  onPressed: aoEnviar,
                  child: Text(status.isEmpty ? 'Enviar' : (status == 'APPROVED' ? 'Atualizar' : 'Trocar')),
                ),
        ],
      ),
    );
  }
}

class _LinhaIcone extends StatelessWidget {
  const _LinhaIcone({required this.icone, required this.texto});

  final IconData icone;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(
        children: [
          Icon(icone, size: 16, color: AppColors.textMuted),
          const SizedBox(width: Spacing.xs),
          Expanded(
            child: Text(texto, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.body),
          ),
        ],
      ),
    );
  }
}
