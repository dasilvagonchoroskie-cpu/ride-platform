import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/atualizacao.dart';
import '../core/alarme.dart';
import '../core/config.dart';
import '../core/formato.dart';
import '../core/tema.dart';
import '../dados/modelos.dart';
import '../estado/escopo.dart';
import '../widgets/comuns.dart';
import '../widgets/mapa_entrega.dart';
import 'nova_entrega_tela.dart';

/// Acompanhamento de uma entrega. O estado vem sempre do servidor (nunca e
/// inventado) e a tela se atualiza sozinha enquanto a entrega esta aberta.
class EntregaTela extends StatefulWidget {
  const EntregaTela({super.key, this.inicial, this.id}) : assert(inicial != null || id != null);

  final Entrega? inicial;
  final String? id;

  @override
  State<EntregaTela> createState() => _EntregaTelaState();
}

class _EntregaTelaState extends State<EntregaTela> {
  Entrega? _e;
  String? _falha;
  bool _carregando = false;
  bool _cancelando = false;
  AtualizacaoPeriodica? _atualizacao;

  /// Imagens do mapa (pedidas uma vez ao servidor quando o mapa aparece).
  Future<ConfigDoMapa?>? _ruas;

  String get _id => widget.inicial?.id ?? widget.id!;

  @override
  void initState() {
    super.initState();
    _e = widget.inicial;
    Future.microtask(() {
      if (mounted) _carregar();
    });
    // So consulta com o app aberto e enquanto a entrega nao terminou.
    _atualizacao = AtualizacaoPeriodica(
      intervalo: AppConfig.atualizacao,
      ativa: () => !(_e?.final_ ?? false),
      aoAtualizar: () => _carregar(silencioso: true),
    );
  }

  @override
  void dispose() {
    _atualizacao?.dispose();
    super.dispose();
  }

  Future<void> _carregar({bool silencioso = false}) async {
    if (_carregando) return;
    final s = EscopoSessao.ler(context);
    _carregando = true;
    if (!silencioso && mounted) setState(() => _falha = null);
    try {
      final e = await s.servidor.entrega(_id);
      if (!mounted) return;
      // O motorista acabou de chegar a loja: alarme (uma vez por entrega).
      if (_e != null && _e!.etapa != 'NO_ESTABELECIMENTO' && e.etapa == 'NO_ESTABELECIMENTO') Alarme.motoristaChegou(e.id);
      setState(() {
        _e = e;
        _falha = null;
      });
    } catch (err) {
      // Sem conexao: continua mostrando a ultima informacao, avisando que pode estar velha.
      if (mounted) setState(() => _falha = err is ApiException && err.semRede ? 'Sem conexão. Mostrando a última atualização.' : mensagemDe(err));
    } finally {
      _carregando = false;
    }
  }

  Future<void> _cancelar() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Cancelar esta entrega?'),
        content: const Text('Valem as regras de cancelamento da plataforma. Se o motorista já estiver a caminho, pode haver cobrança.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Manter')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Cancelar entrega')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final s = EscopoSessao.ler(context);
    setState(() => _cancelando = true);
    try {
      final e = await s.servidor.cancelar(_id);
      if (mounted) setState(() => _e = e);
    } catch (err) {
      if (mounted) avisar(context, mensagemDe(err));
    } finally {
      if (mounted) setState(() => _cancelando = false);
    }
  }

  Future<void> _repetir() async {
    final s = EscopoSessao.ler(context);
    try {
      final r = await s.servidor.repetir(_id);
      if (!mounted) return;
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => NovaEntregaTela(repeticao: r)));
    } catch (err) {
      if (mounted) avisar(context, mensagemDe(err));
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = _e;
    return Scaffold(
      appBar: AppBar(title: Text(e == null ? 'Entrega' : 'Entrega ${e.codigo}')),
      body: e == null
          ? (_falha != null ? Estado(icone: Icons.cloud_off, titulo: 'Não foi possível carregar', texto: _falha, botao: 'Tentar de novo', aoTocar: _carregar) : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(onRefresh: _carregar, child: _corpo(e)),
    );
  }

  Widget _corpo(Entrega e) {
    final cor = e.problema ? Cores.perigo : (e.etapa == 'ENTREGUE' ? Cores.ok : Cores.loja);
    return ListView(padding: EdgeInsets.fromLTRB(20, 20, 20, 24 + MediaQuery.viewPaddingOf(context).bottom), children: [
      if (_falha != null) ...[Faixa(_falha!, tipo: TipoFaixa.atencao, icone: Icons.cloud_off), const SizedBox(height: 14)],
      Row(children: [
        Expanded(child: Text(e.situacao, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: cor))),
        Selo(e.veiculo == 'MOTO' ? 'Moto' : 'Carro'),
      ]),
      const SizedBox(height: 16),
      _linhaDoTempo(e),
      if (e.variasEntregas) ...[
        const SizedBox(height: 18),
        _listaDeEntregas(e),
      ],
      if (!e.variasEntregas && !e.final_ && (e.codigoDeEntrega ?? '').isNotEmpty) ...[
        const SizedBox(height: 18),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              const Text('Código de entrega', style: TextStyle(color: Cores.textoSuave)),
              const SizedBox(height: 6),
              Text(e.codigoDeEntrega!, style: const TextStyle(fontSize: 38, fontWeight: FontWeight.w800, letterSpacing: 10, color: Cores.ouro)),
              const SizedBox(height: 6),
              const Text('Quem recebe diz este código ao motorista para concluir a entrega.', textAlign: TextAlign.center, style: TextStyle(color: Cores.textoSuave, fontSize: 12)),
            ]),
          ),
        ),
      ],
      if (!e.final_ && e.mapa != null && !e.mapa!.vazio) ...[
        const SizedBox(height: 18),
        _mapa(e),
      ],
      if (!e.final_ && (e.motoristaNome != null || e.temPosicaoDoMotorista)) ...[
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('MOTORISTA', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Cores.textoSuave)),
              const SizedBox(height: 6),
              Linha('Nome', e.motoristaNome ?? ''),
              Linha('Veículo', e.veiculoDoMotorista ?? ''),
            ]),
          ),
        ),
      ],
      const SizedBox(height: 14),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Linha('Encomenda', e.encomenda),
            Linha('Observações', e.observacoes ?? ''),
            const Divider(height: 22),
            Linha('Coleta', e.enderecoDeColeta),
            if (!e.variasEntregas) ...[
              Linha('Entrega', e.enderecoDeEntrega),
              Linha('Recebe', [e.destinatarioNome ?? '', (e.destinatarioTelefone ?? '').isEmpty ? '' : Formato.telefone(e.destinatarioTelefone!)].where((t) => t.isNotEmpty).join(' · ')),
            ],
            const Divider(height: 22),
            Linha('Pedida em', Formato.dataHora(e.criadaEm)),
            Linha('Entregue em', Formato.dataHora(e.entregueEm)),
            Linha(e.etapa == 'ENTREGUE' ? 'Valor cobrado' : 'Valor', Formato.dinheiro(e.valorCents)),
          ]),
        ),
      ),
      const SizedBox(height: 18),
      if (!e.final_) OutlinedButton(onPressed: _cancelando ? null : _cancelar, child: Text(_cancelando ? 'Cancelando…' : 'Cancelar entrega')),
      if (e.final_) FilledButton(onPressed: _repetir, child: const Text('Repetir esta entrega')),
    ]);
  }

  /// Varias entregas: quantas ja foram concluidas e, em cada uma, o ✔ verde ou o codigo de quem recebe.
  Widget _listaDeEntregas(Entrega e) {
    final total = e.entregas.length;
    final feitas = e.entregasFeitas;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Entregas: $feitas de $total concluídas', key: const ValueKey('progresso-entregas'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          LinearProgressIndicator(value: total == 0 ? 0 : feitas / total, minHeight: 6, backgroundColor: Cores.borda, color: Cores.ok),
          const SizedBox(height: 10),
          for (final it in e.entregas) ...[
            const Divider(height: 22),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              it.entregue
                  ? Icon(Icons.check_circle, key: ValueKey('feita-${it.ordem}'), color: Cores.ok, size: 26)
                  : CircleAvatar(radius: 13, backgroundColor: Cores.cartaoAlto, child: Text('${it.ordem}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800))),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(it.encomenda, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text([it.nome, if ((it.telefone ?? '').isNotEmpty) Formato.telefone(it.telefone!)].join(' · '), style: const TextStyle(color: Cores.textoSuave)),
                  if ((it.endereco ?? '').isNotEmpty) Text(it.endereco!, style: const TextStyle(color: Cores.textoSuave, fontSize: 12)),
                  if (it.entregue) Text('Entregue ${Formato.dataHora(it.entregueEm)}', style: const TextStyle(color: Cores.ok, fontSize: 12, fontWeight: FontWeight.w700)),
                ]),
              ),
              if (!it.entregue && (it.codigo ?? '').isNotEmpty)
                Column(children: [
                  const Text('Código', style: TextStyle(fontSize: 11, color: Cores.textoSuave)),
                  Text(it.codigo!, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: 4, color: Cores.ouro)),
                ]),
            ]),
          ],
          const SizedBox(height: 8),
          const Text('Cada pessoa diz o próprio código ao motorista na hora de receber.', style: TextStyle(color: Cores.textoSuave, fontSize: 12)),
        ]),
      ),
    );
  }

  Widget _mapa(Entrega e) {
    _ruas ??= EscopoSessao.ler(context).configDoMapa();
    return FutureBuilder<ConfigDoMapa?>(
      future: _ruas,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const SizedBox(height: 260, child: Center(child: CircularProgressIndicator()));
        }
        return MapaEntrega(mapa: e.mapa!, ruas: snap.data, veiculo: e.veiculo, comMotorista: e.motoristaNome != null);
      },
    );
  }

  Widget _linhaDoTempo(Entrega e) {
    final atual = Etapa.ordem.indexOf(e.etapa);
    final itens = <Widget>[];
    if (e.problema) {
      // Mostra o caminho ate onde chegou e o desfecho em vermelho.
      itens.add(_passo(Etapa.rotulos['CRIADA']!, _Estado.feito, ultimo: false));
      itens.add(_passo(e.situacao, _Estado.problema, ultimo: true));
    } else {
      for (var i = 0; i < Etapa.ordem.length; i++) {
        final rotulo = Etapa.rotulos[Etapa.ordem[i]]!;
        final est = i < atual ? _Estado.feito : (i == atual ? (e.etapa == 'ENTREGUE' ? _Estado.feito : _Estado.agora) : _Estado.futuro);
        itens.add(_passo(rotulo, est, ultimo: i == Etapa.ordem.length - 1));
      }
    }
    return Column(children: itens);
  }

  Widget _passo(String texto, _Estado est, {required bool ultimo}) {
    final (cor, icone) = switch (est) {
      _Estado.feito => (Cores.ok, Icons.check_circle),
      _Estado.agora => (Cores.loja, Icons.radio_button_checked),
      _Estado.problema => (Cores.perigo, Icons.cancel),
      _Estado.futuro => (Cores.textoFraco, Icons.radio_button_unchecked),
    };
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SizedBox(
          width: 28,
          child: Column(children: [
            Icon(icone, color: cor, size: 20),
            if (!ultimo) Expanded(child: Container(width: 2, color: est == _Estado.feito ? Cores.ok.withValues(alpha: .5) : Cores.borda)),
          ]),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Text(
              texto,
              style: TextStyle(
                fontWeight: est == _Estado.agora || est == _Estado.problema ? FontWeight.w700 : FontWeight.w500,
                color: est == _Estado.futuro ? Cores.textoFraco : Cores.texto,
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

enum _Estado { feito, agora, problema, futuro }
