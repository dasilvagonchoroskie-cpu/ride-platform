import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';
import '../data/demo/demo_engine.dart';
import '../widgets/ui.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  static const List<List<String>> _coupons = [
    ['PRIMEIRACORRIDA', 'R\$ 10 de desconto na primeira corrida', 'Vence em 30 dias'],
    ['VOLTEI20', '20% de desconto ate R\$ 15', 'Vence em 7 dias'],
  ];

  final TextEditingController _coupon = TextEditingController();
  String _selected = 'pm1';
  String? _message;

  @override
  void dispose() {
    _coupon.dispose();
    super.dispose();
  }

  void _apply() {
    final code = _coupon.text.trim().toUpperCase();
    final found = _coupons.where((c) => c[0] == code).toList();
    setState(() {
      _message = found.isEmpty
          ? 'Cupom invalido ou expirado.'
          : 'Cupom ${found.first[0]} aplicado.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final methods = DemoEngine.paymentMethods();
    final isError = _message != null && _message!.contains('invalido');

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Pagamento')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SectionTitle(text: 'Formas de pagamento'),
              for (final method in methods)
                Padding(
                  padding: const EdgeInsets.only(bottom: Spacing.sm),
                  child: GestureDetector(
                    onTap: () => setState(() => _selected = method.id),
                    child: Container(
                      padding: const EdgeInsets.all(Spacing.lg),
                      decoration: BoxDecoration(
                        color: _selected == method.id ? AppColors.primarySoft : AppColors.surface,
                        border: Border.all(
                          color: _selected == method.id ? AppColors.primary : AppColors.border,
                        ),
                        borderRadius: BorderRadius.circular(Radii.md),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  method.label,
                                  style: const TextStyle(
                                    color: AppColors.text,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  method.detail,
                                  style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                          if (_selected == method.id)
                            const Icon(Icons.check, color: AppColors.primary, size: 20),
                        ],
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: Spacing.lg),
              const SectionTitle(text: 'Cupons'),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    AppField(
                      label: 'Codigo do cupom',
                      hint: 'PRIMEIRACORRIDA',
                      controller: _coupon,
                      error: isError ? _message : null,
                      onChanged: (_) => setState(() {}),
                    ),
                    if (_message != null && !isError)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Spacing.md),
                        child: Text(
                          _message!,
                          style: const TextStyle(color: AppColors.primary, fontSize: 13),
                        ),
                      ),
                    AppButton(
                      label: 'Aplicar cupom',
                      variant: AppButtonVariant.secondary,
                      enabled: _coupon.text.isNotEmpty,
                      onPressed: _apply,
                    ),
                    const AppDivider(),
                    for (final coupon in _coupons)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: Spacing.sm),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    coupon[0],
                                    style: const TextStyle(
                                      color: AppColors.primary,
                                      fontSize: 15,
                                      fontWeight: FontWeight.w600,
                                      letterSpacing: 1,
                                    ),
                                  ),
                                  Text(
                                    coupon[1],
                                    style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              coupon[2],
                              style: const TextStyle(color: AppColors.textFaint, fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
