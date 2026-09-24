import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../core/formato.dart';
import '../core/pix.dart';
import '../state/taximetro_state.dart';
import '../widgets/ui.dart';

/// Modal de pagamento (modal-pagamento do original).
Future<String?> mostrarPagamento(BuildContext context, double valor) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _PagamentoSheet(valor: valor),
  );
}

class _PagamentoSheet extends StatefulWidget {
  const _PagamentoSheet({required this.valor});

  final double valor;

  @override
  State<_PagamentoSheet> createState() => _PagamentoSheetState();
}

class _PagamentoSheetState extends State<_PagamentoSheet> {
  static const List<List<String>> formas = [
    ['dinheiro', 'Dinheiro', 'Icons.payments_outlined'],
    ['pix', 'Pix', 'Icons.qr_code'],
    ['cartao', 'Cartao', 'Icons.credit_card'],
    ['outro', 'Outro', 'Icons.more_horiz'],
  ];

  String? _escolhida;
  String? _payload;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final s = context.read<TaximetroState>();

    return Container(
      decoration: BoxDecoration(
        color: t.colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      child: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  height: 4,
                  width: 36,
                  decoration: BoxDecoration(
                    color: t.dividerColor,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text('Forma de pagamento', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(
                'Total ${Formato.moedaComPrefixo(widget.valor)}',
                style: TextStyle(fontSize: 14, color: t.colorScheme.onSurface.withValues(alpha: 0.65)),
              ),
              const SizedBox(height: 16),

              for (final forma in formas)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: GestureDetector(
                    onTap: () => setState(() {
                      _escolhida = forma[0];
                      _payload = forma[0] == 'pix' ? _gerarPix(s) : null;
                    }),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: _escolhida == forma[0]
                            ? t.colorScheme.primary.withValues(alpha: 0.14)
                            : t.colorScheme.surfaceContainerHighest,
                        border: Border.all(
                          color: _escolhida == forma[0] ? t.colorScheme.primary : t.dividerColor,
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            forma[2] == 'Icons.qr_code'
                                ? Icons.qr_code
                                : forma[2] == 'Icons.credit_card'
                                    ? Icons.credit_card
                                    : forma[2] == 'Icons.payments_outlined'
                                        ? Icons.payments_outlined
                                        : Icons.more_horiz,
                            size: 22,
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Text(
                              forma[1],
                              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                            ),
                          ),
                          if (_escolhida == forma[0])
                            Icon(Icons.check, color: t.colorScheme.primary, size: 20),
                        ],
                      ),
                    ),
                  ),
                ),

              // ---- Pix: QR Code + copia e cola ----
              if (_escolhida == 'pix' && _payload != null) ...[
                const SizedBox(height: 8),
                Painel(
                  titulo: 'PIX',
                  child: Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: QrImageView(
                          data: _payload!,
                          size: 190,
                          backgroundColor: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 12),
                      SelectableText(
                        _payload!,
                        maxLines: 4,
                        style: TextStyle(
                          fontSize: 10,
                          color: t.colorScheme.onSurface.withValues(alpha: 0.7),
                        ),
                      ),
                      const SizedBox(height: 10),
                      BotaoApp(
                        label: 'Copiar codigo Pix',
                        icon: Icons.copy,
                        cor: t.colorScheme.surfaceContainerHighest,
                        corTexto: t.colorScheme.onSurface,
                        onPressed: () async {
                          await Clipboard.setData(ClipboardData(text: _payload!));
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Codigo Pix copiado.')),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 12),
              BotaoApp(
                label: 'Confirmar ${_escolhida == null ? '' : formas.firstWhere((f) => f[0] == _escolhida)[1]}',
                enabled: _escolhida != null,
                onPressed: () => Navigator.of(context).pop(_escolhida),
              ),
              const SizedBox(height: 8),
              BotaoApp(
                label: 'Voltar',
                cor: Colors.transparent,
                corTexto: t.colorScheme.onSurface.withValues(alpha: 0.6),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _gerarPix(TaximetroState s) {
    final chave = s.config.chavePix.trim().isEmpty ? 'pagamento@taximetro' : s.config.chavePix;
    return Pix.gerarPayload(
      chave: chave,
      nomeRecebedor: s.config.nomeRecebedorPix.isEmpty
          ? (s.config.motoristaNome.isEmpty ? 'MOTORISTA' : s.config.motoristaNome)
          : s.config.nomeRecebedorPix,
      cidade: s.config.cidadePix.isEmpty ? 'FORTALEZA' : s.config.cidadePix,
      valor: widget.valor,
    );
  }
}
