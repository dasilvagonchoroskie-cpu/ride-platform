import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../data/models/models.dart';
import '../state/config_state.dart';
import '../widgets/form_ui.dart';
import '../widgets/ui.dart';

/// Sino do passageiro (Evandro, 30/10/2026).
///
/// - Avisos da Central e da conta ficam no servidor, so desta conta.
/// - Abrir a lista marca como lidas: o ponto vermelho some e nao volta
///   sozinho (so com notificacao nova).
/// - Apagar: deslizar para o lado ou a lixeira; "DESFAZER" por 4 segundos.
///   "Apagar todas" e "Marcar todas como lidas".
/// - Servidor antigo (sem a caixa): mostra os avisos como antes.
class AvisosScreen extends StatefulWidget {
  const AvisosScreen({super.key, this.esperaDesfazer = const Duration(seconds: 4)});

  /// Tempo para desfazer antes de apagar no servidor.
  final Duration esperaDesfazer;

  @override
  State<AvisosScreen> createState() => _AvisosScreenState();
}

class _AvisosScreenState extends State<AvisosScreen> {
  final Set<String> _escondidas = {};
  Set<String> _novas = {};
  bool _abriu = false;
  Timer? _relogioApagar;
  List<String> _apagarDepois = const [];
  late final ConfigState _config;
  ScaffoldMessengerState? _mensagens;

  @override
  void initState() {
    super.initState();
    _config = context.read<ConfigState>();
    WidgetsBinding.instance.addPostFrameCallback((_) => _atualizar());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _mensagens = ScaffoldMessenger.maybeOf(context);
  }

  @override
  void dispose() {
    // Saiu da tela com um "desfazer" aberto: apaga agora.
    _confirmarApagar();
    super.dispose();
  }

  Future<void> _atualizar() async {
    await _config.carregar();
    await _config.carregarNotificacoes();
    if (!mounted) return;
    setState(() {
      _novas = {for (final n in _config.notificacoes ?? const <Notificacao>[]) if (!n.lida) n.id};
      _abriu = true;
    });
    // Abriu a lista: todas lidas, o ponto some.
    if (_config.caixaAntiga) {
      await _config.marcarAvisosVistos();
    } else if (_novas.isNotEmpty || _config.naoLidas > 0) {
      await _config.marcarNotificacoesLidas();
    }
  }

  void _confirmarApagar() {
    _relogioApagar?.cancel();
    _relogioApagar = null;
    final ids = _apagarDepois;
    _apagarDepois = const [];
    if (ids.isNotEmpty) unawaited(_config.apagarNotificacoes(ids));
  }

  void _apagar(List<Notificacao> itens) {
    if (itens.isEmpty) return;
    _confirmarApagar();
    final ids = [for (final n in itens) n.id];
    setState(() => _escondidas.addAll(ids));
    _apagarDepois = ids;
    _relogioApagar = Timer(widget.esperaDesfazer, () {
      _mensagens?.hideCurrentSnackBar();
      _confirmarApagar();
    });
    _mensagens
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(ids.length == 1 ? 'Notificação apagada.' : '${ids.length} notificações apagadas.'),
        duration: widget.esperaDesfazer + const Duration(seconds: 2),
        action: SnackBarAction(label: 'DESFAZER', onPressed: () => _desfazer(ids)),
      ));
  }

  void _desfazer(List<String> ids) {
    _relogioApagar?.cancel();
    _relogioApagar = null;
    _apagarDepois = const [];
    if (mounted) setState(() => _escondidas.removeAll(ids));
  }

  String _data(DateTime d) => DateFormat('dd/MM/yyyy HH:mm').format(d);

  @override
  Widget build(BuildContext context) {
    final config = context.watch<ConfigState>();
    if (config.caixaAntiga) return _AvisosAntigos(config: config, aoAtualizar: _atualizar);
    final lista = [for (final n in config.notificacoes ?? const <Notificacao>[]) if (!_escondidas.contains(n.id)) n];
    final carregando = !_abriu && config.notificacoes == null;

    return TelaFormulario(
      titulo: 'Notificações',
      child: RefreshIndicator(
        onRefresh: _atualizar,
        child: ListView(
          padding: const EdgeInsets.symmetric(vertical: Spacing.md),
          children: [
            if (lista.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Spacing.md),
                child: Wrap(
                  alignment: WrapAlignment.end,
                  spacing: Spacing.sm,
                  children: [
                    TextButton.icon(
                      onPressed: () => unawaited(config.marcarNotificacoesLidas().then((_) {
                        if (mounted) setState(() => _novas = {});
                      })),
                      icon: const Icon(Icons.done_all, size: 20),
                      label: const Text('Marcar todas como lidas'),
                    ),
                    TextButton.icon(
                      onPressed: () => _apagar(lista),
                      icon: const Icon(Icons.delete_sweep_outlined, size: 20, color: AppColors.danger),
                      label: const Text('Apagar todas', style: TextStyle(color: AppColors.danger)),
                    ),
                  ],
                ),
              ),
            if (carregando)
              const Padding(
                padding: EdgeInsets.all(Spacing.xl),
                child: Center(child: CircularProgressIndicator(color: AppColors.brand)),
              )
            else if (lista.isEmpty)
              Padding(
                padding: const EdgeInsets.all(Spacing.xl),
                child: EmptyState(
                  title: config.falhouNotificacoes ? 'Sem conexão' : 'Nenhuma notificação',
                  description: config.falhouNotificacoes
                      ? 'As notificações aparecem quando a internet voltar.'
                      : 'Quando a Central publicar uma novidade, ela aparece aqui.',
                ),
              )
            else
              for (final n in lista) ...[
                Dismissible(
                  key: ValueKey('notif-${n.id}'),
                  background: const _FundoApagar(alinhamento: Alignment.centerLeft),
                  secondaryBackground: const _FundoApagar(alinhamento: Alignment.centerRight),
                  onDismissed: (_) => _apagar([n]),
                  child: Container(
                    color: _novas.contains(n.id) ? AppColors.brandSoft : AppColors.surface,
                    padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.md, Spacing.xs, Spacing.md),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                n.titulo,
                                style: AppText.bodyStrong.copyWith(
                                  fontSize: 18,
                                  fontWeight: _novas.contains(n.id) ? FontWeight.w800 : FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: Spacing.xs),
                              Text(n.texto, style: AppText.body.copyWith(fontSize: 16, height: 1.4)),
                              const SizedBox(height: Spacing.sm),
                              Text(_data(n.criadaEm), style: AppText.caption.copyWith(color: AppColors.textFaint)),
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: 'Apagar',
                          onPressed: () => _apagar([n]),
                          icon: const Icon(Icons.delete_outline, color: AppColors.textMuted),
                        ),
                      ],
                    ),
                  ),
                ),
                const Divider(height: 1, color: AppColors.border),
              ],
          ],
        ),
      ),
    );
  }
}

class _FundoApagar extends StatelessWidget {
  const _FundoApagar({required this.alinhamento});

  final Alignment alinhamento;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.danger,
      alignment: alinhamento,
      padding: const EdgeInsets.symmetric(horizontal: Spacing.xl),
      child: const Icon(Icons.delete_outline, color: Colors.white),
    );
  }
}

/// Servidor antigo (sem a caixa de notificacoes): a lista de antes, so leitura.
class _AvisosAntigos extends StatelessWidget {
  const _AvisosAntigos({required this.config, required this.aoAtualizar});

  final ConfigState config;
  final Future<void> Function() aoAtualizar;

  String _data(String iso) {
    try {
      return DateFormat('dd/MM/yyyy HH:mm').format(DateTime.parse(iso).toLocal());
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final avisos = config.avisos;
    return TelaFormulario(
      titulo: 'Avisos',
      child: RefreshIndicator(
        onRefresh: aoAtualizar,
        child: avisos.isEmpty
            ? ListView(
                padding: const EdgeInsets.all(Spacing.xl),
                children: const [
                  EmptyState(
                    title: 'Nenhum aviso por enquanto',
                    description: 'Quando a Central publicar uma novidade, ela aparece aqui.',
                  ),
                ],
              )
            : ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: Spacing.md),
                itemCount: avisos.length,
                separatorBuilder: (context, index) => const Divider(height: 1, color: AppColors.border),
                itemBuilder: (context, index) {
                  final a = avisos[index];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: Spacing.xl, vertical: Spacing.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(a.titulo, style: AppText.bodyStrong.copyWith(fontSize: 18)),
                        const SizedBox(height: Spacing.xs),
                        Text(a.texto, style: AppText.body.copyWith(fontSize: 16, height: 1.4)),
                        const SizedBox(height: Spacing.sm),
                        Text(_data(a.criadoEm), style: AppText.caption.copyWith(color: AppColors.textFaint)),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}
