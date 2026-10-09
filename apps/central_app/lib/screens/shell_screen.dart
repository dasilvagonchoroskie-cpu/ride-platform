import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/alarme.dart';
import '../core/config/app_config.dart';
import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import '../painel/alertas.dart';
import '../painel/carteiras.dart';
import '../painel/cidades_equipe.dart';
import '../painel/limpeza.dart';
import '../painel/comuns.dart';
import '../painel/cupons.dart';
import '../painel/despacho.dart';
import '../painel/financeiro.dart';
import '../painel/motoristas.dart';
import '../painel/painel_state.dart';
import '../painel/passageiros.dart';
import '../painel/tarifas.dart';
import '../painel/visao_geral.dart';
import '../state/central_state.dart';
import '../widgets/responsive.dart';
import '../widgets/ui.dart';
import 'settings_screen.dart';

/// Casca da Central: menu lateral com uma aba para cada assunto. A tela
/// inicial e o mapa em tela cheia (Visao Geral).
class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key});

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> with WidgetsBindingObserver {
  int _index = 0;

  /// Abas ja abertas: so carregam quando a pessoa entra nelas.
  final Set<String> _abertas = {'mapa'};

  /// Alertas que ja abriram a janela de SOS sozinhos.
  final Set<String> _abertosAutomatico = {};

  /// Cadastro novo cuja janela de aviso esta aberta agora.
  String? _avisoPendenteAberto;

  late final PainelState _painel;

  /// Abas da Central. As marcadas [soDono] somem para o operador de uma
  /// cidade (Evandro, 08/10/2026: a sobrinha em Teutonia cuida da operacao
  /// e das recargas; tarifas, cupons, comissao, cidades e limpeza so ele).
  static const _todas = <_Aba>[
    _Aba('mapa', 'Visão Geral', Icons.map_outlined),
    _Aba('despacho', 'Despacho', Icons.support_agent),
    _Aba('motoristas', 'Motoristas', Icons.badge_outlined),
    _Aba('passageiros', 'Passageiros', Icons.people_outline, soDono: true),
    _Aba('tarifas', 'Tarifas', Icons.price_change_outlined, soDono: true),
    _Aba('financeiro', 'Financeiro', Icons.payments_outlined),
    _Aba('alertas', 'Alertas e Segurança', Icons.sos_outlined, menu: 'Alertas'),
    _Aba('cupons', 'Cupons', Icons.local_offer_outlined, soDono: true),
    _Aba('carteiras', 'Carteiras / Recargas', Icons.account_balance_wallet_outlined),
    _Aba('cidades', 'Cidades e equipe', Icons.location_city_outlined, soDono: true),
    _Aba('limpeza', 'Limpeza de dados', Icons.cleaning_services_outlined, soDono: true),
    _Aba('config', 'Configurações', Icons.settings_outlined, soDono: true),
  ];

  List<_Aba> _abas(PainelState p) => [for (final a in _todas) if (!a.soDono || p.dono) a];

  @override
  void initState() {
    super.initState();
    _painel = context.read<PainelState>();
    _painel.addListener(_sosNovo);
    _painel.addListener(_motoristaNovo);
    _painel.addListener(_fotoNova);
    _painel.iniciar();
    // Alarme do SOS e cadastro novo tambem com a Central minimizada.
    WidgetsBinding.instance.addObserver(this);
    if (AppConfig.hasApi) VigiaCentral.iniciar(AppConfig.apiUrl);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Voltou para a Central: garante o vigia de pe (o Android pode ter derrubado).
    if (state == AppLifecycleState.resumed && AppConfig.hasApi) VigiaCentral.iniciar(AppConfig.apiUrl);
  }

  @override
  void dispose() {
    _painel.removeListener(_sosNovo);
    _painel.removeListener(_motoristaNovo);
    _painel.removeListener(_fotoNova);
    _painel.parar();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// SOS novo: abre a janela fixa na hora, por cima de qualquer aba.
  void _sosNovo() {
    for (final a in _painel.alertasNovos) {
      if (_abertosAutomatico.add(a.id) && mounted) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) abrirSos(context, a);
        });
        break;
      }
    }
  }

  /// Motorista novo esperando aprovacao: janela por cima de qualquer aba
  /// (o SOS tem prioridade e abre antes).
  void _motoristaNovo() {
    final novo = _painel.pendenteNovo;
    if (novo == null || novo.id == _avisoPendenteAberto || _painel.alertasNovos.isNotEmpty) return;
    _avisoPendenteAberto = novo.id;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _abrirAvisoPendente(novo);
    });
  }

  Future<void> _abrirAvisoPendente(MotoristaPendenteResumo novo) async {
    final outros = _painel.indicadores.pendentes - 1;
    final ver = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.person_add_alt_1, color: AppColors.primary, size: 36),
        title: const Text('Motorista aguardando aprovação'),
        content: Text(
          '${novo.nome}${novo.telefone.isEmpty ? '' : ' · ${telefoneBonito(novo.telefone)}'} terminou o cadastro no aplicativo do motorista.'
          '${outros > 0 ? '\n\nHá mais $outros cadastro(s) na fila.' : ''}'
          '\n\nConfira os dados (e as fotos, se enviou) e aprove ou recuse.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Depois')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Ver cadastro')),
        ],
      ),
    );
    _avisoPendenteAberto = null;
    await _painel.marcarPendenteVisto();
    if (ver != true || !mounted) return;
    _irPara('motoristas');
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DetalheMotorista(id: novo.id)));
    if (mounted) await context.read<CentralState>().loadAll();
  }

  /// Motorista ativo trocou a foto de perfil (ou mandou documento novo):
  /// janela para conferir. SOS e cadastro novo vem antes.
  String? _avisoFotoAberto;

  void _fotoNova() {
    final doc = _painel.fotoNova;
    if (doc == null || doc.id == _avisoFotoAberto || _avisoPendenteAberto != null || _painel.alertasNovos.isNotEmpty) return;
    if (_painel.pendenteNovo != null) return;
    _avisoFotoAberto = doc.id;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _abrirAvisoFoto(doc);
    });
  }

  Future<void> _abrirAvisoFoto(DocumentoParaConferir doc) async {
    final outros = _painel.indicadores.paraConferir - 1;
    final ver = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: Icon(
          doc.ehCarro
              ? Icons.directions_car_outlined
              : (doc.ehFotoDePerfil ? Icons.face_retouching_natural : Icons.description_outlined),
          color: AppColors.primary,
          size: 36,
        ),
        title: Text(doc.ehCarro
            ? 'Carro novo para conferir'
            : (doc.ehFotoDePerfil ? 'Foto nova para conferir' : 'Documento para conferir')),
        content: Text(
          doc.ehCarro
              ? '${doc.nome} cadastrou outro carro no aplicativo${doc.placa == null ? '' : ' (placa ${doc.placa})'}. '
                  'Confira a foto do carro e o CRLV e aprove ou recuse. Até aprovar, ele não roda com esse carro.'
              : doc.ehFotoDePerfil
                  ? '${doc.nome} trocou a foto de perfil no aplicativo. Os passageiros continuam vendo a foto antiga até você aprovar a nova.'
                  : '${doc.nome} tem ${nomeDoDocumento(doc.tipo)} esperando a Central. Confira e aprove ou recuse.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Depois')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Conferir')),
        ],
      ),
    );
    _avisoFotoAberto = null;
    await _painel.marcarDocumentoVisto();
    if (ver != true || !mounted) return;
    _irPara('motoristas');
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DetalheMotorista(id: doc.motoristaId)));
    if (outros > 0 && mounted) avisar(context, 'Há mais $outros documento(s) para conferir em Motoristas → Ativos.');
  }

  /// Aba aberta, pelo codigo (a lista muda conforme quem esta na Central).
  String _atual = 'mapa';

  void _ir(int i) {
    final abas = _abas(_painel);
    if (i < 0 || i >= abas.length) return;
    _irPara(abas[i].id);
  }

  void _irPara(String id) => setState(() {
        _atual = id;
        _abertas.add(id);
      });

  Widget _aba(String id) {
    if (!_abertas.contains(id)) return const SizedBox.shrink();
    switch (id) {
      case 'mapa':
        return VisaoGeral(abrirDespacho: () => _irPara('despacho'));
      case 'despacho':
        return const Despacho();
      case 'motoristas':
        return const Motoristas();
      case 'passageiros':
        return const Passageiros();
      case 'tarifas':
        return const TarifasTela();
      case 'financeiro':
        return const Financeiro();
      case 'alertas':
        return const Alertas();
      case 'cupons':
        return const CuponsTela();
      case 'carteiras':
        return const CarteirasTela();
      case 'cidades':
        return const CidadesEquipeTela();
      case 'limpeza':
        return const LimpezaTela();
      default:
        return const SettingsScreen();
    }
  }

  /// Dono: escolhe a cidade no topo (todas, Goiatuba, Teutonia...).
  /// Operador: ve o nome da cidade dele, sem escolher.
  Widget _cidade(PainelState p) {
    final e = p.eu;
    if (e == null || (e.dono && e.pracas.length < 2)) return const SizedBox.shrink();
    if (!e.dono) {
      return Padding(
        padding: const EdgeInsets.only(right: Spacing.sm),
        child: Center(child: AppBadge(text: (e.pracaNome ?? 'Minha cidade').toUpperCase(), tone: AppBadgeTone.info)),
      );
    }
    return PopupMenuButton<String>(
      tooltip: 'Escolher a cidade',
      onSelected: (id) => p.escolherPraca(id == 'todas' ? null : id),
      itemBuilder: (_) => [
        CheckedPopupMenuItem(value: 'todas', checked: p.pracaEscolhida == null, child: const Text('Todas as cidades')),
        for (final c in e.pracas) CheckedPopupMenuItem(value: c.id, checked: p.pracaEscolhida == c.id, child: Text(c.rotulo)),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Spacing.xs),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.location_city, size: 20),
            const SizedBox(width: 4),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 72),
              child: Text(p.pracaEscolhida == null ? 'Todas' : p.nomeDaCidadeNaTela, overflow: TextOverflow.ellipsis, maxLines: 1, style: AppText.caption),
            ),
            const Icon(Icons.arrow_drop_down),
          ],
        ),
      ),
    );
  }

  int _pendentes(PainelState p, CentralState c) => p.atualizadoEm == null ? c.pendingCount : p.indicadores.pendentes;

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PainelState>();
    final central = context.watch<CentralState>();
    final fila = p.corridas.where((c) => c.naFila).length;

    final abas = _abas(p);
    // A aba aberta sumiu (ex.: a conta e de operador): volta para o mapa.
    if (!abas.any((a) => a.id == _atual)) _atual = 'mapa';
    _index = abas.indexWhere((a) => a.id == _atual);
    int? badge(String id) => switch (id) {
          'despacho' => fila == 0 ? null : fila,
          // Ao vivo (a cada 5 s), nao so quando a Central abre.
          'motoristas' => _pendentes(p, central) == 0 ? null : _pendentes(p, central),
          'alertas' => p.alertas.isEmpty ? null : p.alertas.length,
          _ => null,
        };
    final destinos = <ShellDestination>[
      for (final a in abas) ShellDestination(icon: a.icone, label: a.menu ?? a.titulo, badge: badge(a.id)),
    ];

    return ResponsiveShell(
      title: abas[_index].titulo,
      destinationIndex: _index,
      onDestinationSelected: _ir,
      destinations: destinos,
      actions: [
        _cidade(p),
        IconButton(
          tooltip: 'Atualizar',
          onPressed: () {
            p.atualizar();
            central.loadAll();
          },
          icon: const Icon(Icons.refresh),
        ),
        Padding(
          padding: const EdgeInsets.only(right: Spacing.md),
          child: Center(
            child: AppBadge(
              text: p.erro == null ? 'AO VIVO' : 'SEM SINAL',
              tone: p.erro == null ? AppBadgeTone.success : AppBadgeTone.danger,
            ),
          ),
        ),
      ],
      child: Stack(
        children: [
          Positioned.fill(
            child: IndexedStack(
              index: _index,
              // Trocou a cidade no topo: cada aba recarrega do zero, ja filtrada.
              children: [for (final a in abas) KeyedSubtree(key: ValueKey('${a.id}|${p.pracaEscolhida}'), child: _aba(a.id))],
            ),
          ),
          if (p.alertas.isNotEmpty)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Material(
                color: AppColors.danger,
                child: InkWell(
                  onTap: () => abrirSos(context, p.alertas.first),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: Spacing.lg, vertical: Spacing.md),
                    child: Row(
                      children: [
                        const Icon(Icons.sos, color: Colors.white, size: 28),
                        const SizedBox(width: Spacing.md),
                        Expanded(
                          child: Text(
                            p.alertas.length == 1
                                ? 'SOS: ${p.alertas.first.papelNome} ${p.alertas.first.quem} pediu socorro'
                                : '${p.alertas.length} pedidos de SOS abertos',
                            style: AppText.bodyStrong.copyWith(color: Colors.white),
                          ),
                        ),
                        const Text('ABRIR', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Aba {
  const _Aba(this.id, this.titulo, this.icone, {this.soDono = false, this.menu});

  final String id;
  final String titulo;
  final IconData icone;

  /// So o dono da Central ve esta aba.
  final bool soDono;

  /// Nome mais curto no menu (ex.: "Alertas").
  final String? menu;
}
