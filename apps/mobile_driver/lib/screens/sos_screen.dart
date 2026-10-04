import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/theme/app_theme.dart';
import '../state/driver_state.dart';

/// Seguranca / SOS: um botao grande. Ao apertar, manda a posicao para a
/// Central (que toca um alarme alto) e continua mandando a cada 10 s ate a
/// Central encerrar o alerta.
class SosScreen extends StatefulWidget {
  const SosScreen({super.key});

  @override
  State<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends State<SosScreen> {
  bool _enviando = false;

  Future<void> _acionar() async {
    setState(() => _enviando = true);
    final ok = await context.read<DriverState>().acionarSos();
    if (!mounted) return;
    setState(() => _enviando = false);
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Alerta enviado para a Central.'), backgroundColor: AppColors.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = context.watch<DriverState>();
    final ativo = d.sosId != null;
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Segurança')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.xl),
          child: Column(
            children: [
              Text(
                ativo
                    ? 'Alerta enviado para a Central. Sua localização está sendo enviada a cada 10 segundos.'
                    : 'Em perigo? Aperte o botão. A Central recebe sua localização na hora e um alarme toca lá.',
                textAlign: TextAlign.center,
                style: AppText.body.copyWith(color: ativo ? AppColors.danger : AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.xxl),
              SizedBox(
                width: 230,
                height: 230,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.danger,
                    foregroundColor: Colors.white,
                    shape: const CircleBorder(),
                    elevation: 8,
                  ),
                  onPressed: _enviando ? null : _acionar,
                  child: _enviando
                      ? const CircularProgressIndicator(color: Colors.white)
                      : Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.sos, size: 72),
                            Text(ativo ? 'ENVIAR DE NOVO' : 'PÂNICO', style: AppText.title.copyWith(color: Colors.white)),
                          ],
                        ),
                ),
              ),
              const SizedBox(height: Spacing.xxl),
              if (ativo)
                OutlinedButton(
                  onPressed: d.pararSos,
                  child: const Text('Parar de enviar minha localização'),
                ),
              const SizedBox(height: Spacing.lg),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
                      onPressed: () => launchUrl(Uri.parse('tel:190')),
                      icon: const Icon(Icons.local_police),
                      label: const Text('190 Polícia'),
                    ),
                  ),
                  const SizedBox(width: Spacing.md),
                  Expanded(
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
                      onPressed: () => launchUrl(Uri.parse('tel:192')),
                      icon: const Icon(Icons.local_hospital),
                      label: const Text('192 SAMU'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
