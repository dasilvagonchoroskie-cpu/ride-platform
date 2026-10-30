import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/driver_models.dart';
import '../state/driver_state.dart';
import 'meus_dados_screen.dart';
import 'perfil_screen.dart';
import 'permissions_screen.dart';
import 'vehicles_screen.dart';
import 'wallet_screen.dart';

/// Um aviso para o motorista (sino da tela inicial).
class AvisoMotorista {
  const AvisoMotorista({
    required this.titulo,
    required this.texto,
    required this.icone,
    required this.cor,
    this.abrir,
  });

  final String titulo;
  final String texto;
  final IconData icone;
  final Color cor;
  final WidgetBuilder? abrir;
}

/// O que merece a atencao do motorista agora. Tudo calculado com o que o
/// aplicativo ja sabe — nada inventado.
List<AvisoMotorista> avisosDo(DriverState d) {
  final lista = <AvisoMotorista>[];

  final c = d.carteira;
  if (c != null && c.isInsufficient) {
    lista.add(AvisoMotorista(
      titulo: c.blocking ? 'Você não está recebendo corridas' : 'Saldo abaixo do mínimo',
      texto: c.blocking
          ? 'Sua carteira está com ${formatMoney(c.balanceCents)}, abaixo do mínimo. Recarregue para voltar a receber chamados.'
          : 'Sua carteira está com ${formatMoney(c.balanceCents)}. Adicione créditos para continuar recebendo corridas.',
      icone: Icons.account_balance_wallet,
      cor: AppColors.danger,
      abrir: (_) => const WalletScreen(),
    ));
  } else if (c != null && c.isLow) {
    lista.add(AvisoMotorista(
      titulo: 'Saldo se esgotando',
      texto: 'Sua carteira está com ${formatMoney(c.balanceCents)}. Recarregue antes que acabe.',
      icone: Icons.account_balance_wallet,
      cor: AppColors.warning,
      abrir: (_) => const WalletScreen(),
    ));
  }

  if (d.permissoesOk == false) {
    lista.add(AvisoMotorista(
      titulo: 'Autorizações pendentes',
      texto: 'Sem elas o alarme de corrida pode falhar com o celular no bolso.',
      icone: Icons.shield_outlined,
      cor: AppColors.danger,
      abrir: (_) => const PermissionsScreen(podeVoltar: true),
    ));
  }

  if (d.locationDenied) {
    lista.add(const AvisoMotorista(
      titulo: 'GPS desligado ou sem permissão',
      texto: 'Ligue a localização do celular para aparecer para os passageiros.',
      icone: Icons.location_off,
      cor: AppColors.danger,
    ));
  }

  final validade = DateTime.tryParse(d.profile?.cnhExpiresAt ?? '');
  if (validade != null) {
    final dias = validade.difference(DateTime.now()).inDays;
    if (dias <= 30) {
      lista.add(AvisoMotorista(
        titulo: dias < 0 ? 'CNH vencida' : 'CNH perto de vencer',
        texto: dias < 0
            ? 'Sua CNH venceu em ${dataCurta(validade)}. Procure a Central para atualizar.'
            : 'Sua CNH vence em ${dataCurta(validade)}. Renove e avise a Central.',
        icone: Icons.badge_outlined,
        cor: dias < 0 ? AppColors.danger : AppColors.warning,
      ));
    }
  }

  return lista;
}

/// Sino do motorista.
///
/// - "Agora": o que precisa de atencao neste momento (saldo, autorizacoes,
///   GPS, CNH). Calculado no celular e NAO acende o ponto vermelho.
/// - Notificacoes: as que a Central mandou (cadastro, carro, categoria,
///   documento, recarga, saque). Ficam no servidor, so desta conta; abrir a
///   lista marca como lidas e o ponto some (e nao volta sozinho).
/// - Apagar: deslizar para o lado ou a lixeira; "DESFAZER" por 4 segundos.
class AvisosScreen extends StatefulWidget {
  const AvisosScreen({super.key, this.esperaDesfazer = const Duration(seconds: 4)});

  /// Tempo para desfazer antes de apagar no servidor.
  final Duration esperaDesfazer;

  @override
  State<AvisosScreen> createState() => _AvisosScreenState();
}

class _AvisosScreenState extends State<AvisosScreen> {
  /// Escondidas esperando o "desfazer" (ainda nao apagadas no servidor).
  final Set<String> _escondidas = {};

  /// Nao lidas quando a lista abriu (ficam com destaque ate sair).
  Set<String> _novas = {};
  bool _abriu = false;
  Timer? _relogioApagar;
  List<String> _apagarDepois = const [];
  late final DriverState _d;
  ScaffoldMessengerState? _mensagens;

  @override
  void initState() {
    super.initState();
    _d = context.read<DriverState>();
    WidgetsBinding.instance.addPostFrameCallback((_) => _abrir());
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

  Future<void> _abrir() async {
    await _d.carregarNotificacoes();
    if (!mounted) return;
    setState(() {
      _novas = {for (final n in _d.notificacoes ?? const <Notificacao>[]) if (!n.lida) n.id};
      _abriu = true;
    });
    // Abriu a lista: todas lidas, o ponto vermelho some.
    if (_novas.isNotEmpty || _d.naoLidas > 0) await _d.marcarNotificacoesLidas();
  }

  void _confirmarApagar() {
    _relogioApagar?.cancel();
    _relogioApagar = null;
    final ids = _apagarDepois;
    _apagarDepois = const [];
    if (ids.isNotEmpty) unawaited(_d.apagarNotificacoes(ids));
  }

  void _apagar(List<Notificacao> itens) {
    if (itens.isEmpty) return;
    // Outro "desfazer" aberto: o anterior vale (apaga) e comeca este.
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

  void _abrirDestino(Notificacao n) {
    final Widget? tela = switch (n.abrir) {
      'carteira' || 'saques' => const WalletScreen(),
      'carros' => const VehiclesScreen(),
      'documentos' => const PerfilScreen(),
      'dados' => const MeusDadosScreen(),
      _ => null,
    };
    if (tela != null) Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => tela));
  }

  @override
  Widget build(BuildContext context) {
    final d = context.watch<DriverState>();
    final agora = avisosDo(d);
    final lista = [for (final n in d.notificacoes ?? const <Notificacao>[]) if (!_escondidas.contains(n.id)) n];
    final carregando = !_abriu && d.notificacoes == null;

    return Scaffold(
      appBar: AppBar(title: const Text('Notificações')),
      body: RefreshIndicator(
        onRefresh: _abrir,
        child: ListView(
          padding: const EdgeInsets.all(Spacing.lg),
          children: [
            if (agora.isNotEmpty) ...[
              Text('Agora', style: AppText.caption.copyWith(color: AppColors.textMuted, fontWeight: FontWeight.w700)),
              const SizedBox(height: Spacing.sm),
              for (final a in agora) ...[_CartaoAgora(a: a), const SizedBox(height: Spacing.md)],
              const SizedBox(height: Spacing.sm),
            ],
            if (lista.isNotEmpty)
              Wrap(
                spacing: Spacing.sm,
                runSpacing: Spacing.xs,
                alignment: WrapAlignment.end,
                children: [
                  TextButton.icon(
                    onPressed: () => unawaited(d.marcarNotificacoesLidas().then((_) {
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
            if (carregando)
              const Padding(
                padding: EdgeInsets.all(Spacing.xxl),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (lista.isEmpty && agora.isEmpty)
              _Vazio(falhou: d.falhouNotificacoes)
            else if (lista.isEmpty && d.falhouNotificacoes)
              Padding(
                padding: const EdgeInsets.all(Spacing.lg),
                child: Text('Sem conexão: as notificações aparecem quando a internet voltar.',
                    textAlign: TextAlign.center, style: AppText.body.copyWith(color: AppColors.textMuted)),
              )
            else
              for (final n in lista) ...[
                Dismissible(
                  key: ValueKey('notif-${n.id}'),
                  background: const _FundoApagar(alinhamento: Alignment.centerLeft),
                  secondaryBackground: const _FundoApagar(alinhamento: Alignment.centerRight),
                  onDismissed: (_) => _apagar([n]),
                  child: _CartaoNotificacao(
                    n: n,
                    nova: _novas.contains(n.id),
                    aoTocar: n.abrir == null ? null : () => _abrirDestino(n),
                    aoApagar: () => _apagar([n]),
                  ),
                ),
                const SizedBox(height: Spacing.md),
              ],
          ],
        ),
      ),
    );
  }
}

class _Vazio extends StatelessWidget {
  const _Vazio({required this.falhou});

  final bool falhou;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(Spacing.xxl),
      child: Column(
        children: [
          const Icon(Icons.notifications_none, size: 56, color: AppColors.textFaint),
          const SizedBox(height: Spacing.md),
          Text(falhou ? 'Sem conexão' : 'Tudo certo por aqui', style: AppText.heading),
          const SizedBox(height: Spacing.xs),
          Text(
            falhou
                ? 'As notificações aparecem quando a internet voltar.'
                : 'Quando a Central mandar algo, ou algo precisar da sua atenção, aparece aqui.',
            textAlign: TextAlign.center,
            style: AppText.body.copyWith(color: AppColors.textMuted),
          ),
        ],
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
      alignment: alinhamento,
      padding: const EdgeInsets.symmetric(horizontal: Spacing.xl),
      decoration: BoxDecoration(color: AppColors.danger, borderRadius: BorderRadius.circular(Radii.sm)),
      child: const Icon(Icons.delete_outline, color: Colors.white),
    );
  }
}

class _CartaoAgora extends StatelessWidget {
  const _CartaoAgora({required this.a});

  final AvisoMotorista a;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(Radii.sm),
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.sm),
        onTap: a.abrir == null ? null : () => Navigator.of(context).push(MaterialPageRoute<void>(builder: a.abrir!)),
        child: Padding(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: a.cor.withValues(alpha: 0.12), shape: BoxShape.circle),
                child: Icon(a.icone, color: a.cor),
              ),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(a.titulo, style: AppText.bodyStrong.copyWith(fontSize: 16)),
                    const SizedBox(height: 2),
                    Text(a.texto, style: AppText.body.copyWith(color: AppColors.textMuted)),
                  ],
                ),
              ),
              if (a.abrir != null) const Icon(Icons.chevron_right, color: AppColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

IconData _iconeDoTipo(String tipo) => switch (tipo) {
      'carteira' => Icons.account_balance_wallet_outlined,
      'saque' => Icons.payments_outlined,
      'carro' || 'categoria' => Icons.directions_car_outlined,
      'documento' => Icons.description_outlined,
      'dados' => Icons.person_outline,
      'conta' => Icons.verified_user_outlined,
      _ => Icons.notifications_none,
    };

class _CartaoNotificacao extends StatelessWidget {
  const _CartaoNotificacao({required this.n, required this.nova, required this.aoApagar, this.aoTocar});

  final Notificacao n;
  final bool nova;
  final VoidCallback aoApagar;
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: nova ? AppColors.brandSoft : AppColors.surface,
      borderRadius: BorderRadius.circular(Radii.sm),
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.sm),
        onTap: aoTocar,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.xs, Spacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Icon(_iconeDoTipo(n.tipo), color: nova ? AppColors.brand : AppColors.textMuted),
              ),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(n.titulo, style: AppText.bodyStrong.copyWith(fontSize: 16, fontWeight: nova ? FontWeight.w800 : FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(n.texto, style: AppText.body.copyWith(color: AppColors.textMuted)),
                    const SizedBox(height: Spacing.xs),
                    Text(
                      '${dataCurta(n.criadaEm)} ${n.criadaEm.hour.toString().padLeft(2, '0')}:${n.criadaEm.minute.toString().padLeft(2, '0')}',
                      style: AppText.caption.copyWith(color: AppColors.textFaint),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Apagar',
                onPressed: aoApagar,
                icon: const Icon(Icons.delete_outline, color: AppColors.textMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
