import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/avisos.dart';
import '../core/central.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/driver_models.dart';
import '../state/driver_state.dart';

/// Carteira pre-paga: o passageiro paga direto ao motorista, e a comissao
/// de cada corrida sai daqui. O motorista recarrega por Pix com a Central.
class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  bool _carregando = true;

  @override
  void initState() {
    super.initState();
    _recarregar();
  }

  Future<void> _recarregar() async {
    await context.read<DriverState>().carregarCarteira();
    if (mounted) setState(() => _carregando = false);
  }

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final c = driver.carteira;

    return Scaffold(
      appBar: AppBar(title: const Text('Carteira')),
      body: RefreshIndicator(
        onRefresh: _recarregar,
        child: c == null
            ? ListView(
                children: [
                  const SizedBox(height: 160),
                  Center(
                    child: _carregando
                        ? const CircularProgressIndicator()
                        : Text(
                            'Não foi possível carregar a carteira.\nPuxe para baixo para tentar de novo.',
                            textAlign: TextAlign.center,
                            style: AppText.body.copyWith(color: AppColors.textMuted),
                          ),
                  ),
                ],
              )
            : ListView(
                children: [
                  _Saldo(carteira: c),
                  const SizedBox(height: Spacing.md),
                  Container(
                    color: AppColors.surface,
                    padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.sm),
                    child: Text('Histórico da carteira', style: AppText.title.copyWith(fontSize: 22)),
                  ),
                  if (c.entries.isEmpty)
                    Container(
                      color: AppColors.surface,
                      padding: const EdgeInsets.all(Spacing.xl),
                      child: Text(
                        'Nenhum lançamento ainda. As recargas e a comissão de cada corrida aparecem aqui.',
                        style: AppText.body.copyWith(color: AppColors.textMuted),
                      ),
                    )
                  else
                    for (final e in c.entries) _Lancamento(entrada: e),
                  const SizedBox(height: Spacing.xxl),
                ],
              ),
      ),
    );
  }
}

class _Saldo extends StatelessWidget {
  const _Saldo({required this.carteira});

  final WalletInfo carteira;

  @override
  Widget build(BuildContext context) {
    final c = carteira;
    final alerta = c.isInsufficient || c.isLow;
    final cor = c.isInsufficient ? AppColors.danger : (c.isLow ? AppColors.warning : AppColors.text);
    final rotulo = c.isInsufficient
        ? 'Saldo insuficiente'
        : c.isLow
            ? 'Saldo se esgotando'
            : 'Saldo disponível';

    return Container(
      color: AppColors.surface,
      padding: const EdgeInsets.all(Spacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(rotulo, style: AppText.body.copyWith(color: AppColors.textMuted, fontSize: 17)),
          const SizedBox(height: Spacing.xs),
          Row(
            children: [
              if (alerta) ...[
                Icon(Icons.error, color: cor, size: 30),
                const SizedBox(width: Spacing.sm),
              ],
              Flexible(
                child: Text(
                  formatMoney(c.balanceCents),
                  style: AppText.display.copyWith(color: cor, fontSize: 36),
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.xs),
          GestureDetector(
            onTap: () => _explicarMinimo(context, c.minimumCents),
            child: Row(
              children: [
                Text(
                  'Limite mínimo de ${formatMoney(c.minimumCents)}',
                  style: AppText.bodyStrong.copyWith(fontSize: 17),
                ),
                const SizedBox(width: Spacing.sm),
                const Icon(Icons.info, size: 20, color: AppColors.textFaint),
              ],
            ),
          ),
          const SizedBox(height: Spacing.sm),
          Text(
            alerta
                ? 'Adicione créditos ou você deixará de receber corridas.'
                : 'A comissão de cada corrida é descontada deste saldo.',
            style: AppText.body.copyWith(color: AppColors.textMuted, fontSize: 16),
          ),
          const SizedBox(height: Spacing.xl),
          InkWell(
            borderRadius: BorderRadius.circular(Radii.sm),
            onTap: () => _mostrarRecarga(context, c.central),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    border: Border.all(color: AppColors.text, width: 1.6),
                    borderRadius: BorderRadius.circular(Radii.sm),
                  ),
                  child: const Icon(Icons.add, size: 38, color: AppColors.text),
                ),
                const SizedBox(height: Spacing.sm),
                Text('Adicionar', style: AppText.bodyStrong.copyWith(fontSize: 17)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _explicarMinimo(BuildContext context, int minimo) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Saldo mínimo'),
        content: Text(
          'O passageiro paga a corrida direto para você. A comissão da '
          'plataforma é descontada desta carteira.\n\n'
          'Com saldo abaixo de ${formatMoney(minimo)} você deixa de receber '
          'novas corridas até recarregar.',
        ),
        actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Entendi'))],
      ),
    );
  }

  void _mostrarRecarga(BuildContext context, CentralContact central) {
    final nome = context.read<DriverState>().profile?.name ?? '';
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.lg))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.lg, Spacing.xl, Spacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: Spacing.lg),
              Text('Adicionar créditos', style: AppText.title),
              const SizedBox(height: Spacing.lg),
              const _Passo(numero: '1', texto: 'Faça um Pix do valor que quiser para a Central.'),
              if (central.pixKey != null && central.pixKey!.isNotEmpty) ...[
                const SizedBox(height: Spacing.sm),
                Container(
                  padding: const EdgeInsets.all(Spacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(Radii.sm),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Chave Pix', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                            Text(central.pixKey!, style: AppText.bodyStrong.copyWith(fontSize: 16)),
                            if (central.pixHolder != null && central.pixHolder!.isNotEmpty)
                              Text(central.pixHolder!, style: AppText.caption.copyWith(color: AppColors.textMuted)),
                          ],
                        ),
                      ),
                      TextButton.icon(
                        onPressed: () async {
                          await Clipboard.setData(ClipboardData(text: central.pixKey!));
                          avisar('Chave Pix copiada.');
                        },
                        icon: const Icon(Icons.copy, size: 18),
                        label: const Text('Copiar'),
                      ),
                    ],
                  ),
                ),
              ] else
                Padding(
                  padding: const EdgeInsets.only(left: 40, top: 4),
                  child: Text(
                    'Peça a chave Pix à Central pelo WhatsApp.',
                    style: AppText.body.copyWith(color: AppColors.textMuted),
                  ),
                ),
              const SizedBox(height: Spacing.md),
              const _Passo(numero: '2', texto: 'Envie o comprovante para a Central pelo WhatsApp.'),
              const SizedBox(height: Spacing.md),
              const _Passo(numero: '3', texto: 'A Central lança o crédito e ele aparece aqui na carteira.'),
              const SizedBox(height: Spacing.xl),
              SizedBox(
                height: 54,
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.sm)),
                  ),
                  onPressed: () => abrirWhatsApp(
                    central.whatsapp,
                    'Olá! Sou o motorista $nome da Fortaleza Mov. '
                    'Segue o comprovante da recarga da minha carteira.',
                  ),
                  icon: const Icon(Icons.chat),
                  label: Text('Enviar comprovante no WhatsApp', style: AppText.button.copyWith(color: Colors.white)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Passo extends StatelessWidget {
  const _Passo({required this.numero, required this.texto});

  final String numero;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: AppColors.brandSoft, shape: BoxShape.circle),
          child: Text(numero, style: AppText.bodyStrong.copyWith(color: AppColors.brand)),
        ),
        const SizedBox(width: Spacing.md),
        Expanded(child: Text(texto, style: AppText.body.copyWith(fontSize: 16))),
      ],
    );
  }
}

class _Lancamento extends StatelessWidget {
  const _Lancamento({required this.entrada});

  final WalletEntry entrada;

  @override
  Widget build(BuildContext context) {
    final e = entrada;
    final credito = e.isCredit;
    final valor = credito ? formatMoney(e.amountCents) : 'R\$ -${formatMoney(e.amountCents.abs()).replaceAll('R\$', '').trim()}';

    return Container(
      color: AppColors.surface,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Spacing.xl, vertical: Spacing.lg),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: credito ? AppColors.primary : AppColors.surfaceElevated,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    credito ? Icons.arrow_downward : Icons.arrow_upward,
                    color: credito ? Colors.white : AppColors.text,
                  ),
                ),
                const SizedBox(width: Spacing.lg),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(diaMesHora(e.createdAt), style: AppText.body.copyWith(color: AppColors.textMuted, fontSize: 16)),
                      const SizedBox(height: 2),
                      Text(
                        valor,
                        style: AppText.heading.copyWith(color: credito ? AppColors.primary : AppColors.text, fontSize: 19),
                      ),
                      const SizedBox(height: 2),
                      Text(e.title, style: AppText.bodyStrong.copyWith(fontSize: 17)),
                      if (e.subtitle.isNotEmpty)
                        Text(e.subtitle, style: AppText.body.copyWith(color: AppColors.textMuted, fontSize: 16)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1, indent: Spacing.xl, endIndent: Spacing.xl),
        ],
      ),
    );
  }
}
