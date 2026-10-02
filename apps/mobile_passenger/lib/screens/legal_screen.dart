import 'package:flutter/material.dart';

import '../core/api/api_client.dart';
import '../core/legal/legal_content.dart';
import '../core/theme/app_theme.dart';
import '../widgets/form_ui.dart';
import '../widgets/texto_legal.dart';

/// Termos de Uso ou Politica de Privacidade, so para ler.
class LegalScreen extends StatefulWidget {
  const LegalScreen({super.key, this.privacidade = false});

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
    String texto;
    try {
      final r = await ApiClient().request('GET', widget.privacidade ? '/legal/privacy' : '/legal/terms')
          as Map<String, dynamic>;
      texto = r['content'] as String? ?? reserva;
    } catch (_) {
      texto = reserva;
    }
    if (mounted) setState(() => _texto = texto);
  }

  @override
  Widget build(BuildContext context) {
    return TelaFormulario(
      titulo: widget.privacidade ? 'Política de Privacidade' : 'Termos de Uso',
      child: _texto == null
          ? const Center(child: CircularProgressIndicator(color: AppColors.brand))
          : TextoLegal(texto: _texto!),
    );
  }
}
