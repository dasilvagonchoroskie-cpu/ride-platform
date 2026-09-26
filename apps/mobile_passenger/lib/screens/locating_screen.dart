import 'package:flutter/material.dart';

/// Aparece enquanto o aparelho ainda nao informou onde a pessoa esta.
/// O mapa so abre com a posicao REAL — nunca numa cidade fixa.
class LocatingScreen extends StatelessWidget {
  const LocatingScreen({super.key, required this.tentarDeNovo, required this.ligarGps});

  final VoidCallback tentarDeNovo;
  final VoidCallback ligarGps;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const CircularProgressIndicator(),
                const SizedBox(height: 20),
                Text('Localizando você…', style: tema.textTheme.titleLarge),
                const SizedBox(height: 8),
                Text(
                  'Se demorar, confira se o GPS do celular está ligado ou vá para '
                  'perto de uma janela.',
                  textAlign: TextAlign.center,
                  style: tema.textTheme.bodyMedium,
                ),
                const SizedBox(height: 24),
                OutlinedButton(onPressed: tentarDeNovo, child: const Text('Tentar de novo')),
                TextButton(onPressed: ligarGps, child: const Text('Ligar o GPS')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
