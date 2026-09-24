import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

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
  bool? _notificacao;
  bool _conferindo = true;

  @override
  void initState() {
    super.initState();
    _conferir();
  }

  Future<void> _conferir() async {
    final localizacao = await Geolocator.checkPermission();
    final notificacao = await Permission.notification.isGranted;

    if (!mounted) return;
    setState(() {
      _gps = localizacao == LocationPermission.whileInUse ||
          localizacao == LocationPermission.always;
      _notificacao = notificacao;
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

  Future<void> _pedirNotificacao() async {
    await Permission.notification.request();
    await _conferir();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final tudoCerto = _gps == true;

    if (_conferindo) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (tudoCerto) return widget.child;

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
                  const Text('Autorizacoes necessarias', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  Text(
                    'O taximetro precisa da localizacao para medir distancia e tempo.',
                    style: TextStyle(fontSize: 14, color: t.colorScheme.onSurface.withValues(alpha: 0.7)),
                  ),
                  const SizedBox(height: 20),
                  _Item(
                    icone: Icons.gps_fixed,
                    titulo: 'Localizacao',
                    descricao: 'Obrigatoria. Sem ela o taximetro nao mede a corrida.',
                    concedida: _gps == true,
                    onPedir: _pedirGps,
                  ),
                  const SizedBox(height: 10),
                  _Item(
                    icone: Icons.notifications_outlined,
                    titulo: 'Notificacoes',
                    descricao: 'Recomendada. Mostra valor e tempo na barra de status.',
                    concedida: _notificacao == true,
                    onPedir: _pedirNotificacao,
                  ),
                  const SizedBox(height: 20),
                  BotaoApp(
                    label: 'JA AUTORIZEI - CONTINUAR',
                    icon: Icons.check,
                    enabled: _gps == true,
                    onPressed: () => setState(() {}),
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

class _Item extends StatelessWidget {
  const _Item({
    required this.icone,
    required this.titulo,
    required this.descricao,
    required this.concedida,
    required this.onPedir,
  });

  final IconData icone;
  final String titulo;
  final String descricao;
  final bool concedida;
  final VoidCallback onPedir;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.colorScheme.surface,
        border: Border.all(color: concedida ? t.colorScheme.primary : t.dividerColor),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(icone, size: 24, color: concedida ? t.colorScheme.primary : t.colorScheme.onSurface.withValues(alpha: 0.6)),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(titulo, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(descricao, style: TextStyle(fontSize: 12, color: t.colorScheme.onSurface.withValues(alpha: 0.65))),
              ],
            ),
          ),
          if (concedida)
            Icon(Icons.check_circle, color: t.colorScheme.primary, size: 22)
          else
            TextButton(onPressed: onPedir, child: const Text('Autorizar')),
        ],
      ),
    );
  }
}
