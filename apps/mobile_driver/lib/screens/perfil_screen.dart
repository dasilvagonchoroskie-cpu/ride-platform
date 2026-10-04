import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/fotos.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../state/driver_state.dart';

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

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    try {
      final r = await context.read<DriverState>().api.request('GET', '/drivers/me') as Map<String, dynamic>;
      if (mounted) setState(() => _motorista = r);
    } catch (e) {
      if (mounted) setState(() => _erro = e is ApiException ? e.message : '$e');
    }
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
                Text(p?.name ?? 'Motorista', style: AppText.title),
                const SizedBox(height: Spacing.xs),
                Text('Telefone: ${p?.phone ?? '-'}', style: AppText.body),
                Text('Placa: ${d.vehicle?.plate ?? '-'}', style: AppText.body),
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
            const DocumentosDoMotorista(),
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
  const DocumentosDoMotorista({super.key});

  @override
  State<DocumentosDoMotorista> createState() => _DocumentosDoMotoristaState();
}

class _DocumentosDoMotoristaState extends State<DocumentosDoMotorista> {
  Map<String, Map<String, dynamic>> _ultimos = const {};
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
      for (final d in (r['documents'] as List? ?? const []).whereType<Map<String, dynamic>>()) {
        mapa.putIfAbsent('${d['type']}', () => d);
      }
      if (mounted) {
        setState(() {
          _ultimos = mapa;
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
    try {
      await context.read<DriverState>().api.request('POST', '/documents/foto', body: {
        'type': tipo,
        'mime': foto.mime,
        'dados': foto.base64,
      });
      avisar('$nome enviado. A Central vai conferir.');
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
              enviando: _enviando == tipo,
              aoEnviar: () => _enviar(tipo, nome),
            ),
        ],
      ),
    );
  }
}

class _LinhaDocumento extends StatelessWidget {
  const _LinhaDocumento({required this.nome, required this.icone, required this.doc, required this.enviando, required this.aoEnviar});

  final String nome;
  final IconData icone;
  final Map<String, dynamic>? doc;
  final bool enviando;
  final VoidCallback aoEnviar;

  @override
  Widget build(BuildContext context) {
    final status = '${doc?['status'] ?? ''}';
    final (texto, cor) = switch (status) {
      'APPROVED' => ('Aprovado', AppColors.primary),
      'REJECTED' => ('Rejeitado', AppColors.danger),
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
                  onPressed: status == 'APPROVED' ? null : aoEnviar,
                  child: Text(status.isEmpty ? 'Enviar' : (status == 'APPROVED' ? 'OK' : 'Trocar')),
                ),
        ],
      ),
    );
  }
}
