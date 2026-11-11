import 'package:flutter/material.dart';

import '../data/painel.dart';
import 'cidades_equipe.dart' show confirmar;
import 'comuns.dart';

/// Aparelhos da conta (so o dono ve).
///
/// - "Aparelhos": lista cada celular/navegador que entrou na conta e permite
///   desconectar UM so (Requisicao 1, 11/11/2026); os outros continuam.
/// - "Desconectar todos" (Evandro, 09/11/2026: celular vendido com os apps
///   logados): a pessoa cai na tela de login em todos os aparelhos.
class BotaoDesconectar extends StatelessWidget {
  const BotaoDesconectar({super.key, required this.api, required this.id, required this.nome});

  final PainelApi api;
  final String id;
  final String nome;

  Future<void> _desconectarTodos(BuildContext context) async {
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
  Widget build(BuildContext context) => Wrap(
        spacing: 4,
        children: [
          TextButton.icon(
            key: const ValueKey('ver-aparelhos'),
            icon: const Icon(Icons.devices_outlined),
            label: const Text('Aparelhos'),
            onPressed: () => showDialog<void>(
              context: context,
              builder: (_) => DialogoAparelhos(api: api, id: id, nome: nome),
            ),
          ),
          TextButton.icon(
            key: const ValueKey('desconectar-aparelhos'),
            icon: const Icon(Icons.phonelink_erase_outlined),
            label: const Text('Desconectar todos'),
            onPressed: () => _desconectarTodos(context),
          ),
        ],
      );
}

/// Lista dos aparelhos da conta, com "Desconectar" em cada um.
class DialogoAparelhos extends StatefulWidget {
  const DialogoAparelhos({super.key, required this.api, required this.id, required this.nome});

  final PainelApi api;
  final String id;
  final String nome;

  @override
  State<DialogoAparelhos> createState() => _DialogoAparelhosState();
}

class _DialogoAparelhosState extends State<DialogoAparelhos> {
  late Future<List<AparelhoDaConta>> _lista = widget.api.aparelhos(widget.id);

  Future<void> _desconectar(AparelhoDaConta a) async {
    final sim = await confirmar(
      context,
      'Desconectar ${a.nome}?',
      'Só este aparelho sai da conta, na hora. Os outros aparelhos de ${widget.nome} continuam conectados. '
          'Para voltar neste aparelho, a pessoa entra de novo com o código.',
      sim: 'Desconectar',
      perigo: true,
    );
    if (!sim || !mounted) return;
    final ok = await tentar(context, () => widget.api.desconectarAparelho(widget.id, a.id));
    if (ok && mounted) {
      avisar(context, 'Pronto. ${a.nome} foi desconectado.');
      setState(() => _lista = widget.api.aparelhos(widget.id));
    }
  }

  String _quando(DateTime? d) {
    if (d == null) return '—';
    String dois(int n) => n.toString().padLeft(2, '0');
    return '${dois(d.day)}/${dois(d.month)} às ${dois(d.hour)}:${dois(d.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Aparelhos de ${widget.nome}'),
      content: SizedBox(
        width: 460,
        child: FutureBuilder<List<AparelhoDaConta>>(
          future: _lista,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()));
            }
            if (snap.hasError) return Text('Não deu para carregar: ${snap.error}');
            final lista = snap.data ?? const <AparelhoDaConta>[];
            if (lista.isEmpty) return const Text('Nenhum aparelho entrou nesta conta ainda.');
            return ListView.separated(
              shrinkWrap: true,
              itemCount: lista.length,
              separatorBuilder: (context, i) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final a = lista[i];
                final aberto = a.sessoesAbertas > 0;
                final detalhes = [
                  if ((a.sistema ?? '').isNotEmpty) a.sistema!,
                  if ((a.instalacao ?? '').isNotEmpty) 'instalação ${a.instalacao}',
                  'último uso ${_quando(a.usadoEm)}',
                  aberto ? '${a.sessoesAbertas} sessão(ões) aberta(s)' : 'desconectado',
                ].join(' · ');
                return ListTile(
                  key: ValueKey('aparelho-${a.id}'),
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(a.plataforma == 'WEB' ? Icons.language : Icons.smartphone),
                  title: Text(a.nome),
                  subtitle: Text(detalhes),
                  trailing: aberto
                      ? TextButton(
                          key: ValueKey('desconectar-${a.id}'),
                          onPressed: () => _desconectar(a),
                          child: const Text('Desconectar'),
                        )
                      : null,
                );
              },
            );
          },
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Fechar'))],
    );
  }
}
