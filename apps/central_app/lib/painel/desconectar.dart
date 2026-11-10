import 'package:flutter/material.dart';

import '../data/painel.dart';
import 'cidades_equipe.dart' show confirmar;
import 'comuns.dart';

/// Botao "Desconectar aparelhos" (Evandro, 09/11/2026: celular vendido com os
/// apps logados). So o dono ve. A pessoa cai na tela de login em todos os
/// aparelhos e entra de novo so com o codigo novo.
class BotaoDesconectar extends StatelessWidget {
  const BotaoDesconectar({super.key, required this.api, required this.id, required this.nome});

  final PainelApi api;
  final String id;
  final String nome;

  Future<void> _desconectar(BuildContext context) async {
    final sim = await confirmar(
      context,
      'Desconectar $nome de todos os aparelhos?',
      'Use quando o celular foi perdido, roubado ou vendido. A conta sai na hora de todos os aparelhos '
          'e só volta entrando de novo com o código. Nada é apagado.',
      sim: 'Desconectar',
      perigo: true,
    );
    if (!sim || !context.mounted) return;
    var fechadas = 0;
    final ok = await tentar(context, () async => fechadas = await api.desconectarAparelhos(id));
    if (ok && context.mounted) {
      avisar(context, fechadas == 0 ? 'Pronto. Não havia sessão aberta; a conta já estava desconectada.' : 'Pronto. $nome foi desconectado de todos os aparelhos.');
    }
  }

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          key: const ValueKey('desconectar-aparelhos'),
          icon: const Icon(Icons.phonelink_erase_outlined),
          label: const Text('Desconectar aparelhos'),
          onPressed: () => _desconectar(context),
        ),
      );
}
