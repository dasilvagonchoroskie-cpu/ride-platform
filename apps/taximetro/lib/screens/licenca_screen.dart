import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/licenca.dart';
import '../state/taximetro_state.dart';
import '../widgets/ui.dart';

/// Ativacao por licenca (tela-licenca do original).
class LicencaScreen extends StatefulWidget {
  const LicencaScreen({super.key});

  @override
  State<LicencaScreen> createState() => _LicencaScreenState();
}

class _LicencaScreenState extends State<LicencaScreen> {
  final _chave = TextEditingController();
  bool _ativando = false;

  @override
  void dispose() {
    _chave.dispose();
    super.dispose();
  }

  Future<void> _ativar() async {
    setState(() => _ativando = true);
    await context.read<TaximetroState>().ativarLicenca(_chave.text);
    if (mounted) setState(() => _ativando = false);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<TaximetroState>();
    final t = Theme.of(context);

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
                  Container(
                    height: 64,
                    width: 64,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: t.colorScheme.primary.withValues(alpha: 0.16),
                      border: Border.all(color: t.colorScheme.primary),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(Icons.local_taxi, size: 32, color: t.colorScheme.primary),
                  ),
                  const SizedBox(height: 18),
                  const Text('Taximetro', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.8)),
                  const SizedBox(height: 4),
                  Text(
                    'Ative este aparelho para comecar a usar',
                    style: TextStyle(fontSize: 14, color: t.colorScheme.onSurface.withValues(alpha: 0.7)),
                  ),
                  const SizedBox(height: 24),
                  Painel(
                    titulo: 'CODIGO DESTE APARELHO',
                    child: Column(
                      children: [
                        SelectableText(
                          s.codigoAparelho ?? '—',
                          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: 2, color: t.colorScheme.primary),
                        ),
                        const SizedBox(height: 10),
                        BotaoApp(
                          label: 'Copiar codigo',
                          icon: Icons.copy,
                          cor: t.colorScheme.surfaceContainerHighest,
                          corTexto: t.colorScheme.onSurface,
                          onPressed: () async {
                            await Clipboard.setData(ClipboardData(text: s.codigoAparelho ?? ''));
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Codigo copiado.')),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  Painel(
                    titulo: 'CHAVE DE ATIVACAO',
                    child: Column(
                      children: [
                        CampoApp(
                          label: 'Chave',
                          hint: 'XXXX-XXXX-XXXX-XXXX',
                          controller: _chave,
                          maxLength: 19,
                          onChanged: (v) {
                            final m = Licenca.formatarChaveDigitada(v);
                            if (m != v) {
                              _chave.value = TextEditingValue(text: m, selection: TextSelection.collapsed(offset: m.length));
                            }
                            setState(() {});
                          },
                          error: s.erroLicenca,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  BotaoApp(
                    label: 'ATIVAR APARELHO',
                    icon: Icons.lock_open,
                    loading: _ativando,
                    enabled: _chave.text.replaceAll('-', '').length == 16,
                    onPressed: _ativar,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'A chave e valida apenas para o codigo de aparelho acima.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: t.colorScheme.onSurface.withValues(alpha: 0.5)),
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
