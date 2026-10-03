import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Gestao de Passageiros: busca por nome ou telefone, bloqueio com motivo.
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

  void _recarregar() => setState(() => _lista = _api.passageiros(_busca.text, soBloqueados: _soBloqueados));

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
        Expanded(
          child: FutureBuilder<List<Passageiro>>(
            future: _lista,
            builder: (context, s) {
              if (s.hasError) return Aviso(texto: 'Não foi possível carregar: ${s.error}', tentarDeNovo: _recarregar);
              if (!s.hasData) return const Center(child: CircularProgressIndicator());
              final lista = s.data!;
              if (lista.isEmpty) return const Aviso(texto: 'Nenhum passageiro encontrado.');
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(Spacing.md, 0, Spacing.md, Spacing.xl),
                itemCount: lista.length,
                separatorBuilder: (context, index) => const SizedBox(height: Spacing.xs),
                itemBuilder: (context, i) {
                  final p = lista[i];
                  return Material(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(Radii.md),
                    child: ListTile(
                      leading: Icon(p.bloqueado ? Icons.block : Icons.person, color: p.bloqueado ? AppColors.danger : AppColors.textMuted),
                      title: Text(p.nome, style: AppText.bodyStrong),
                      subtitle: Text(
                        '${telefoneBonito(p.telefone)} · ${p.corridas} corrida(s)${p.bloqueado ? '\nBloqueado: ${p.motivo ?? ''}' : ''}',
                        style: AppText.caption.copyWith(color: p.bloqueado ? AppColors.danger : AppColors.textMuted),
                      ),
                      onTap: () async {
                        await showModalBottomSheet<void>(
                          context: context,
                          isScrollControlled: true,
                          backgroundColor: AppColors.surface,
                          builder: (_) => _DetalhePassageiro(p: p, api: _api),
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
  const _DetalhePassageiro({required this.p, required this.api});

  final Passageiro p;
  final PainelApi api;

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
          ],
        ),
      ),
      ),
    );
  }
}
