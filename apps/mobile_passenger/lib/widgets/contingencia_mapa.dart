import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/mapa/map_provider.dart';

/// Tela de contingencia do mapa (pedido do Evandro, 29/10/2026): quando a
/// TomTom responde limite (429/403), o app mostra o endereco em texto e o
/// botao "Abrir no Google Maps".
class ContingenciaDoMapa extends StatelessWidget {
  const ContingenciaDoMapa({
    super.key,
    required this.endereco,
    this.latitude,
    this.longitude,
    this.titulo = 'O mapa está no limite agora',
    this.explicacao = 'A busca de endereços voltará sozinha. Enquanto isso, confira o endereço no Google Maps ou escolha o ponto no mapa.',
    this.outraAcao,
    this.outraAcaoTexto,
  });

  final String endereco;
  final double? latitude;
  final double? longitude;
  final String titulo;
  final String explicacao;
  final VoidCallback? outraAcao;
  final String? outraAcaoTexto;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7ED),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFFDBA74)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              const Icon(Icons.map_outlined, color: Color(0xFFB45309)),
              const SizedBox(width: 8),
              Expanded(child: Text(titulo, style: tema.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
            ],
          ),
          const SizedBox(height: 6),
          Text(explicacao, style: tema.textTheme.bodyMedium),
          if (endereco.trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            Text('Endereço', style: tema.textTheme.labelMedium),
            SelectableText(endereco.trim(), style: tema.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: () async {
                  final abriu = await abrirNoGoogleMaps(latitude: latitude, longitude: longitude, endereco: endereco);
                  if (!abriu && context.mounted) {
                    await Clipboard.setData(ClipboardData(text: endereco));
                    if (context.mounted) {
                      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
                        const SnackBar(content: Text('Não abriu o Google Maps. O endereço foi copiado.')),
                      );
                    }
                  }
                },
                icon: const Icon(Icons.open_in_new, size: 18),
                label: const Text('Abrir no Google Maps'),
              ),
              if (outraAcao != null)
                OutlinedButton(onPressed: outraAcao, child: Text(outraAcaoTexto ?? 'Escolher no mapa')),
            ],
          ),
        ],
      ),
    );
  }
}
