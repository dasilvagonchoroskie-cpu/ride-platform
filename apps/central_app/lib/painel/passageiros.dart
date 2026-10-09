import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../widgets/ui.dart';
import '../data/painel.dart';
import 'comuns.dart';
import 'foto.dart';
import 'painel_state.dart';

/// Confirmacao antes de excluir passageiros: explica o que some e o que fica.
Future<bool> confirmarExclusaoDePassageiros(BuildContext context, {required int quantos, String? nome}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      icon: const Icon(Icons.delete_forever, color: AppColors.danger, size: 36),
      title: Text(nome != null ? 'Excluir $nome?' : (quantos == 1 ? 'Excluir 1 passageiro?' : 'Excluir $quantos passageiros?')),
      content: const Text(
        'Quem nunca fez corrida: a conta some de vez.\n\n'
        'Quem tem corridas: apagamos nome, telefone, e-mail, CPF, foto e endereços; as corridas continuam no financeiro, sem o nome.\n\n'
        'Se a pessoa voltar, ela cria uma conta nova. Não dá para desfazer.',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
          onPressed: () => Navigator.of(ctx).pop(true),
          child: const Text('Excluir'),
        ),
      ],
    ),
  );
  return ok ?? false;
}

/// Gestao de Passageiros: busca por nome ou telefone, bloqueio com motivo e
/// exclusao (Evandro, 09/10/2026: "nao ficar guardando lista de passageiros
/// que nao usam mais a plataforma", e os de teste).
class Passageiros extends StatefulWidget {
  const Passageiros({super.key});

  @override
  State<Passageiros> createState() => _PassageirosState();
}

class _PassageirosState extends State<Passageiros> {
  final _busca = TextEditingController();
  Timer? _espera;
  bool _soBloqueados = false;
  late Future<List<Passageiro>> _lista;

  /// Modo "Selecionar para excluir" e quem esta marcado.
  bool _selecionando = false;
  final Set<String> _marcados = {};
  List<Passageiro> _ultimaLista = const [];
  bool _excluindo = false;

  PainelApi get _api => Provider.of<PainelState>(context, listen: false).api;

  @override
  void initState() {
    super.initState();
    _lista = _api.passageiros('');
  }

  @override
  void dispose() {
    _espera?.cancel();
    _busca.dispose();
    super.dispose();
  }

  void _recarregar() => setState(() { _lista = _api.passageiros(_busca.text, soBloqueados: _soBloqueados); });

  void _sairDaSelecao() => setState(() {
        _selecionando = false;
        _marcados.clear();
      });

  Future<void> _excluirMarcados() async {
    final ids = _marcados.toList();
    if (ids.isEmpty) return;
    final ok = await confirmarExclusaoDePassageiros(context, quantos: ids.length);
    if (!ok || !mounted) return;
    setState(() => _excluindo = true);
    try {
      final r = await _api.excluirPassageiros(ids);
      if (mounted) avisar(context, r.resumo, erro: r.erros.isNotEmpty);
    } catch (e) {
      if (mounted) avisar(context, mensagemDe(e), erro: true);
    }
    if (!mounted) return;
    setState(() => _excluindo = false);
    _sairDaSelecao();
    _recarregar();
  }

  Widget _barraDeSelecao() {
    final todos = _ultimaLista.isNotEmpty && _ultimaLista.every((p) => _marcados.contains(p.id));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          _marcados.isEmpty ? 'Toque nos passageiros que quer excluir.' : '${_marcados.length} selecionado(s)',
          style: AppText.bodyStrong,
        ),
        const SizedBox(height: Spacing.xs),
        Wrap(
          spacing: Spacing.sm,
          runSpacing: Spacing.sm,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            OutlinedButton(
              onPressed: () => setState(() {
                if (todos) {
                  _marcados.clear();
                } else {
                  _marcados.addAll(_ultimaLista.map((p) => p.id));
                }
              }),
              child: Text(todos ? 'Desmarcar todos' : 'Marcar todos'),
            ),
            TextButton(onPressed: _excluindo ? null : _sairDaSelecao, child: const Text('Cancelar')),
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
              onPressed: _marcados.isEmpty || _excluindo ? null : _excluirMarcados,
              icon: _excluindo
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.delete_forever),
              label: Text('Excluir (${_marcados.length})'),
            ),
          ],
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Spacing.md, Spacing.md, Spacing.md, 0),
          child: TextField(
            controller: _busca,
            style: AppText.body,
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Nome, telefone ou e-mail'),
            onChanged: (_) {
              _espera?.cancel();
              _espera = Timer(const Duration(milliseconds: 500), _recarregar);
            },
          ),
        ),
        SwitchListTile(
          value: _soBloqueados,
          title: const Text('Só bloqueados', style: AppText.body),
          onChanged: (v) {
            _soBloqueados = v;
            _recarregar();
          },
        ),
        // Excluir passageiro: so o dono (a operadora da cidade nao exclui).
        if (context.watch<PainelState>().dono)
          Padding(
            padding: const EdgeInsets.fromLTRB(Spacing.md, 0, Spacing.md, Spacing.sm),
            child: _selecionando
                ? _barraDeSelecao()
                : Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      style: TextButton.styleFrom(foregroundColor: AppColors.danger),
                      onPressed: () => setState(() => _selecionando = true),
                      icon: const Icon(Icons.delete_outline, size: 20),
                      label: const Text('Selecionar para excluir'),
                    ),
                  ),
          ),
        Expanded(
          child: FutureBuilder<List<Passageiro>>(
            future: _lista,
            builder: (context, s) {
              if (s.hasError) return Aviso(texto: 'Não foi possível carregar: ${s.error}', tentarDeNovo: _recarregar);
              if (!s.hasData) return const Center(child: CircularProgressIndicator());
              final lista = s.data!;
              _ultimaLista = lista;
              if (lista.isEmpty) return const Aviso(texto: 'Nenhum passageiro encontrado.');
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(Spacing.md, 0, Spacing.md, Spacing.xl),
                itemCount: lista.length,
                separatorBuilder: (context, index) => const SizedBox(height: Spacing.xs),
                itemBuilder: (context, i) {
                  final p = lista[i];
                  return CartaoDeLista(
                    child: ListTile(
                      leading: _selecionando
                          ? Checkbox(
                              value: _marcados.contains(p.id),
                              onChanged: (_) => setState(() => _marcados.contains(p.id) ? _marcados.remove(p.id) : _marcados.add(p.id)),
                            )
                          : p.bloqueado
                              ? Container(
                                  width: 44,
                                  height: 44,
                                  alignment: Alignment.center,
                                  decoration: const BoxDecoration(color: AppColors.dangerSoft, shape: BoxShape.circle),
                                  child: const Icon(Icons.block, color: AppColors.danger),
                                )
                              : AppAvatar(initials: iniciaisDe(p.nome), size: 44),
                      contentPadding: const EdgeInsets.fromLTRB(Spacing.md, Spacing.xs, Spacing.sm, Spacing.xs),
                      trailing: _selecionando ? null : const Icon(Icons.chevron_right, color: AppColors.textFaint),
                      title: Text(p.nome, style: AppText.bodyStrong),
                      subtitle: Text(
                        '${telefoneBonito(p.telefone)} · ${p.corridas} corrida(s)${p.bloqueado ? '\nBloqueado: ${p.motivo ?? ''}' : ''}',
                        style: AppText.caption.copyWith(color: p.bloqueado ? AppColors.danger : AppColors.textMuted),
                      ),
                      onTap: () async {
                        if (_selecionando) {
                          setState(() => _marcados.contains(p.id) ? _marcados.remove(p.id) : _marcados.add(p.id));
                          return;
                        }
                        await showModalBottomSheet<void>(
                          context: context,
                          isScrollControlled: true,
                          backgroundColor: AppColors.surface,
                          builder: (_) => _DetalhePassageiro(p: p, api: _api, dono: context.read<PainelState>().dono),
                        );
                        _recarregar();
                      },
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _DetalhePassageiro extends StatefulWidget {
  const _DetalhePassageiro({required this.p, required this.api, this.dono = true});

  final Passageiro p;
  final PainelApi api;

  /// So o dono exclui passageiro.
  final bool dono;

  @override
  State<_DetalhePassageiro> createState() => _DetalhePassageiroState();
}

class _DetalhePassageiroState extends State<_DetalhePassageiro> {
  late bool _bloqueado = widget.p.bloqueado;
  late Future<List<RegistroBloqueio>> _historico = widget.api.historicoPassageiro(widget.p.id);

  Future<void> _alternar() async {
    final bloquear = !_bloqueado;
    final motivo = await pedirTexto(
      context,
      titulo: bloquear ? 'Bloquear ${widget.p.nome}' : 'Desbloquear ${widget.p.nome}',
      explicacao: bloquear ? 'Ele sai do aplicativo e não consegue pedir corridas.' : 'Ele volta a pedir corridas normalmente.',
      confirmar: bloquear ? 'Bloquear' : 'Desbloquear',
    );
    if (motivo == null || !mounted) return;
    final ok = await tentar(
      context,
      () => widget.api.bloquearPassageiro(widget.p.id, bloquear, motivo),
      sucesso: bloquear ? 'Passageiro bloqueado.' : 'Passageiro desbloqueado.',
    );
    if (ok && mounted) {
      setState(() {
        _bloqueado = bloquear;
        _historico = widget.api.historicoPassageiro(widget.p.id);
      });
    }
  }

  Future<void> _excluir() async {
    final ok = await confirmarExclusaoDePassageiros(context, quantos: 1, nome: widget.p.nome);
    if (!ok || !mounted) return;
    try {
      final r = await widget.api.excluirPassageiros([widget.p.id]);
      if (!mounted) return;
      avisar(context, r.resumo, erro: r.erros.isNotEmpty);
      if (r.excluidos > 0) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) avisar(context, mensagemDe(e), erro: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.p;
    return SafeArea(
      child: SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.all(Spacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text(p.nome, style: AppText.title)),
                BotoesContato(telefone: p.telefone),
              ],
            ),
            Linha('Telefone', telefoneBonito(p.telefone)),
            Linha('E-mail', p.email.isEmpty ? '-' : p.email),
            Linha('Corridas', '${p.corridas}'),
            Linha('Cadastro', dataHora(p.desde)),
            Linha('Situação', _bloqueado ? 'Bloqueado' : 'Ativo', destaque: true),
            const SizedBox(height: Spacing.md),
            const Text('Histórico de bloqueios', style: AppText.heading),
            SizedBox(
              height: 160,
              child: FutureBuilder<List<RegistroBloqueio>>(
                future: _historico,
                builder: (context, s) {
                  if (s.hasError) return Text('Não carregou: ${s.error}', style: AppText.caption);
                  if (!s.hasData) return const Center(child: CircularProgressIndicator());
                  if (s.data!.isEmpty) return Text('Nunca foi bloqueado.', style: AppText.caption.copyWith(color: AppColors.textMuted));
                  return ListView(
                    children: [
                      for (final h in s.data!)
                        ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(h.acao == 'Bloqueado' ? Icons.block : Icons.lock_open,
                              color: h.acao == 'Bloqueado' ? AppColors.danger : AppColors.success),
                          title: Text('${h.acao} em ${dataHora(h.quando)} por ${h.por}', style: AppText.body),
                          subtitle: Text(h.motivo, style: AppText.caption.copyWith(color: AppColors.textMuted)),
                        ),
                    ],
                  );
                },
              ),
            ),
            const SizedBox(height: Spacing.md),
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: _bloqueado ? AppColors.success : AppColors.danger),
              icon: Icon(_bloqueado ? Icons.lock_open : Icons.block),
              label: Text(_bloqueado ? 'Desbloquear' : 'Bloquear'),
              onPressed: _alternar,
            ),
            if (widget.dono) ...[
              const SizedBox(height: Spacing.sm),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger, side: const BorderSide(color: AppColors.danger)),
                icon: const Icon(Icons.delete_forever),
                label: const Text('Excluir passageiro'),
                onPressed: _excluir,
              ),
            ],
          ],
        ),
      ),
      ),
    );
  }
}
