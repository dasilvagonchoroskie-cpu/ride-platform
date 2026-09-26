import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/central.dart';
import '../core/theme/app_theme.dart';
import '../state/driver_state.dart';

/// Meus veiculos: o que esta cadastrado no servidor.
class VehiclesScreen extends StatefulWidget {
  const VehiclesScreen({super.key});

  @override
  State<VehiclesScreen> createState() => _VehiclesScreenState();
}

class _VehiclesScreenState extends State<VehiclesScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<DriverState>().sincronizarCadastro();
    });
  }

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final lista = driver.veiculos.isNotEmpty
        ? driver.veiculos
        : [
            if (driver.vehicle != null)
              {
                'brand': driver.vehicle!.brand,
                'model': driver.vehicle!.model,
                'year': driver.vehicle!.year,
                'color': driver.vehicle!.color,
                'plate': driver.vehicle!.plate,
                'isActive': true,
              },
          ];

    return Scaffold(
      appBar: AppBar(title: const Text('Meus veículos')),
      body: ListView(
        padding: const EdgeInsets.all(Spacing.lg),
        children: [
          if (lista.isEmpty)
            Padding(
              padding: const EdgeInsets.all(Spacing.xl),
              child: Text(
                'Nenhum veículo cadastrado.',
                textAlign: TextAlign.center,
                style: AppText.body.copyWith(color: AppColors.textMuted),
              ),
            ),
          for (final v in lista) ...[
            _Veiculo(dados: v),
            const SizedBox(height: Spacing.md),
          ],
          const SizedBox(height: Spacing.sm),
          Text(
            'Para trocar ou incluir um veículo, leve o documento (CRLV) à Central.',
            style: AppText.body.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: Spacing.md),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: AppColors.surface),
            onPressed: () async {
              final contato = await driver.contatoCentral();
              await abrirWhatsApp(
                contato?.whatsapp,
                'Olá! Sou o motorista ${driver.profile?.name ?? ''} e quero trocar/incluir um veículo.',
              );
            },
            icon: const Icon(Icons.chat),
            label: const Text('Falar com a Central'),
          ),
        ],
      ),
    );
  }
}

class _Veiculo extends StatelessWidget {
  const _Veiculo({required this.dados});

  final Map<String, dynamic> dados;

  @override
  Widget build(BuildContext context) {
    final ativo = dados['isActive'] != false;
    final placa = '${dados['plate'] ?? ''}'.toUpperCase();
    final placaFmt = placa.length == 7 ? '${placa.substring(0, 3)}-${placa.substring(3)}' : placa;

    return Container(
      padding: const EdgeInsets.all(Spacing.lg),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(Radii.sm)),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: const BoxDecoration(color: AppColors.brandSoft, shape: BoxShape.circle),
            child: const Icon(Icons.directions_car, color: AppColors.brand, size: 30),
          ),
          const SizedBox(width: Spacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${dados['brand'] ?? ''} ${dados['model'] ?? ''}'.trim(),
                  style: AppText.heading.copyWith(fontSize: 18),
                ),
                Text(
                  '${dados['year'] ?? ''}  •  ${dados['color'] ?? ''}',
                  style: AppText.body.copyWith(color: AppColors.textMuted),
                ),
                const SizedBox(height: Spacing.xs),
                Text(
                  ativo ? 'Em uso' : 'Inativo',
                  style: AppText.caption.copyWith(
                    color: ativo ? AppColors.primary : AppColors.textMuted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.sm),
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.text, width: 1.4),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(placaFmt, style: AppText.bodyStrong.copyWith(letterSpacing: 1.2, fontSize: 16)),
          ),
        ],
      ),
    );
  }
}
