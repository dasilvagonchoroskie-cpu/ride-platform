import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../data/models/central_models.dart';
import '../state/central_state.dart';
import '../widgets/ui.dart';

/// Gerenciamento das bandeiras.
///
/// Modalidade unica: nao ha categoria de veiculo. O que muda o preco e a
/// HORA da corrida, e sao duas faixas — diurna e noturna.
///
/// As duas sao salvas juntas de proposito. Salvar uma so abriria a chance
/// de deixar um pedaco do dia sem tabela de preco; o servidor recusa se as
/// faixas nao se encaixarem.
class FareConfigScreen extends StatefulWidget {
  const FareConfigScreen({super.key});

  @override
  State<FareConfigScreen> createState() => _FareConfigScreenState();
}

class _FareConfigScreenState extends State<FareConfigScreen> {
  final _diurna = _CamposDaBandeira();
  final _noturna = _CamposDaBandeira();
  bool _preenchido = false;

  @override
  void dispose() {
    _diurna.dispose();
    _noturna.dispose();
    super.dispose();
  }

  void _preencher(Tariffs t) {
    _diurna.preencher(t.diurna);
    _noturna.preencher(t.noturna);
    _preenchido = true;
  }

  Future<void> _salvar(Tariffs atual) async {
    final erro = _diurna.erro ?? _noturna.erro;
    if (erro != null) {
      _avisar(erro, certo: false);
      return;
    }

    final novo = Tariffs(
      diurna: _diurna.montar(atual.diurna),
      noturna: _noturna.montar(atual.noturna),
    );

    final ok = await context.read<CentralState>().saveTariffs(novo);
    if (!mounted) return;

    _avisar(
      ok
          ? 'Bandeiras salvas. Ja valem na proxima corrida.'
          : (context.read<CentralState>().error ?? 'Falha ao salvar as bandeiras.'),
      certo: ok,
    );
  }

  void _avisar(String texto, {required bool certo}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(texto, style: AppText.body.copyWith(color: AppColors.text)),
        backgroundColor: certo ? AppColors.primary : AppColors.danger,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final central = context.watch<CentralState>();
    final tarifas = central.tariffs;

    if (tarifas == null) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }
    if (!_preenchido) _preencher(tarifas);

    final largo = MediaQuery.of(context).size.width >= 900;

    final secoes = [
      _SecaoDaBandeira(campos: _diurna, flag: FareFlag.diurna),
      _SecaoDaBandeira(campos: _noturna, flag: FareFlag.noturna),
    ];

    return ListView(
      padding: const EdgeInsets.all(Spacing.lg),
      children: [
        const SectionTitle(text: 'Bandeiras'),
        Text(
          'A bandeirada ja inclui a franquia. So o que passa dela e cobrado a mais.',
          style: AppText.body.copyWith(color: AppColors.textMuted),
        ),
        const SizedBox(height: Spacing.lg),

        if (largo)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: secoes[0]),
              const SizedBox(width: Spacing.lg),
              Expanded(child: secoes[1]),
            ],
          )
        else ...[
          secoes[0],
          const SizedBox(height: Spacing.lg),
          secoes[1],
        ],

        const SizedBox(height: Spacing.xl),
        AppButton(
          label: 'Salvar configuracoes',
          loading: central.loading,
          onPressed: () => _salvar(tarifas),
        ),
        const SizedBox(height: Spacing.md),
        Text(
          'As duas bandeiras sao salvas juntas: uma precisa terminar na hora '
          'em que a outra comeca, para nao sobrar horario sem tabela.',
          style: AppText.body.copyWith(color: AppColors.textMuted),
        ),
      ],
    );
  }
}

/// Os campos de uma bandeira.
///
/// O administrador digita em reais e minutos, que e como ele pensa. A
/// conversao para centavos e segundos acontece aqui, num lugar so — e
/// dinheiro sempre vira inteiro, nunca decimal.
class _CamposDaBandeira {
  final inicio = TextEditingController();
  final fim = TextEditingController();
  final bandeirada = TextEditingController();
  final porKm = TextEditingController();
  final porMinuto = TextEditingController();
  final franquiaKm = TextEditingController();
  final franquiaMin = TextEditingController();
  final minimo = TextEditingController();
  final cancelamento = TextEditingController();
  final comissao = TextEditingController();

  void preencher(TariffFlag t) {
    inicio.text = '${t.startHour}';
    fim.text = '${t.endHour}';
    bandeirada.text = _reais(t.baseFareCents);
    porKm.text = _reais(t.perKmCents);
    porMinuto.text = _reais(t.waitingPerMinuteCents);
    franquiaKm.text = (t.freeDistanceMeters / 1000).toStringAsFixed(1).replaceAll('.', ',');
    franquiaMin.text = '${(t.freeWaitingSeconds / 60).round()}';
    minimo.text = _reais(t.minFareCents);
    cancelamento.text = _reais(t.cancellationFeeCents);
    comissao.text = t.commissionPercent.toStringAsFixed(0);
  }

  /// A primeira coisa errada que encontrar, ou nulo se estiver tudo certo.
  String? get erro {
    final hi = _inteiro(inicio.text), hf = _inteiro(fim.text);
    if (hi == null || hi < 0 || hi > 23) return 'Hora de inicio invalida.';
    if (hf == null || hf < 0 || hf > 23) return 'Hora de termino invalida.';
    if (hi == hf) return 'A faixa nao pode comecar e terminar na mesma hora.';
    if (_centavos(bandeirada.text) == null) return 'Bandeirada invalida.';
    if (_centavos(porKm.text) == null) return 'Valor por km invalido.';
    if (_centavos(porMinuto.text) == null) return 'Valor por minuto invalido.';
    if (_decimal(franquiaKm.text) == null) return 'Franquia de distancia invalida.';
    if (_inteiro(franquiaMin.text) == null) return 'Franquia de tempo invalida.';
    return null;
  }

  TariffFlag montar(TariffFlag base) => base.copyWith(
        startHour: _inteiro(inicio.text),
        endHour: _inteiro(fim.text),
        baseFareCents: _centavos(bandeirada.text),
        perKmCents: _centavos(porKm.text),
        waitingPerMinuteCents: _centavos(porMinuto.text),
        freeDistanceMeters: ((_decimal(franquiaKm.text) ?? 1.5) * 1000).round(),
        freeWaitingSeconds: (_inteiro(franquiaMin.text) ?? 3) * 60,
        minFareCents: _centavos(minimo.text),
        cancellationFeeCents: _centavos(cancelamento.text),
        commissionPercent: _decimal(comissao.text),
      );

  void dispose() {
    for (final c in [
      inicio, fim, bandeirada, porKm, porMinuto,
      franquiaKm, franquiaMin, minimo, cancelamento, comissao,
    ]) {
      c.dispose();
    }
  }

  static String _reais(int cents) => (cents / 100).toStringAsFixed(2).replaceAll('.', ',');

  static int? _inteiro(String v) => int.tryParse(v.trim());

  static double? _decimal(String v) => double.tryParse(v.trim().replaceAll(',', '.'));

  /// "12,50" vira 1250. Arredonda no fim para nao guardar meio centavo.
  static int? _centavos(String v) {
    final d = _decimal(v);
    return d == null ? null : (d * 100).round();
  }
}

class _SecaoDaBandeira extends StatelessWidget {
  const _SecaoDaBandeira({required this.campos, required this.flag});

  final _CamposDaBandeira campos;
  final FareFlag flag;

  @override
  Widget build(BuildContext context) {
    final noturna = flag == FareFlag.noturna;

    return Container(
      padding: const EdgeInsets.all(Spacing.lg),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: noturna ? AppColors.primary : AppColors.border, width: 1.5),
        borderRadius: BorderRadius.circular(Radii.sm),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(
                noturna ? Icons.nightlight_round : Icons.wb_sunny_outlined,
                size: 20,
                color: noturna ? AppColors.primary : AppColors.textMuted,
              ),
              const SizedBox(width: Spacing.sm),
              Expanded(child: Text(flag.titulo, style: AppText.title)),
            ],
          ),
          const SizedBox(height: Spacing.lg),

          Row(
            children: [
              Expanded(
                child: AppField(
                  label: 'Comeca as (hora)',
                  controller: campos.inicio,
                  keyboardType: TextInputType.number,
                ),
              ),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: AppField(
                  label: 'Termina as (hora)',
                  controller: campos.fim,
                  keyboardType: TextInputType.number,
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.md),

          AppField(
            label: 'Bandeirada (R\$)',
            controller: campos.bandeirada,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            helper: 'Valor fixo, cobrado assim que a corrida comeca.',
          ),
          const SizedBox(height: Spacing.md),

          Row(
            children: [
              Expanded(
                child: AppField(
                  label: 'Franquia de distancia (km)',
                  controller: campos.franquiaKm,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                ),
              ),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: AppField(
                  label: 'Franquia de espera (min)',
                  controller: campos.franquiaMin,
                  keyboardType: TextInputType.number,
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.xs),
          Text(
            'Ja inclusos na bandeirada. So o excedente e cobrado.',
            style: AppText.body.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: Spacing.md),

          AppField(
            label: 'Valor por km excedente (R\$)',
            controller: campos.porKm,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          const SizedBox(height: Spacing.md),

          AppField(
            label: 'Valor por minuto parado excedente (R\$)',
            controller: campos.porMinuto,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          const SizedBox(height: Spacing.md),

          Row(
            children: [
              Expanded(
                child: AppField(
                  label: 'Minimo da corrida (R\$)',
                  controller: campos.minimo,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                ),
              ),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: AppField(
                  label: 'Multa de cancelamento (R\$)',
                  controller: campos.cancelamento,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.md),

          AppField(
            label: 'Comissao da plataforma (%)',
            controller: campos.comissao,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
        ],
      ),
    );
  }
}
