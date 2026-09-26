import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/central_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/central_models.dart';
import '../state/central_state.dart';
import '../widgets/ui.dart';

/// Carteiras dos motoristas (pre-pagas).
///
/// O passageiro paga direto ao motorista; a comissao de cada corrida sai
/// da carteira dele. O motorista faz um Pix para a Central e manda o
/// comprovante; aqui a Central lanca o credito.
class WalletsScreen extends StatefulWidget {
  const WalletsScreen({super.key});

  @override
  State<WalletsScreen> createState() => _WalletsScreenState();
}

class _WalletsScreenState extends State<WalletsScreen> {
  final ApiClient _api = ApiClient();
  final Map<String, int?> _saldos = {};
  Map<String, dynamic>? _config;
  bool _carregando = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _carregar());
  }

  Future<void> _carregar() async {
    setState(() => _carregando = true);
    final central = context.read<CentralState>();
    try {
      _config = await _api.request('GET', '/admin/settings/central') as Map<String, dynamic>;
    } catch (_) {
      _config = null;
    }
    for (final m in central.approved) {
      try {
        final w = await _api.request('GET', '/admin/drivers/${m.id}/wallet') as Map<String, dynamic>;
        _saldos[m.id] = (w['balanceCents'] as num?)?.toInt();
      } catch (_) {
        _saldos[m.id] = null;
      }
    }
    if (mounted) setState(() => _carregando = false);
  }

  int get _minimo => (_config?['minimumCents'] as num?)?.toInt() ?? 200;
  bool get _bloqueio => _config?['blockWhenInsufficient'] == true;
  bool _salvandoBloqueio = false;

  Future<void> _alternarBloqueio(bool ligar) async {
    if (ligar) {
      final abaixo = context
          .read<CentralState>()
          .approved
          .where((m) => (_saldos[m.id] ?? 0) < _minimo)
          .length;
      final confirmou = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: AppColors.surface,
          title: Text('Ligar o bloqueio?', style: AppText.heading),
          content: Text(
            abaixo == 0
                ? 'Motorista com saldo abaixo de ${formatMoney(_minimo)} deixa de receber chamados até recarregar.'
                : 'Hoje $abaixo motorista(s) está(ão) abaixo de ${formatMoney(_minimo)} e vão parar de receber '
                    'chamados até recarregar.',
            style: AppText.body,
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
            TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Ligar')),
          ],
        ),
      );
      if (confirmou != true || !mounted) return;
    }
    setState(() => _salvandoBloqueio = true);
    try {
      _config = await _api.request('PUT', '/admin/settings/central', body: {'blockWhenInsufficient': ligar})
          as Map<String, dynamic>;
      _aviso(ligar ? 'Bloqueio por saldo ligado.' : 'Bloqueio por saldo desligado.');
    } on ApiException catch (e) {
      _aviso(e.message);
    } catch (_) {
      _aviso('Não foi possível salvar agora.');
    }
    if (mounted) setState(() => _salvandoBloqueio = false);
  }

  Future<void> _lancar(DriverApplication m) async {
    final valor = TextEditingController();
    final descricao = TextEditingController(text: 'Recarga via Pix');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('Lançar crédito — ${m.name}', style: AppText.heading),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppField(
              label: 'Valor em reais',
              hint: 'Ex.: 20,00',
              controller: valor,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
            const SizedBox(height: Spacing.md),
            AppField(label: 'Descrição', controller: descricao),
            const SizedBox(height: Spacing.sm),
            Text(
              'Para corrigir um lançamento, use valor negativo (ex.: -5,00).',
              style: AppText.caption.copyWith(color: AppColors.textMuted),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Lançar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    final texto = valor.text.trim().replaceAll('.', '').replaceAll(',', '.');
    final reais = double.tryParse(texto);
    if (reais == null || reais == 0) {
      _aviso('Valor inválido.');
      return;
    }
    try {
      final w = await _api.request('POST', '/admin/drivers/${m.id}/wallet/credit', body: {
        'amountCents': (reais * 100).round(),
        'description': descricao.text.trim(),
      }) as Map<String, dynamic>;
      setState(() => _saldos[m.id] = (w['balanceCents'] as num?)?.toInt());
      _aviso('Crédito lançado. Novo saldo: ${formatMoney((w['balanceCents'] as num?)?.toInt() ?? 0)}');
    } on ApiException catch (e) {
      _aviso(e.message);
    } catch (_) {
      _aviso('Não foi possível lançar agora. Tente de novo.');
    }
  }

  Future<void> _editarContato() async {
    final c = (_config?['central'] as Map<String, dynamic>?) ?? const {};
    final zap = TextEditingController(text: c['whatsapp'] as String? ?? '');
    final pix = TextEditingController(text: c['pixKey'] as String? ?? '');
    final titular = TextEditingController(text: c['pixHolder'] as String? ?? '');
    final minimo = TextEditingController(text: formatMoney(_minimo).replaceAll(RegExp(r'[^0-9,]'), ''));

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('Recarga dos motoristas', style: AppText.heading),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppField(label: 'WhatsApp da Central', hint: '5564999999999', controller: zap, keyboardType: TextInputType.phone),
              const SizedBox(height: Spacing.md),
              AppField(label: 'Chave Pix', controller: pix),
              const SizedBox(height: Spacing.md),
              AppField(label: 'Nome do titular do Pix', controller: titular),
              const SizedBox(height: Spacing.md),
              AppField(
                label: 'Saldo mínimo (R\$)',
                controller: minimo,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Salvar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    final min = double.tryParse(minimo.text.trim().replaceAll('.', '').replaceAll(',', '.'));
    final numero = zap.text.replaceAll(RegExp(r'\D'), '');
    try {
      _config = await _api.request('PUT', '/admin/settings/central', body: {
        'whatsapp': numero.isEmpty ? null : numero,
        'pixKey': pix.text.trim().isEmpty ? null : pix.text.trim(),
        'pixHolder': titular.text.trim().isEmpty ? null : titular.text.trim(),
        if (min != null) 'minimumCents': (min * 100).round(),
      }) as Map<String, dynamic>;
      if (mounted) setState(() {});
      _aviso('Dados da recarga salvos.');
    } on ApiException catch (e) {
      _aviso(e.message);
    } catch (_) {
      _aviso('Não foi possível salvar agora.');
    }
  }

  void _aviso(String texto) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(texto)));
  }

  @override
  Widget build(BuildContext context) {
    final motoristas = context.watch<CentralState>().approved;
    final c = (_config?['central'] as Map<String, dynamic>?) ?? const {};

    return RefreshIndicator(
      onRefresh: _carregar,
      child: ListView(
        padding: const EdgeInsets.all(Spacing.lg),
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text('Recarga dos motoristas', style: AppText.heading)),
                    TextButton(onPressed: _editarContato, child: const Text('Editar')),
                  ],
                ),
                const SizedBox(height: Spacing.xs),
                _Info(rotulo: 'WhatsApp', valor: c['whatsapp'] as String? ?? '—'),
                _Info(rotulo: 'Chave Pix', valor: c['pixKey'] as String? ?? 'não informada'),
                _Info(rotulo: 'Titular', valor: c['pixHolder'] as String? ?? '—'),
                _Info(rotulo: 'Saldo mínimo', valor: formatMoney(_minimo)),
                const Divider(height: Spacing.xl),
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Bloquear sem saldo', style: AppText.bodyStrong),
                          Text(
                            _bloqueio
                                ? 'Ligado: abaixo do mínimo o motorista não recebe chamados.'
                                : 'Desligado: o motorista só recebe o aviso para recarregar.',
                            style: AppText.caption.copyWith(color: AppColors.textMuted),
                          ),
                        ],
                      ),
                    ),
                    Switch(
                      value: _bloqueio,
                      activeTrackColor: AppColors.success,
                      onChanged: _salvandoBloqueio || _config == null ? null : _alternarBloqueio,
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: Spacing.lg),
          const SectionTitle(text: 'Motoristas aprovados'),
          if (_carregando && _saldos.isEmpty)
            const Padding(
              padding: EdgeInsets.all(Spacing.xl),
              child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
            )
          else if (motoristas.isEmpty)
            const EmptyState(title: 'Nenhum motorista aprovado', description: 'Aprove motoristas para ver as carteiras.')
          else
            for (final m in motoristas) ...[
              _LinhaMotorista(
                motorista: m,
                saldo: _saldos[m.id],
                minimo: _minimo,
                onLancar: () => _lancar(m),
              ),
              const SizedBox(height: Spacing.sm),
            ],
        ],
      ),
    );
  }
}

class _Info extends StatelessWidget {
  const _Info({required this.rotulo, required this.valor});

  final String rotulo;
  final String valor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(width: 110, child: Text(rotulo, style: AppText.caption.copyWith(color: AppColors.textMuted))),
          Expanded(child: Text(valor, style: AppText.body)),
        ],
      ),
    );
  }
}

class _LinhaMotorista extends StatelessWidget {
  const _LinhaMotorista({required this.motorista, required this.saldo, required this.minimo, required this.onLancar});

  final DriverApplication motorista;
  final int? saldo;
  final int minimo;
  final VoidCallback onLancar;

  @override
  Widget build(BuildContext context) {
    final s = saldo;
    final cor = s == null
        ? AppColors.textMuted
        : s < minimo
            ? AppColors.danger
            : s < minimo * 3
                ? AppColors.warning
                : AppColors.success;

    return AppCard(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(motorista.name.isEmpty ? 'Motorista' : motorista.name, style: AppText.bodyStrong),
                Text(motorista.phone, style: AppText.caption.copyWith(color: AppColors.textMuted)),
                const SizedBox(height: Spacing.xs),
                Text(s == null ? 'Saldo indisponível' : 'Saldo ${formatMoney(s)}',
                    style: AppText.bodyStrong.copyWith(color: cor)),
              ],
            ),
          ),
          SizedBox(
            width: 150,
            child: AppButton(label: 'Lançar crédito', icon: Icons.add, onPressed: onLancar),
          ),
        ],
      ),
    );
  }
}
