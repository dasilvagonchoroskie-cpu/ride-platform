import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/alarme.dart';
import '../core/api/api_client.dart';
import '../core/config/app_config.dart';
import '../core/theme/central_theme.dart';
import '../state/central_state.dart';
import '../widgets/aparencia_app.dart';
import '../widgets/operacao_passageiros.dart';
import '../widgets/ui.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final central = context.watch<CentralState>();
    final admin = central.admin;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(Spacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppCard(
            child: Row(
              children: [
                AppAvatar(initials: admin?.initials ?? 'A', size: 56),
                const SizedBox(width: Spacing.lg),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(admin?.name ?? 'Administrador', style: AppText.heading),
                      Text(
                        admin?.email ?? '-',
                        style: AppText.caption.copyWith(color: AppColors.textMuted),
                      ),
                      const SizedBox(height: Spacing.xs),
                      const AppBadge(text: 'ADMIN', tone: AppBadgeTone.info),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: Spacing.lg),
          const SectionTitle(text: 'Segurança'),
          if (AppConfig.hasApi) const _DoisFatores() else AppCard(child: Text('Disponível com o servidor ligado.', style: AppText.caption)),
          const SizedBox(height: Spacing.lg),
          const SectionTitle(text: 'Conexões'),
          const _StatusDasConexoes(),
          const SizedBox(height: Spacing.lg),
          const SectionTitle(text: 'App do passageiro'),
          if (AppConfig.hasApi) ...[
            const AparenciaDoApp(),
            const SizedBox(height: Spacing.md),
          ],
          const OperacaoPassageiros(),
          const SizedBox(height: Spacing.lg),
          const SectionTitle(text: 'Diagnostico'),
          AppCard(
            child: Column(
              children: [
                _InfoRow(label: 'Versão do app', value: AppConfig.appVersion),
                const AppDivider(),
                _InfoRow(label: 'Stack', value: 'Flutter / Dart'),
                const AppDivider(),
                _InfoRow(
                  label: 'Fonte de dados',
                  value: central.isDemo ? 'Demonstração local' : 'Servidor real (PostgreSQL)',
                ),
                const AppDivider(),
                _InfoRow(label: 'Motoristas na fila', value: '${central.pendingCount}'),
                const AppDivider(),
                _InfoRow(label: 'Corridas ativas', value: '${central.activeRidesCount}'),
              ],
            ),
          ),
          const SizedBox(height: Spacing.lg),
          AppButton(
            label: 'Recarregar dados',
            variant: AppButtonVariant.secondary,
            icon: Icons.refresh,
            loading: central.loading,
            onPressed: () => central.loadAll(),
          ),
          const SizedBox(height: Spacing.sm),
          AppButton(
            label: 'Sair da Central',
            variant: AppButtonVariant.danger,
            onPressed: () => central.logout(),
          ),
          const SizedBox(height: Spacing.lg),
        ],
      ),
    );
  }
}

class _IntegrationRow extends StatelessWidget {
  const _IntegrationRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.connected,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool connected;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: connected ? AppColors.primary : AppColors.textFaint, size: 22),
        const SizedBox(width: Spacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: AppText.bodyStrong),
              Text(
                subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
            ],
          ),
        ),
        AppBadge(
          text: connected ? 'ATIVO' : 'INATIVO',
          tone: connected ? AppBadgeTone.success : AppBadgeTone.neutral,
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(child: Text(label, style: AppText.caption.copyWith(color: AppColors.textMuted))),
        Text(value, style: AppText.caption),
      ],
    );
  }
}

/// Estado REAL das conexoes, perguntado ao servidor quando a tela abre.
///
/// Substitui a antiga linha fixa do Firebase: esta plataforma nao usa
/// Firebase. Os dados moram no PostgreSQL (Supabase) e so o servidor fala
/// com o banco — nenhum aplicativo acessa o banco direto.
class _StatusDasConexoes extends StatefulWidget {
  const _StatusDasConexoes();

  @override
  State<_StatusDasConexoes> createState() => _StatusDasConexoesState();
}

class _StatusDasConexoesState extends State<_StatusDasConexoes> {
  bool _carregando = true;
  bool _servidor = false;
  bool _banco = false;
  bool _cache = false;
  String? _versao;
  bool _mapa = false;
  String _mapaTexto = 'TomTom';

  @override
  void initState() {
    super.initState();
    _verificar();
  }

  Future<void> _verificar() async {
    setState(() => _carregando = true);
    var servidor = false;
    var banco = false;
    var cache = false;
    try {
      final r = await ApiClient().request('GET', '/health');
      final Map<dynamic, dynamic> m =
          (r is Map && r['data'] is Map) ? r['data'] as Map : (r as Map? ?? const {});
      final dep = (m['dependencies'] as Map?) ?? const {};
      servidor = true;
      banco = dep['database'] == 'up';
      cache = dep['redis'] == 'up';
      final v = m['versao'] as String?;
      final desde = DateTime.tryParse(m['noArDesde'] as String? ?? '')?.toLocal();
      _versao = v == null
          ? null
          : desde == null
              ? v
              : '$v · no ar desde ${desde.day.toString().padLeft(2, '0')}/${desde.month.toString().padLeft(2, '0')} '
                  '${desde.hour.toString().padLeft(2, '0')}:${desde.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      // Sem resposta: tudo aparece como fora do ar, que e a verdade.
    }
    var mapa = false;
    var mapaTexto = 'TomTom: sem resposta do servidor';
    try {
      final u = await ApiClient().request('GET', '/geo/uso');
      if (u is Map) {
        mapa = u['ligado'] == true;
        mapaTexto = textoDoUsoDoMapa(u);
      }
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _carregando = false;
      _servidor = servidor;
      _banco = banco;
      _cache = cache;
      _mapa = mapa;
      _mapaTexto = mapaTexto;
    });
  }

  String _texto(bool ok, String quandoOk) =>
      _carregando ? 'Verificando...' : (ok ? quandoOk : 'Sem resposta');

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        children: [
          _IntegrationRow(
            icon: Icons.cloud_outlined,
            title: 'Servidor (API)',
            subtitle: _texto(_servidor, _versao == null ? AppConfig.apiUrl : 'Versão $_versao'),
            connected: _servidor,
          ),
          const AppDivider(),
          _IntegrationRow(
            icon: Icons.storage_outlined,
            title: 'Banco de dados',
            subtitle: _texto(_banco, 'PostgreSQL + PostGIS (Supabase)'),
            connected: _banco,
          ),
          const AppDivider(),
          _IntegrationRow(
            icon: Icons.bolt_outlined,
            title: 'Cache e tempo real',
            subtitle: _texto(_cache, 'Redis'),
            connected: _cache,
          ),
          const AppDivider(),
          _IntegrationRow(
            icon: Icons.map_outlined,
            title: 'Mapa',
            subtitle: _carregando ? 'Verificando...' : _mapaTexto,
            connected: _mapa,
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: _carregando ? null : _verificar,
              child: const Text('Verificar de novo'),
            ),
          ),
        ],
      ),
    );
  }
}

/// Resumo do GET /geo/uso para a Central (cota gratis da TomTom por MES).
String textoDoUsoDoMapa(Map<dynamic, dynamic> u) {
  if (u['ligado'] != true) return 'TomTom: chave não configurada no servidor';
  const nomes = {'geocode': 'buscas', 'reverse': 'endereços', 'routing': 'rotas', 'search': 'lugares', 'tiles': 'imagens'};
  final partes = <String>[];
  for (final s in (u['servicos'] as List? ?? const [])) {
    if (s is! Map) continue;
    final nome = nomes[s['servico']] ?? '${s['servico']}';
    partes.add('$nome ${s['noMes'] ?? 0}/${s['cotaDoMes'] ?? '?'}');
  }
  final estado = u['parado'] == true
      ? ' · PARADO (limite)'
      : u['economia'] == true
          ? ' · modo economia'
          : '';
  // Alerta a 70% da cota gratis do mes (29/10/2026).
  final alertas = [
    for (final a in (u['alertas'] as List? ?? const []))
      if (a is Map) '${nomes[a['servico']] ?? a['servico']} ${a['porcento']}%',
  ];
  final alerta = alertas.isEmpty ? '' : ' · ATENÇÃO: passou de 70% da cota do mês (${alertas.join(', ')})';
  return 'TomTom$estado$alerta · no mês: ${partes.join(', ')}';
}

/// Verificacao em duas etapas da Central (etapa 7, Evandro 29/10/2026:
/// "Google Authenticator"). No celular nao da para ler QR code da propria
/// tela: o botao abre o Google Authenticator ja com a conta, e a chave
/// aparece para digitar se precisar.
class _DoisFatores extends StatefulWidget {
  const _DoisFatores();

  @override
  State<_DoisFatores> createState() => _DoisFatoresState();
}

class _DoisFatoresState extends State<_DoisFatores> {
  bool? _ativo;
  int _restantes = 0;
  String? _erro;
  bool _ocupado = false;

  /// Ligando: chave e link do Google Authenticator.
  String? _segredo;
  String? _link;
  final TextEditingController _codigo = TextEditingController();

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void dispose() {
    _codigo.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    try {
      final d = await context.read<CentralState>().situacaoDoisFatores();
      if (!mounted) return;
      setState(() {
        _ativo = d['ativo'] == true;
        _restantes = (d['recuperacaoRestantes'] as num?)?.toInt() ?? 0;
      });
    } catch (_) {
      if (mounted) setState(() => _erro = 'Sem resposta do servidor.');
    }
  }

  Future<void> _comecar() async {
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    try {
      final d = await context.read<CentralState>().iniciarDoisFatores();
      if (!mounted) return;
      setState(() {
        _segredo = d['segredo']?.toString();
        _link = d['link']?.toString();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _erro = e.message);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _ativar() async {
    final c = _codigo.text.trim();
    if (c.length != 6) {
      setState(() => _erro = 'O código do Google Authenticator tem 6 números.');
      return;
    }
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    try {
      final codigos = await context.read<CentralState>().ativarDoisFatores(c);
      if (!mounted) return;
      _codigo.clear();
      setState(() {
        _segredo = null;
        _link = null;
        _ativo = true;
        _restantes = codigos.length;
      });
      await _mostrarRecuperacao(codigos);
    } on ApiException catch (e) {
      if (mounted) setState(() => _erro = e.message);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _mostrarRecuperacao(List<String> codigos) async {
    final texto = codigos.join('\n');
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (c) => AlertDialog(
        title: const Text('Guarde estes códigos'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Se perder o celular, cada código entra uma vez no lugar do Google Authenticator. Eles não aparecem de novo.'),
            const SizedBox(height: Spacing.md),
            SelectableText(texto, style: AppText.bodyStrong.copyWith(letterSpacing: 2)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: texto));
              if (c.mounted) ScaffoldMessenger.maybeOf(c)?.showSnackBar(const SnackBar(content: Text('Códigos copiados.')));
            },
            child: const Text('Copiar'),
          ),
          FilledButton(onPressed: () => Navigator.of(c).pop(), child: const Text('Já guardei')),
        ],
      ),
    );
  }

  Future<void> _desligar() async {
    final campo = TextEditingController();
    final codigo = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Desligar a verificação em duas etapas?'),
        content: TextField(
          controller: campo,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Código do Google Authenticator (ou de recuperação)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(), child: const Text('Voltar')),
          TextButton(onPressed: () => Navigator.of(c).pop(campo.text.trim()), child: const Text('Desligar')),
        ],
      ),
    );
    if (codigo == null || codigo.length < 6 || !mounted) return;
    setState(() => _ocupado = true);
    try {
      await context.read<CentralState>().desligarDoisFatores(codigo);
      if (mounted) setState(() => _ativo = false);
    } on ApiException catch (e) {
      if (mounted) setState(() => _erro = e.message);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ativo = _ativo;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.verified_user_outlined, color: ativo == true ? AppColors.primary : AppColors.textFaint),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Verificação em duas etapas', style: AppText.bodyStrong),
                    Text(
                      ativo == null
                          ? 'Verificando...'
                          : ativo
                              ? 'Ligada: o login pede o código do Google Authenticator ($_restantes códigos de recuperação sobrando).'
                              : 'Desligada. Ligue para proteger a Central: além da senha, o login pede o código do Google Authenticator.',
                      style: AppText.caption.copyWith(color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
              if (ativo != null) AppBadge(text: ativo ? 'LIGADA' : 'DESLIGADA', tone: ativo ? AppBadgeTone.success : AppBadgeTone.neutral),
            ],
          ),
          if (ativo == false && _segredo == null) ...[
            const SizedBox(height: Spacing.md),
            AppButton(label: 'Ligar com o Google Authenticator', icon: Icons.lock_outline, loading: _ocupado, onPressed: _comecar),
          ],
          if (_segredo != null) ...[
            const SizedBox(height: Spacing.md),
            Text('1. Instale o Google Authenticator (Play Store) e toque no botão abaixo:', style: AppText.caption),
            const SizedBox(height: Spacing.xs),
            AppButton(
              label: 'Abrir no Google Authenticator',
              icon: Icons.open_in_new,
              variant: AppButtonVariant.secondary,
              onPressed: () {
                final l = _link;
                if (l != null) Alarme.abrir(l);
              },
            ),
            const SizedBox(height: Spacing.sm),
            Text('Se não abrir: no Google Authenticator toque em "+" e "Enter a setup key" ("Inserir chave de configuração") e digite:', style: AppText.caption),
            SelectableText(_segredo!, style: AppText.bodyStrong.copyWith(letterSpacing: 1.5)),
            TextButton.icon(
              onPressed: () => Clipboard.setData(ClipboardData(text: _segredo!.replaceAll(' ', ''))),
              icon: const Icon(Icons.copy, size: 16),
              label: const Text('Copiar a chave'),
            ),
            const SizedBox(height: Spacing.sm),
            Text('2. Digite o código de 6 números que apareceu:', style: AppText.caption),
            TextField(
              controller: _codigo,
              keyboardType: TextInputType.number,
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              textAlign: TextAlign.center,
              style: AppText.title.copyWith(letterSpacing: 8),
              decoration: const InputDecoration(counterText: '', hintText: '000000'),
            ),
            AppButton(label: 'Ligar', loading: _ocupado, onPressed: _ativar),
          ],
          if (ativo == true) ...[
            const SizedBox(height: Spacing.md),
            AppButton(label: 'Desligar', variant: AppButtonVariant.secondary, loading: _ocupado, onPressed: _desligar),
          ],
          if (_erro != null) ...[
            const SizedBox(height: Spacing.sm),
            Text(_erro!, style: AppText.caption.copyWith(color: AppColors.danger)),
          ],
        ],
      ),
    );
  }
}
