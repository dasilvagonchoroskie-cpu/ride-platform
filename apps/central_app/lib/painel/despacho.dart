import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../core/utils/geo.dart';
import '../data/painel.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Despacho: fila de corridas esperando motorista e corridas em andamento,
/// com as acoes da Central. A lista se atualiza sozinha a cada 5 s.
class Despacho extends StatelessWidget {
  const Despacho({super.key});

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PainelState>();
    final fila = p.corridas.where((c) => c.naFila).toList()
      ..sort((a, b) => (a.agendadaPara ?? a.pedidaEm ?? DateTime(2100)).compareTo(b.agendadaPara ?? b.pedidaEm ?? DateTime(2100)));
    final andamento = p.corridas.where((c) => !c.naFila).toList();

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: Column(
          children: [
            TabBar(
              tabs: [
                Tab(text: 'Na fila (${fila.length})'),
                Tab(text: 'Em andamento (${andamento.length})'),
              ],
            ),
            Expanded(
              child: TabBarView(
                children: [
                  _Lista(corridas: fila, vazio: 'Nenhuma corrida esperando motorista.'),
                  _Lista(corridas: andamento, vazio: 'Nenhuma corrida em andamento.'),
                ],
              ),
            ),
          ],
        ),
        floatingActionButton: FloatingActionButton.extended(
          heroTag: 'nova-corrida',
          onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const NovaCorrida())),
          icon: const Icon(Icons.add_call),
          label: const Text('Criar corrida manual'),
        ),
      ),
    );
  }
}

class _Lista extends StatelessWidget {
  const _Lista({required this.corridas, required this.vazio});

  final List<CorridaAtiva> corridas;
  final String vazio;

  @override
  Widget build(BuildContext context) {
    if (corridas.isEmpty) return Aviso(texto: vazio);
    return RefreshIndicator(
      onRefresh: () => Provider.of<PainelState>(context, listen: false).atualizar(),
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(Spacing.md, Spacing.md, Spacing.md, 96),
        itemCount: corridas.length,
        separatorBuilder: (context, index) => const SizedBox(height: Spacing.sm),
        itemBuilder: (context, i) => _CartaoCorrida(c: corridas[i]),
      ),
    );
  }
}

class _CartaoCorrida extends StatelessWidget {
  const _CartaoCorrida({required this.c});

  final CorridaAtiva c;

  Color get _cor => switch (c.status) {
        'SCHEDULED' => AppColors.textMuted,
        'REQUESTED' || 'SEARCHING' => AppColors.primary,
        'IN_PROGRESS' => AppColors.success,
        _ => AppColors.warning,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(Spacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(Radii.md),
        border: Border(left: BorderSide(color: _cor, width: 4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('${c.fase}  ·  ${c.codigo}', style: AppText.bodyStrong.copyWith(color: _cor))),
              Text(reais(c.valorCents), style: AppText.bodyStrong),
            ],
          ),
          if (c.agendadaPara != null)
            Text('Agendada para ${dataHora(c.agendadaPara)}', style: AppText.caption.copyWith(color: AppColors.warning)),
          const SizedBox(height: Spacing.xs),
          Row(
            children: [
              Expanded(child: Linha('Passageiro', '${c.passageiro}\n${telefoneBonito(c.telefonePassageiro)}')),
              BotoesContato(telefone: c.telefonePassageiro),
            ],
          ),
          if (c.motoristaId != null)
            Row(
              children: [
                Expanded(child: Linha('Motorista', '${c.motorista}${c.placa.isEmpty ? '' : ' · ${c.placa}'}')),
                BotoesContato(telefone: c.telefoneMotorista),
              ],
            ),
          Linha('Embarque', c.enderecoEmbarque),
          Linha('Destino', c.enderecoDestino),
          Linha('Categoria', c.categoria),
          Linha('Pagamento', nomeDoPagamento(c.pagamento)),
          Linha('Pedida em', dataHora(c.pedidaEm)),
          const SizedBox(height: Spacing.sm),
          Wrap(
            spacing: Spacing.sm,
            runSpacing: Spacing.xs,
            children: [
              if (!c.viagemComecou)
                FilledButton.tonalIcon(
                  icon: const Icon(Icons.person_search, size: 18),
                  label: Text(c.motoristaId == null ? 'Enviar para motorista' : 'Trocar motorista'),
                  onPressed: () => escolherMotorista(context, c),
                ),
              OutlinedButton.icon(
                icon: const Icon(Icons.close, size: 18, color: AppColors.danger),
                label: const Text('Cancelar', style: TextStyle(color: AppColors.danger)),
                onPressed: () async {
                  final motivo = await pedirTexto(
                    context,
                    titulo: 'Cancelar corrida ${c.codigo}',
                    explicacao: 'O passageiro e o motorista ficam sabendo. Sem multa.',
                    confirmar: 'Cancelar corrida',
                  );
                  if (motivo == null || !context.mounted) return;
                  final p = Provider.of<PainelState>(context, listen: false);
                  final ok = await tentar(context, () => p.api.cancelarCorrida(c.id, motivo), sucesso: 'Corrida cancelada.');
                  if (ok) await p.atualizar();
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Lista os motoristas online do mais perto ao mais longe do embarque.
Future<void> escolherMotorista(BuildContext context, CorridaAtiva c) async {
  final p = Provider.of<PainelState>(context, listen: false);
  final escolhido = await showModalBottomSheet<MotoristaOnline>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    builder: (_) => _EscolherMotorista(perto: c.embarque, atual: c.motoristaId, api: p.api),
  );
  if (escolhido == null || !context.mounted) return;
  final ok = await tentar(
    context,
    () => p.api.enviarParaMotorista(c.id, escolhido.id),
    sucesso: 'Chamado enviado para ${escolhido.nome}. O alarme dele toca agora; se não aceitar em 60 s, a corrida volta para todos.',
  );
  if (ok) await p.atualizar();
}

class _EscolherMotorista extends StatefulWidget {
  const _EscolherMotorista({required this.perto, required this.atual, required this.api});

  final Coords perto;
  final String? atual;
  final PainelApi api;

  @override
  State<_EscolherMotorista> createState() => _EscolherMotoristaState();
}

class _EscolherMotoristaState extends State<_EscolherMotorista> {
  late Future<List<MotoristaOnline>> _lista;

  @override
  void initState() {
    super.initState();
    _lista = widget.api.motoristasOnline(widget.perto);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.7,
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.all(Spacing.lg),
              child: Text('Enviar para qual motorista?', style: AppText.heading),
            ),
            Expanded(
              child: FutureBuilder<List<MotoristaOnline>>(
                future: _lista,
                builder: (context, s) {
                  if (s.hasError) {
                    return Aviso(
                      texto: 'Não foi possível carregar: ${s.error}',
                      tentarDeNovo: () => setState(() => _lista = widget.api.motoristasOnline(widget.perto)),
                    );
                  }
                  if (!s.hasData) return const Center(child: CircularProgressIndicator());
                  final lista = s.data!.where((m) => m.id != widget.atual).toList();
                  if (lista.isEmpty) return const Aviso(texto: 'Nenhum motorista online agora.');
                  return ListView.builder(
                    itemCount: lista.length,
                    itemBuilder: (context, i) {
                      final m = lista[i];
                      return ListTile(
                        enabled: !m.ocupado,
                        leading: Icon(Icons.local_taxi, color: m.ocupado ? AppColors.warning : AppColors.success),
                        title: Text(m.nome, style: AppText.bodyStrong),
                        subtitle: Text(
                          '${m.ocupado ? 'Em corrida' : 'Livre'} · ${m.distanciaKm == null ? '?' : '${m.distanciaKm!.toStringAsFixed(1)} km'}'
                          ' · ${m.categoria}${m.placa.isEmpty ? '' : ' · ${m.placa}'}',
                          style: AppText.caption.copyWith(color: AppColors.textMuted),
                        ),
                        onTap: m.ocupado ? null : () => Navigator.of(context).pop(m),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Corrida manual (pedido por telefone)
// ---------------------------------------------------------------------------

class NovaCorrida extends StatefulWidget {
  const NovaCorrida({super.key});

  @override
  State<NovaCorrida> createState() => _NovaCorridaState();
}

class _NovaCorridaState extends State<NovaCorrida> {
  final _nome = TextEditingController();
  final _telefone = TextEditingController();
  Lugar? _origem;
  Lugar? _destino;
  String _categoria = 'CARRO';
  String _pagamento = 'CASH';
  DateTime? _agendada;
  MotoristaOnline? _motorista;
  List<Categoria> _categorias = const [];
  bool _enviando = false;

  @override
  void initState() {
    super.initState();
    Provider.of<PainelState>(context, listen: false).api.tarifas().then((t) {
      if (mounted) setState(() => _categorias = t.categorias.where((c) => c.ativa).toList());
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _nome.dispose();
    _telefone.dispose();
    super.dispose();
  }

  Future<void> _agendar() async {
    final agora = DateTime.now();
    final dia = await showDatePicker(
      context: context,
      initialDate: agora,
      firstDate: agora,
      lastDate: agora.add(const Duration(days: 7)),
    );
    if (dia == null || !mounted) return;
    final hora = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(agora.add(const Duration(hours: 1))));
    if (hora == null) return;
    setState(() => _agendada = DateTime(dia.year, dia.month, dia.day, hora.hour, hora.minute));
  }

  Future<void> _enviar() async {
    final erros = <String>[
      if (_nome.text.trim().length < 2) 'nome do passageiro',
      if (_telefone.text.replaceAll(RegExp(r'\D'), '').length < 10) 'telefone com DDD',
      if (_origem == null) 'endereço de embarque',
      if (_destino == null) 'destino',
    ];
    if (erros.isNotEmpty) {
      avisar(context, 'Falta: ${erros.join(', ')}.', erro: true);
      return;
    }
    setState(() => _enviando = true);
    final api = Provider.of<PainelState>(context, listen: false).api;
    final ok = await tentar(
      context,
      () => api.criarCorrida({
        'passengerName': _nome.text.trim(),
        'passengerPhone': _telefone.text.trim(),
        'pickup': {'address': _origem!.endereco, 'latitude': _origem!.coords.latitude, 'longitude': _origem!.coords.longitude},
        'dropoff': {'address': _destino!.endereco, 'latitude': _destino!.coords.latitude, 'longitude': _destino!.coords.longitude},
        'category': _categoria,
        'paymentMethodType': _pagamento,
        if (_motorista != null && _agendada == null) 'driverId': _motorista!.id,
        if (_agendada != null) 'scheduledFor': _agendada!.toUtc().toIso8601String(),
      }),
      sucesso: _agendada != null
          ? 'Corrida agendada.'
          : _motorista != null
              ? 'Corrida criada e enviada para ${_motorista!.nome}.'
              : 'Corrida criada. Procurando o motorista mais perto.',
    );
    if (!mounted) return;
    setState(() => _enviando = false);
    if (ok) {
      await Provider.of<PainelState>(context, listen: false).atualizar();
      if (mounted) Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final api = Provider.of<PainelState>(context, listen: false).api;
    final perto = Provider.of<PainelState>(context, listen: false).centro;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Corrida manual')),
      body: ListView(
        padding: const EdgeInsets.all(Spacing.lg),
        children: [
          TextField(controller: _nome, style: AppText.body, decoration: const InputDecoration(labelText: 'Nome do passageiro')),
          const SizedBox(height: Spacing.md),
          TextField(
            controller: _telefone,
            keyboardType: TextInputType.phone,
            style: AppText.body,
            decoration: const InputDecoration(labelText: 'Telefone com DDD', hintText: '(64) 99999-9999'),
          ),
          const SizedBox(height: Spacing.md),
          _CampoEndereco(rotulo: 'Embarque (origem)', perto: perto, api: api, escolhido: _origem, aoEscolher: (l) => setState(() => _origem = l)),
          const SizedBox(height: Spacing.md),
          _CampoEndereco(rotulo: 'Destino', perto: _origem?.coords ?? perto, api: api, escolhido: _destino, aoEscolher: (l) => setState(() => _destino = l)),
          const SizedBox(height: Spacing.md),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _categoria,
            decoration: const InputDecoration(labelText: 'Categoria'),
            items: [
              for (final c in (_categorias.isEmpty ? const [('CARRO', 'Carro')] : [for (final c in _categorias) (c.codigo, c.nome)]))
                DropdownMenuItem(value: c.$1, child: Text(c.$2)),
            ],
            onChanged: (v) => setState(() => _categoria = v ?? 'CARRO'),
          ),
          const SizedBox(height: Spacing.md),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _pagamento,
            decoration: const InputDecoration(labelText: 'Forma de pagamento'),
            items: const [
              DropdownMenuItem(value: 'CASH', child: Text('Dinheiro')),
              DropdownMenuItem(value: 'PIX', child: Text('PIX')),
              DropdownMenuItem(value: 'DEBIT_CARD', child: Text('Cartão de débito')),
              DropdownMenuItem(value: 'CREDIT_CARD', child: Text('Cartão de crédito')),
            ],
            onChanged: (v) => setState(() => _pagamento = v ?? 'CASH'),
          ),
          const SizedBox(height: Spacing.md),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.schedule, color: AppColors.text),
            title: Text(_agendada == null ? 'Agora' : 'Agendada para ${dataHora(_agendada)}', style: AppText.body),
            subtitle: Text('Toque para agendar (até 7 dias)', style: AppText.caption.copyWith(color: AppColors.textMuted)),
            trailing: _agendada == null
                ? null
                : IconButton(icon: const Icon(Icons.close), onPressed: () => setState(() => _agendada = null)),
            onTap: _agendar,
          ),
          if (_agendada == null)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.local_taxi, color: AppColors.text),
              title: Text(_motorista == null ? 'Motorista mais perto (automático)' : 'Enviar para ${_motorista!.nome}', style: AppText.body),
              subtitle: Text('Toque para escolher um motorista', style: AppText.caption.copyWith(color: AppColors.textMuted)),
              trailing: _motorista == null
                  ? null
                  : IconButton(icon: const Icon(Icons.close), onPressed: () => setState(() => _motorista = null)),
              onTap: () async {
                final m = await showModalBottomSheet<MotoristaOnline>(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: AppColors.surface,
                  builder: (_) => _EscolherMotorista(perto: _origem?.coords ?? perto, atual: null, api: api),
                );
                if (m != null) setState(() => _motorista = m);
              },
            ),
          const SizedBox(height: Spacing.lg),
          FilledButton(
            onPressed: _enviando ? null : _enviar,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            child: _enviando ? const CircularProgressIndicator() : const Text('Criar corrida'),
          ),
        ],
      ),
    );
  }
}

/// Campo de endereco com sugestoes do servidor (so na regiao atendida).
class _CampoEndereco extends StatefulWidget {
  const _CampoEndereco({
    required this.rotulo,
    required this.perto,
    required this.api,
    required this.escolhido,
    required this.aoEscolher,
  });

  final String rotulo;
  final Coords perto;
  final PainelApi api;
  final Lugar? escolhido;
  final ValueChanged<Lugar?> aoEscolher;

  @override
  State<_CampoEndereco> createState() => _CampoEnderecoState();
}

class _CampoEnderecoState extends State<_CampoEndereco> {
  final _campo = TextEditingController();
  Timer? _espera;
  List<Lugar> _sugestoes = const [];
  bool _buscando = false;
  String? _erro;

  @override
  void dispose() {
    _espera?.cancel();
    _campo.dispose();
    super.dispose();
  }

  void _digitou(String texto) {
    _espera?.cancel();
    if (texto.trim().length < 3) {
      setState(() => _sugestoes = const []);
      return;
    }
    _espera = Timer(const Duration(milliseconds: 600), () async {
      setState(() {
        _buscando = true;
        _erro = null;
      });
      try {
        final r = await widget.api.buscarEndereco(texto, widget.perto);
        if (mounted) setState(() => _sugestoes = r);
        if (mounted && r.isEmpty) setState(() => _erro = 'Nada encontrado na região. Tente o nome da rua e o bairro.');
      } catch (e) {
        if (mounted) setState(() => _erro = 'Falha na busca: $e');
      } finally {
        if (mounted) setState(() => _buscando = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.escolhido;
    if (e != null) {
      return ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.place, color: AppColors.success),
        title: Text(e.endereco, style: AppText.body),
        subtitle: Text('${widget.rotulo}${e.detalhe.isEmpty ? '' : ' · ${e.detalhe}'}', style: AppText.caption.copyWith(color: AppColors.textMuted)),
        trailing: IconButton(icon: const Icon(Icons.edit), onPressed: () => widget.aoEscolher(null)),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _campo,
          onChanged: _digitou,
          style: AppText.body,
          decoration: InputDecoration(
            labelText: widget.rotulo,
            hintText: 'Rua, número, bairro ou lugar',
            errorText: _erro,
            suffixIcon: _buscando ? const Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator(strokeWidth: 2)) : null,
          ),
        ),
        for (final s in _sugestoes)
          ListTile(
            dense: true,
            leading: const Icon(Icons.place_outlined, color: AppColors.textMuted),
            title: Text(s.endereco, style: AppText.body),
            subtitle: s.detalhe.isEmpty ? null : Text(s.detalhe, style: AppText.caption.copyWith(color: AppColors.textMuted)),
            onTap: () {
              widget.aoEscolher(s);
              setState(() => _sugestoes = const []);
            },
          ),
      ],
    );
  }
}
