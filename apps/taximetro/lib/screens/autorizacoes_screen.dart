import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../widgets/ui.dart';

/// Verificacao de permissoes na abertura (tela-autorizacoes do original).
class AutorizacoesScreen extends StatefulWidget {
  const AutorizacoesScreen({super.key, required this.child});

  final Widget child;

  @override
  State<AutorizacoesScreen> createState() => _AutorizacoesScreenState();
}

class _AutorizacoesScreenState extends State<AutorizacoesScreen> {
  bool? _gps;
  bool _conferindo = true;

  @override
  void initState() {
    super.initState();
    _conferir();
  }

  Future<void> _conferir() async {
    final localizacao = await Geolocator.checkPermission();
    if (!mounted) return;

    setState(() {
      _gps = localizacao == LocationPermission.whileInUse ||
          localizacao == LocationPermission.always;
      _conferindo = false;
    });
  }

  Future<void> _pedirGps() async {
    final servico = await Geolocator.isLocationServiceEnabled();
    if (!servico) {
      await Geolocator.openLocationSettings();
    } else {
      await Geolocator.requestPermission();
    }
    await _conferir();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);

    if (_conferindo) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_gps == true) return widget.child;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Icon(Icons.location_on_outlined, size: 52, color: t.colorScheme.primary),
                  const SizedBox(height: 16),
                  const Text('Autorizacao necessaria',
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  Text(
                    'O taximetro precisa da localizacao para medir distancia e tempo da corrida.',
                    style: TextStyle(fontSize: 14, color: t.colorScheme.onSurface.withValues(alpha: 0.7)),
                  ),
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: t.colorScheme.surface,
                      border: Border.all(color: t.dividerColor),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.gps_fixed, size: 24, color: t.colorScheme.onSurface.withValues(alpha: 0.6)),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Localizacao',
                                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                              const SizedBox(height: 2),
                              Text(
                                'Obrigatoria. Sem ela o taximetro nao mede a corrida.',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: t.colorScheme.onSurface.withValues(alpha: 0.65),
                                ),
                              ),
                            ],
                          ),
                        ),
                        TextButton(onPressed: _pedirGps, child: const Text('Autorizar')),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  BotaoApp(
                    label: 'JA AUTORIZEI - CONTINUAR',
                    icon: Icons.check,
                    onPressed: _conferir,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
