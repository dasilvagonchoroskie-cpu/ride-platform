import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/driver_models.dart';
import '../state/driver_state.dart';
import '../widgets/painel_ui.dart';
import 'earnings_history_screen.dart';
import 'wallet_screen.dart';

/// Atividades: ganhos de hoje, da semana e do mes, com grafico por dia,
/// tempo online e tempo trabalhado. Tudo calculado pelo servidor.
class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key});

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

const _periodos = ['day', 'week', 'month'];

class _ActivityScreenState extends State<ActivityScreen> {
  int _aba = 0;
  final List<int> _recuo = [0, 0, 0];
  final Map<String, ActivitySummary> _cache = {};
  bool _carregando = false;
  bool _falhou = false;
  int? _barra;

  String get _chave => '${_periodos[_aba]}:${_recuo[_aba]}';
  ActivitySummary? get _atual => _cache[_chave];

  @override
  void initState() {
    super.initState();
    _carregando = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _carregar();
      context.read<DriverState>().carregarCarteira();
    });
  }

  Future<void> _carregar({bool forcar = false}) async {
    final chave = _chave;
    if (!forcar && _cache.containsKey(chave)) return;
    setState(() {
      _carregando = true;
      _falhou = false;
    });
    final r = await context.read<DriverState>().carregarAtividade(_periodos[_aba], _recuo[_aba]);
    if (!mounted) return;
    setState(() {
      _carregando = false;
      if (r == null) {
        _falhou = true;
      } else {
        _cache[chave] = r;
        _barra = _barraInicial(r);
      }
    });
  }

  /// Seleciona o dia de hoje (se estiver no grafico) ou o ultimo dia.
  int? _barraInicial(ActivitySummary r) {
    if (r.buckets.isEmpty) return null;
    final hoje = DateTime.now();
    final i = r.buckets.indexWhere((b) {
      final d = b.day;
      return d.year == hoje.year && d.month == hoje.month && d.day == hoje.day;
    });
    return i >= 0 ? i : r.buckets.length - 1;
  }

  void _trocarAba(int i) {
    if (i == _aba) return;
    setState(() {
      _aba = i;
      _barra = _atual == null ? null : _barraInicial(_atual!);
    });
    _carregar();
  }

  void _andar(int passo) {
    final novo = _recuo[_aba] + passo;
    if (novo < 0 || novo > 36) return;
    setState(() {
      _recuo[_aba] = novo;
      _barra = _atual == null ? null : _barraInicial(_atual!);
    });
    _carregar();
  }

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final perfil = driver.profile;
    final oculto = driver.ocultarValores;
    final resumo = _atual;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Atividades'),
        actions: [
          IconButton(
            tooltip: oculto ? 'Mostrar valores' : 'Esconder valores',
            icon: Icon(oculto ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 28),
            onPressed: driver.alternarValores,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await _carregar(forcar: true);
          if (context.mounted) await context.read<DriverState>().carregarCarteira();
        },
        child: ListView(
          padding: const EdgeInsets.all(Spacing.lg),
          children: [
            DriverHeader(
              name: perfil?.name ?? 'Motorista',
              initials: perfil?.initials ?? 'M',
              rating: perfil?.rating ?? 5,
            ),
            const SizedBox(height: Spacing.lg),
            AppCardSemBorda(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _Abas(atual: _aba, onTroca: _trocarAba),
                  Padding(
                    padding: const EdgeInsets.all(Spacing.xl),
                    child: resumo == null
                        ? SizedBox(
                            height: 180,
                            child: Center(
                              child: _carregando
                                  ? const CircularProgressIndicator()
                                  : Text(
                                      _falhou
                                          ? 'Sem conexão com o servidor.\nPuxe para baixo para tentar de novo.'
                                          : '',
                                      textAlign: TextAlign.center,
                                      style: AppText.body.copyWith(color: AppColors.textMuted),
                                    ),
                            ),
                          )
                        : _aba == 0
                            ? _Hoje(resumo: resumo, oculto: oculto)
                            : _Periodo(
                                resumo: resumo,
                                semana: _aba == 1,
                                recuo: _recuo[_aba],
                                oculto: oculto,
                                carregando: _carregando,
                                selecionada: _barra,
                                onSelecionar: (i) => setState(() => _barra = i),
                                onAnterior: () => _andar(1),
                                onProximo: _recuo[_aba] > 0 ? () => _andar(-1) : null,
                              ),
                  ),
                  const Divider(height: 1),
                  MenuLinha(
                    titulo: 'Histórico de ganhos',
                    onTap: () {
                      if (resumo == null) return;
                      Navigator.of(context).push(MaterialPageRoute<void>(
                        builder: (_) => EarningsHistoryScreen(resumo: resumo),
                      ));
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: Spacing.md),
            AppCardSemBorda(
              child: MenuLinha(
                titulo: 'Carteira',
                icone: Icons.account_balance_wallet,
                corIcone: AppColors.gold,
                valor: driver.carteira == null ? '—' : dinheiro(driver.carteira!.balanceCents, oculto: oculto),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const WalletScreen())),
              ),
            ),
            const SizedBox(height: Spacing.md),
            AppCardSemBorda(
              child: MenuLinha(
                titulo: 'Taxa de aceitação',
                valor: '${resumo?.acceptanceRate ?? perfil?.acceptanceRate ?? 100}%',
                onTap: () => _explicarAceitacao(context),
              ),
            ),
            const SizedBox(height: Spacing.xl),
          ],
        ),
      ),
    );
  }

  void _explicarAceitacao(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Taxa de aceitação'),
        content: const Text(
          'É a parte dos chamados dos últimos 30 dias que você aceitou. '
          'Recusar ou deixar o tempo acabar conta contra.\n\n'
          'Quanto maior a taxa, mais o sistema confia em mandar corrida para você.',
        ),
        actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Entendi'))],
      ),
    );
  }
}

/// Cartao branco sem borda, cantos de 8.
class AppCardSemBorda extends StatelessWidget {
  const AppCardSemBorda({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(Radii.sm),
        boxShadow: const [BoxShadow(color: Color(0x0F000000), blurRadius: 6, offset: Offset(0, 1))],
      ),
      child: child,
    );
  }
}

class _Abas extends StatelessWidget {
  const _Abas({required this.atual, required this.onTroca});

  final int atual;
  final ValueChanged<int> onTroca;

  static const _nomes = ['Hoje', 'Semanal', 'Mensal'];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.md, Spacing.xl, 0),
      child: Container(
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border, width: 2))),
        child: Row(
          children: [
            for (var i = 0; i < _nomes.length; i++)
              InkWell(
                onTap: () => onTroca(i),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(Spacing.md, Spacing.md, Spacing.md, Spacing.md),
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: i == atual ? AppColors.brand : Colors.transparent, width: 3),
                    ),
                  ),
                  child: Text(
                    _nomes[i],
                    style: AppText.heading.copyWith(
                      fontSize: 19,
                      fontWeight: i == atual ? FontWeight.w700 : FontWeight.w500,
                      color: i == atual ? AppColors.text : AppColors.textMuted,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Hoje extends StatelessWidget {
  const _Hoje({required this.resumo, required this.oculto});

  final ActivitySummary resumo;
  final bool oculto;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Ganhos', style: AppText.body.copyWith(color: AppColors.textMuted, fontSize: 17)),
        const SizedBox(height: Spacing.xs),
        Text(dinheiro(resumo.earningCents, oculto: oculto), style: AppText.display.copyWith(fontSize: 38)),
        const SizedBox(height: Spacing.lg),
        _Linha(icone: Icons.directions_car, texto: corridas(resumo.rides)),
        _Linha(icone: Icons.schedule, texto: '${formatDuracao(resumo.onlineSeconds)} online'),
        _Linha(icone: Icons.work, texto: '${formatDuracao(resumo.workedSeconds)} trabalhados'),
      ],
    );
  }
}

class _Linha extends StatelessWidget {
  const _Linha({required this.icone, required this.texto});

  final IconData icone;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Icon(icone, color: AppColors.textMuted, size: 26),
          const SizedBox(width: Spacing.md),
          Text(texto, style: AppText.body.copyWith(fontSize: 18)),
        ],
      ),
    );
  }
}

class _Periodo extends StatelessWidget {
  const _Periodo({
    required this.resumo,
    required this.semana,
    required this.recuo,
    required this.oculto,
    required this.carregando,
    required this.selecionada,
    required this.onSelecionar,
    required this.onAnterior,
    required this.onProximo,
  });

  final ActivitySummary resumo;
  final bool semana;
  final int recuo;
  final bool oculto;
  final bool carregando;
  final int? selecionada;
  final ValueChanged<int> onSelecionar;
  final VoidCallback onAnterior;
  final VoidCallback? onProximo;

  String get _titulo {
    if (semana) {
      return switch (recuo) { 0 => 'Esta semana', 1 => 'Semana passada', _ => 'Há $recuo semanas' };
    }
    return switch (recuo) { 0 => 'Este mês', 1 => 'Mês passado', _ => 'Há $recuo meses' };
  }

  String get _intervalo {
    if (resumo.buckets.isEmpty) return '';
    final inicio = resumo.buckets.first.day;
    final fim = resumo.buckets.last.day;
    if (semana) return '${diaMes(inicio)} - ${diaMes(fim)}';
    final ano = inicio.year == DateTime.now().year ? '' : ' de ${inicio.year}';
    return '${mesesLongos[inicio.month - 1]}$ano';
  }

  @override
  Widget build(BuildContext context) {
    final b = resumo.buckets;
    final sel = (selecionada != null && selecionada! < b.length) ? b[selecionada!] : null;

    return Column(
      children: [
        Row(
          children: [
            _Seta(icone: Icons.chevron_left, onTap: onAnterior),
            Expanded(
              child: Column(
                children: [
                  Text(_titulo, style: AppText.body.copyWith(color: AppColors.textMuted, fontSize: 17)),
                  Text(_intervalo, style: AppText.heading.copyWith(fontSize: 19, fontWeight: FontWeight.w500)),
                ],
              ),
            ),
            _Seta(icone: Icons.chevron_right, onTap: onProximo),
          ],
        ),
        const SizedBox(height: Spacing.lg),
        Text(
          dinheiro(resumo.earningCents, oculto: oculto),
          style: AppText.display.copyWith(fontSize: 36, fontWeight: FontWeight.w500),
        ),
        Text(
          '${corridas(resumo.rides)}  •  ${formatDuracao(resumo.onlineSeconds)} online',
          style: AppText.body.copyWith(color: AppColors.textMuted),
        ),
        const SizedBox(height: Spacing.lg),
        SizedBox(
          height: 26,
          child: sel == null
              ? null
              : Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(Radii.pill),
                  ),
                  child: Text(
                    '${diaMes(sel.day)}: ${dinheiro(sel.earningCents, oculto: oculto)} • ${corridas(sel.rides)}',
                    style: AppText.bodyStrong,
                  ),
                ),
        ),
        const SizedBox(height: Spacing.sm),
        Opacity(
          opacity: carregando ? 0.4 : 1,
          child: _Grafico(buckets: b, semana: semana, selecionada: selecionada, onSelecionar: onSelecionar),
        ),
      ],
    );
  }
}

class _Seta extends StatelessWidget {
  const _Seta({required this.icone, required this.onTap});

  final IconData icone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final ativa = onTap != null;
    return Material(
      color: ativa ? AppColors.brand : AppColors.brandSoft,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 52,
          height: 52,
          child: Icon(icone, color: ativa ? Colors.white : AppColors.surface, size: 32),
        ),
      ),
    );
  }
}

/// Barras por dia. Toque numa barra para ver o valor do dia.
class _Grafico extends StatelessWidget {
  const _Grafico({
    required this.buckets,
    required this.semana,
    required this.selecionada,
    required this.onSelecionar,
  });

  final List<ActivityBucket> buckets;
  final bool semana;
  final int? selecionada;
  final ValueChanged<int> onSelecionar;

  @override
  Widget build(BuildContext context) {
    final maior = buckets.fold<int>(0, (m, b) => b.earningCents > m ? b.earningCents : m);

    return Column(
      children: [
        SizedBox(
          height: 150,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (var i = 0; i < buckets.length; i++)
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => onSelecionar(i),
                    child: Align(
                      alignment: Alignment.bottomCenter,
                      child: FractionallySizedBox(
                        widthFactor: semana ? 0.62 : 0.72,
                        heightFactor: maior == 0 || buckets[i].earningCents == 0
                            ? 0.0
                            : (buckets[i].earningCents / maior).clamp(0.04, 1.0),
                        child: Container(
                          decoration: BoxDecoration(
                            color: i == selecionada ? AppColors.brandDark : AppColors.brand,
                            borderRadius: const BorderRadius.vertical(top: Radius.circular(2)),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Container(height: 1.2, color: AppColors.text),
        const SizedBox(height: Spacing.sm),
        Row(
          children: [
            for (var i = 0; i < buckets.length; i++)
              Expanded(
                child: Text(
                  semana ? diasCurtos[i % 7] : (i % 5 == 0 ? '${i + 1}' : ''),
                  textAlign: TextAlign.center,
                  softWrap: false,
                  overflow: TextOverflow.visible,
                  style: AppText.body.copyWith(
                    fontSize: semana ? 16 : 15,
                    fontWeight: i == selecionada ? FontWeight.w700 : FontWeight.w400,
                    color: i == selecionada ? AppColors.text : AppColors.textMuted,
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}
