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
  const BotaoDesconectar({super.key, required this.api, required this.id, required this.nome, this.motorista = false});

  final PainelApi api;
  final String id;
  final String nome;

  /// Motorista: a recuperacao tambem confere a CNH (R3).
  final bool motorista;

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
          TextButton.icon(
            key: const ValueKey('recuperar-acesso'),
            icon: const Icon(Icons.badge_outlined),
            label: const Text('Recuperar acesso'),
            onPressed: () => showDialog<void>(
              context: context,
              builder: (_) => DialogoRecuperarAcesso(api: api, id: id, nome: nome, motorista: motorista),
            ),
          ),
        ],
      );
}

/// R3 (Requisicao de continuidade, 11/11/2026): a pessoa perdeu o telefone
/// antigo E o e-mail. So o dono libera, depois de conferir um documento com
/// foto (chamada de video ou pessoalmente). O documento NAO e enviado nem
/// guardado: so o tipo e o que foi conferido vao para a auditoria.
class DialogoRecuperarAcesso extends StatefulWidget {
  const DialogoRecuperarAcesso({super.key, required this.api, required this.id, required this.nome, required this.motorista});

  final PainelApi api;
  final String id;
  final String nome;
  final bool motorista;

  @override
  State<DialogoRecuperarAcesso> createState() => _DialogoRecuperarAcessoState();
}

class _DialogoRecuperarAcessoState extends State<DialogoRecuperarAcesso> {
  final TextEditingController _motivo = TextEditingController();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _telefone = TextEditingController();
  String _documento = 'CNH';
  bool _foto = false;
  bool _nome = false;
  bool _cpf = false;
  bool _cnh = false;
  bool _enviando = false;
  String? _erro;

  @override
  void dispose() {
    _motivo.dispose();
    _email.dispose();
    _telefone.dispose();
    super.dispose();
  }

  String? _telefoneE164() {
    final d = _telefone.text.replaceAll(RegExp(r'\D'), '');
    if (d.isEmpty) return null;
    if (d.length == 10 || d.length == 11) return '+55$d';
    if (d.startsWith('55') && (d.length == 12 || d.length == 13)) return '+$d';
    return 'invalido';
  }

  Future<void> _enviar() async {
    final email = _email.text.trim().toLowerCase();
    final tel = _telefoneE164();
    final problema = _motivo.text.trim().length < 10
        ? 'Escreva o motivo (pelo menos 10 letras).'
        : !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)
            ? 'Digite o e-mail novo da pessoa: é por ele que ela volta a entrar.'
            : tel == 'invalido'
                ? 'Telefone novo com DDD (ou deixe em branco).'
                : null;
    if (problema != null) {
      setState(() => _erro = problema);
      return;
    }
    final sim = await confirmar(
      context,
      'Liberar o acesso de ${widget.nome}?',
      'Todos os aparelhos saem da conta na hora, a senha antiga deixa de valer e a pessoa entra '
          'com o código que chega no e-mail novo. Fica registrado na auditoria com o seu nome e o motivo.',
      sim: 'Liberar',
      perigo: true,
    );
    if (!sim || !mounted) return;
    setState(() {
      _enviando = true;
      _erro = null;
    });
    var liberada = false;
    var faltaram = <String>[];
    final ok = await tentar(context, () async {
      final r = await widget.api.recuperarAcesso(
        widget.id,
        motivo: _motivo.text.trim(),
        documento: _documento,
        foto: _foto,
        nome: _nome,
        cpf: _cpf,
        cnh: widget.motorista ? _cnh : null,
        novoEmail: email,
        novoTelefone: tel,
      );
      liberada = r.$1;
      faltaram = r.$2;
    });
    if (!mounted) return;
    setState(() => _enviando = false);
    if (!ok) return;
    if (liberada) {
      final mensageiro = ScaffoldMessenger.maybeOf(context);
      Navigator.of(context).pop();
      mensageiro?.showSnackBar(SnackBar(content: Text('Acesso liberado. ${widget.nome} entra com o código do e-mail novo.')));
    } else {
      setState(() => _erro = 'Não liberado (registrado na auditoria). Faltou conferir: ${faltaram.join(', ')}.');
    }
  }

  Widget _marca(String texto, bool valor, ValueChanged<bool> mudar) => CheckboxListTile(
        dense: true,
        contentPadding: EdgeInsets.zero,
        controlAffinity: ListTileControlAffinity.leading,
        value: valor,
        title: Text(texto),
        onChanged: (v) => setState(() => mudar(v == true)),
      );

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Recuperar o acesso de ${widget.nome}'),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Use só quando a pessoa perdeu o telefone antigo E o e-mail. Confira um documento com foto '
                'por chamada de vídeo ou pessoalmente. Não peça para mandar foto do documento: nada dele é guardado.',
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                key: const ValueKey('recuperar-documento'),
                value: _documento,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Documento conferido'),
                items: const [
                  DropdownMenuItem(value: 'CNH', child: Text('CNH')),
                  DropdownMenuItem(value: 'RG', child: Text('RG')),
                  DropdownMenuItem(value: 'OUTRO_COM_FOTO', child: Text('Outro com foto')),
                ],
                onChanged: (v) => setState(() => _documento = v ?? 'CNH'),
              ),
              _marca('O rosto é o mesmo da foto do documento', _foto, (v) => _foto = v),
              _marca('O nome é o mesmo do cadastro', _nome, (v) => _nome = v),
              _marca('O CPF é o mesmo do cadastro', _cpf, (v) => _cpf = v),
              if (widget.motorista) _marca('O número da CNH é o mesmo do cadastro', _cnh, (v) => _cnh = v),
              TextField(
                key: const ValueKey('recuperar-motivo'),
                controller: _motivo,
                maxLength: 300,
                decoration: const InputDecoration(labelText: 'Motivo (ex.: perdeu o celular e a senha do e-mail)'),
              ),
              TextField(
                key: const ValueKey('recuperar-email'),
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'E-mail novo da pessoa'),
              ),
              TextField(
                key: const ValueKey('recuperar-telefone'),
                controller: _telefone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Telefone novo com DDD (opcional)'),
              ),
              if (_erro != null) ...[
                const SizedBox(height: 8),
                Text(_erro!, style: const TextStyle(color: Colors.red)),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Voltar')),
        FilledButton(
          key: const ValueKey('recuperar-liberar'),
          onPressed: _enviando ? null : _enviar,
          child: Text(_enviando ? 'Enviando...' : 'Liberar acesso'),
        ),
      ],
    );
  }
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
