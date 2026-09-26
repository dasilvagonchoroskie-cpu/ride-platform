import 'package:flutter/material.dart';

import '../core/api/api_client.dart';
import '../core/config/app_config.dart';
import '../core/legal/legal_content.dart';
import '../core/theme/app_theme.dart';

/// Termos de uso ou Politica de Privacidade (texto oficial do servidor).
class LegalScreen extends StatefulWidget {
  const LegalScreen({super.key, required this.privacidade});

  final bool privacidade;

  @override
  State<LegalScreen> createState() => _LegalScreenState();
}

class _LegalScreenState extends State<LegalScreen> {
  String? _texto;

  @override
  void initState() {
    super.initState();
    _buscar();
  }

  Future<void> _buscar() async {
    final reserva = widget.privacidade ? kPrivacyFallback : kTermsFallback;
    if (!AppConfig.hasApi) {
      setState(() => _texto = reserva);
      return;
    }
    try {
      final r = await ApiClient().request('GET', widget.privacidade ? '/legal/privacy' : '/legal/terms')
          as Map<String, dynamic>;
      if (mounted) setState(() => _texto = r['content'] as String? ?? reserva);
    } catch (_) {
      if (mounted) setState(() => _texto = reserva);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: Text(widget.privacidade ? 'Política de Privacidade' : 'Termos de uso')),
      body: _texto == null
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(Spacing.xl),
              child: SelectableText(
                _texto!.replaceAll(RegExp(r'^#+\s*', multiLine: true), ''),
                style: AppText.body.copyWith(fontSize: 16, height: 1.5),
              ),
            ),
    );
  }
}
