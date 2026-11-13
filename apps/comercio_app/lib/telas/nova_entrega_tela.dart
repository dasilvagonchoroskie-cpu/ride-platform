import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/formato.dart';
import '../core/tema.dart';
import '../dados/comercio_api.dart';
import '../dados/modelos.dart';
import '../estado/escopo.dart';
import '../estado/sessao.dart';
import '../widgets/busca_lugar.dart';
import '../widgets/comuns.dart';
import '../widgets/endereco_campos.dart';
import 'entrega_tela.dart';

/// Pedir entregas, em 4 passos: coleta, entregas (de 1 a 5, cada uma com o que
/// vai, quem recebe e o endereco), veiculo e preco (do servidor), resumo e confirmacao.
/// Varias entregas = UM veiculo, UMA rota: o motorista coleta tudo e passa pelas
/// entregas na ordem em que foram cadastradas, cada uma com o codigo de quem recebe.
///
/// Nada e pedido ate o ultimo toque. O preco e o oficial da plataforma; se
/// a entrega nao estiver liberada na cidade, o servidor avisa e o app para.
class NovaEntregaTela extends StatefulWidget {
  const NovaEntregaTela({super.key, this.repeticao});

  /// Entrega anterior para preencher os campos. NUNCA pede sozinha.
  final Repeticao? repeticao;

  @override
  State<NovaEntregaTela> createState() => _NovaEntregaTelaState();
}

/// Uma entrega do pedido: o que vai, quem recebe (telefone opcional) e onde.
class _Entrega {
  final descricao = TextEditingController();
  final nome = TextEditingController();
  final telefone = TextEditingController();
  final referencia = TextEditingController();
  final destino = EnderecoControle();

  void dispose() {
    for (final c in [descricao, nome, telefone, referencia]) {
      c.dispose();
    }
    destino.dispose();
  }
}

const _maxEntregas = 5;

class _NovaEntregaTelaState extends State<NovaEntregaTela> {
  static const _titulos = ['Coleta', 'Entregas', 'Veículo e preço', 'Resumo'];
  static const _ultimo = 3;

  final _chaves = List<GlobalKey<FormState>>.generate(4, (_) => GlobalKey<FormState>());
  final _observacoes = TextEditingController();
  final List<_Entrega> _entregas = [];

  int _passo = 0;
  bool _coletaOutra = false;
  Lugar? _coletaLugar;
  String? _veiculo;
  Cotacao? _cotacao;
  bool _consultando = false;
  bool _enviando = false;
  String? _erro;

  /// Chave do pedido: nasce no resumo e so e trocada se a pessoa mudar algo.
  String? _chave;

  /// O servidor nao respondeu ao pedir: pode ou nao ter sido gravado.
  bool _incerto = false;

  @override
  void initState() {
    super.initState();
    final r = widget.repeticao;
    _novaEntrega();
    if (r != null) {
      final e = _entregas.first;
      e.descricao.text = r.descricao;
      _observacoes.text = r.observacoes ?? '';
      e.nome.text = r.destinatarioNome;
      e.telefone.text = r.destinatarioTelefone;
      e.referencia.text = r.referencia;
      // Repetir NAO leva a posicao antiga: a pessoa confere e confirma de novo no mapa.
      e.destino.preencher(Endereco(
        logradouro: r.destino.logradouro,
        numero: r.destino.numero,
        complemento: r.destino.complemento,
        bairro: r.destino.bairro,
        cidade: r.destino.cidade,
        uf: r.destino.uf,
        cep: r.destino.cep,
      ));
      _veiculo = r.veiculo;
    }
  }

  _Entrega _novaEntrega() {
    final e = _Entrega();
    // Mexeu no endereco: o aviso de erro antigo (ex.: da consulta anterior) sai da tela.
    e.destino.addListener(() {
      if (mounted && _erro != null) setState(() => _erro = null);
    });
    _entregas.add(e);
    return e;
  }

  void _adicionar() {
    if (_entregas.length >= _maxEntregas) return;
    setState(() {
      _novaEntrega();
      _erro = null;
    });
  }

  void _remover(int i) {
    if (_entregas.length <= 1) return;
    setState(() {
      _entregas.removeAt(i).dispose();
      _erro = null;
    });
  }

  @override
  void dispose() {
    _observacoes.dispose();
    for (final e in _entregas) {
      e.dispose();
    }
    super.dispose();
  }

  /// A ULTIMA entrega vai nos campos principais; as anteriores seguem como paradas da rota.
  DadosDeEntrega _dados() {
    final ultima = _entregas.last;
    return DadosDeEntrega(
      descricao: ultima.descricao.text,
      observacoes: _observacoes.text,
      coletaAlternativa: _coletaOutra ? _coletaLugar : null,
      destinatarioNome: ultima.nome.text,
      destinatarioTelefone: ultima.telefone.text,
      destino: ultima.destino.ler(),
      referencia: ultima.referencia.text,
      veiculo: _veiculo,
      paradas: [
        for (final e in _entregas.take(_entregas.length - 1))
          ParadaDeEntrega(
            descricao: e.descricao.text,
            destinatarioNome: e.nome.text,
            destinatarioTelefone: e.telefone.text,
            destino: e.destino.ler(),
            referencia: e.referencia.text,
          ),
      ],
    );
  }

  Future<void> _avancar() async {
    if (_passo <= 1 && !(_chaves[_passo].currentState?.validate() ?? true)) return;
    if (_passo == 0 && _coletaOutra && _coletaLugar == null) {
      setState(() => _erro = 'Busque e escolha o endereço de coleta, ou volte para o endereço do estabelecimento.');
      return;
    }
    if (_passo == 1) {
      for (var i = 0; i < _entregas.length; i++) {
        if (!_entregas[i].destino.temLocalizacao) {
          setState(() => _erro = 'Entrega ${i + 1}: confirme a localização no mapa ("Buscar no mapa" ou "Marcar no mapa (alfinete)").');
          return;
        }
      }
    }
    setState(() => _erro = null);
    if (_passo == 1) {
      await _consultar();
      return;
    }
    if (_passo == 2) {
      if (_veiculo == null || _cotacao?.opcao(_veiculo!) == null) {
        setState(() => _erro = 'Escolha o veículo.');
        return;
      }
      _chave ??= novaChaveDePedido();
    }
    setState(() => _passo += 1);
  }

  void _voltar() {
    if (_passo == 0) {
      Navigator.of(context).maybePop();
      return;
    }
    // Voltou do resumo para mexer: o pedido muda, entao a chave tambem.
    if (_passo == _ultimo) _chave = null;
    setState(() {
      _passo -= 1;
      _erro = null;
    });
  }

  /// Passo 3 -> 4: consulta o preco OFICIAL antes de mostrar o veiculo.
  Future<void> _consultar() async {
    final s = EscopoSessao.ler(context);
    setState(() {
      _consultando = true;
      _erro = null;
      _cotacao = null;
    });
    try {
      final c = await s.servidor.consultarPreco(_dados());
      if (!mounted) return;
      setState(() {
        _cotacao = c;
        if (_veiculo == null || c.opcao(_veiculo!) == null) _veiculo = c.opcoes.isEmpty ? null : c.opcoes.first.veiculo;
        _passo = 2;
      });
    } catch (e) {
      if (mounted) setState(() => _erro = mensagemDe(e));
    } finally {
      if (mounted) setState(() => _consultando = false);
    }
  }

  Future<void> _confirmar() async {
    final s = EscopoSessao.ler(context);
    final chave = _chave;
    final cotacao = _cotacao;
    if (chave == null || cotacao == null || _veiculo == null) return;
    setState(() {
      _enviando = true;
      _erro = null;
    });
    try {
      // Manda junto o preco que a pessoa viu: se mudou, o servidor recusa.
      final entrega = await s.servidor.pedirEntrega(chave, _dados(), cotacao.assinatura, valorEsperadoCents: cotacao.opcao(_veiculo!)?.valorCents);
      if (!mounted) return;
      // So aqui, com a resposta do servidor, a entrega existe.
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => EntregaTela(inicial: entrega)));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.semRede) {
          _incerto = true;
          _erro = 'Sem resposta do servidor. Não sabemos se a entrega foi registrada. Toque em "Tentar de novo": é seguro, o mesmo pedido não é duplicado. '
              'Você também pode conferir na aba Entregas.';
        } else if (e.statusCode == 409 && e.message.startsWith('O preço mudou')) {
          // O preco oficial mudou depois da consulta: nada foi pedido. Volta
          // para consultar de novo (outra chave, porque o pedido muda).
          _cotacao = null;
          _chave = null;
          _passo = 1;
          _erro = e.message;
        } else {
          _erro = e.message;
        }
      });
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  Future<void> _descartar() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Descartar este pedido?'),
        content: const Text('Antes, confira na aba Entregas se ele não apareceu: a conexão caiu na hora de confirmar.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Voltar')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Descartar')),
        ],
      ),
    );
    if (ok == true && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final s = EscopoSessao.de(context);
    final loja = s.estabelecimento;
    return PopScope(
      canPop: _passo == 0 && !_incerto,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (_incerto) {
          _descartar();
        } else {
          _voltar();
        }
      },
      child: Scaffold(
        appBar: AppBar(title: Text('Nova entrega · ${_passo + 1}/4')),
        body: SafeArea(
          child: Column(children: [
            LinearProgressIndicator(value: (_passo + 1) / 4, minHeight: 3, backgroundColor: Cores.borda, color: Cores.loja),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(_titulos[_passo], style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 14),
                  if (widget.repeticao != null && _passo == 0) ...[
                    Faixa(widget.repeticao!.aviso),
                    const SizedBox(height: 14),
                  ],
                  _conteudo(s, loja),
                  if (_erro != null) ...[const SizedBox(height: 14), Faixa(_erro!, tipo: TipoFaixa.erro)],
                ]),
              ),
            ),
            _rodape(),
          ]),
        ),
      ),
    );
  }

  Widget _rodape() {
    final noResumo = _passo == _ultimo;
    final semOpcoes = _passo == 2 && (_cotacao?.opcoes.isEmpty ?? true);
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 14),
      decoration: const BoxDecoration(color: Cores.cartao, border: Border(top: BorderSide(color: Cores.borda))),
      child: Row(children: [
        if (!(_incerto && noResumo))
          Expanded(
            flex: 2,
            child: OutlinedButton(onPressed: (_consultando || _enviando) ? null : _voltar, child: Text(_passo == 0 ? 'Cancelar' : 'Voltar')),
          ),
        if (!(_incerto && noResumo)) const SizedBox(width: 12),
        Expanded(
          flex: 3,
          child: noResumo
              ? BotaoPrincipal(texto: _incerto ? 'Tentar de novo' : 'Confirmar entrega', carregando: _enviando, aoTocar: _confirmar)
              : BotaoPrincipal(
                  texto: _passo == 1 ? 'Consultar preço' : 'Continuar',
                  carregando: _consultando,
                  aoTocar: semOpcoes ? null : _avancar,
                ),
        ),
        if (_incerto && noResumo) ...[
          const SizedBox(width: 12),
          Expanded(flex: 2, child: OutlinedButton(onPressed: _enviando ? null : _descartar, child: const Text('Descartar'))),
        ],
      ]),
    );
  }

  Widget _conteudo(Sessao s, Estabelecimento? loja) {
    switch (_passo) {
      case 0:
        return Form(
          key: _chaves[0],
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            RadioGroup<bool>(
              groupValue: _coletaOutra,
              onChanged: (v) => setState(() => _coletaOutra = v ?? false),
              child: Column(children: [
                RadioListTile<bool>(
                  value: false,
                  title: const Text('Coletar no endereço do estabelecimento'),
                  subtitle: Text(loja?.endereco.porExtenso ?? '', style: const TextStyle(color: Cores.textoSuave)),
                ),
                const RadioListTile<bool>(value: true, title: Text('Coletar em outro endereço')),
              ]),
            ),
            if (_coletaOutra) ...[
              const SizedBox(height: 10),
              BuscaDeLugar(servidor: s.servidor, centro: loja?.endereco, escolhido: _coletaLugar, aoEscolher: (l) => setState(() => _coletaLugar = l)),
            ],
            const SizedBox(height: 14),
            TextFormField(
              controller: _observacoes,
              maxLength: 300,
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Observações para o motorista (opcional)', hintText: 'Ex.: frágil, ligar ao chegar'),
            ),
          ]),
        );
      case 1:
        return Form(
          key: _chaves[1],
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Faixa('Um motorista coleta tudo e faz as entregas na ordem abaixo. O preço é calculado pelo percurso inteiro. Cada pessoa que recebe tem o seu código de 4 números.'),
            const SizedBox(height: 14),
            for (var i = 0; i < _entregas.length; i++) ...[
              _cartaoEntrega(s, loja, i),
              const SizedBox(height: 14),
            ],
            if (_entregas.length < _maxEntregas)
              OutlinedButton.icon(
                key: const ValueKey('adicionar-entrega'),
                onPressed: _adicionar,
                icon: const Icon(Icons.add_location_alt_outlined),
                label: Text('Adicionar outra entrega (${_entregas.length}/$_maxEntregas)'),
              )
            else
              const Text('Máximo de 5 entregas por pedido.', style: TextStyle(color: Cores.textoSuave, fontSize: 12)),
          ]),
        );
      case 2:
        return _passoPreco();
      default:
        return _resumo(loja);
    }
  }

  Widget _cartaoEntrega(Sessao s, Estabelecimento? loja, int i) {
    final e = _entregas[i];
    return Card(
      key: ValueKey('entrega-$i-${identityHashCode(e)}'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            CircleAvatar(radius: 14, backgroundColor: Cores.loja, child: Text('${i + 1}', style: const TextStyle(color: Cores.sobreOuro, fontWeight: FontWeight.w800))),
            const SizedBox(width: 10),
            Expanded(child: Text(_entregas.length == 1 ? 'Entrega' : 'Entrega ${i + 1} de ${_entregas.length}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800))),
            if (_entregas.length > 1)
              IconButton(tooltip: 'Remover esta entrega', onPressed: () => _remover(i), icon: const Icon(Icons.delete_outline)),
          ]),
          const SizedBox(height: 8),
          TextFormField(
            controller: e.descricao,
            maxLength: 120,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'O que será entregue', hintText: 'Ex.: 1 caixa de pizza grande'),
            validator: (v) => Validar.obrigatorio(v, 'Descrição da encomenda', 3),
          ),
          const SizedBox(height: 4),
          TextFormField(
            controller: e.nome,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Nome de quem recebe'),
            validator: (v) => Validar.obrigatorio(v, 'Nome', 2),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: e.telefone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Telefone de quem recebe (opcional, com DDD)'),
            validator: Validar.campoTelefoneOpcional,
          ),
          const SizedBox(height: 14),
          EnderecoCampos(controle: e.destino, servidor: s.servidor, centro: loja?.endereco),
          const SizedBox(height: 12),
          TextFormField(controller: e.referencia, maxLength: 160, decoration: const InputDecoration(labelText: 'Ponto de referência (opcional)')),
        ]),
      ),
    );
  }

  Widget _passoPreco() {
    final c = _cotacao;
    if (c == null) return const Estado(icone: Icons.sync_problem, titulo: 'Preço indisponível', texto: 'Volte e tente de novo.');
    if (c.opcoes.isEmpty) {
      return const Estado(
        icone: Icons.block,
        titulo: 'Entrega indisponível agora',
        texto: 'A Central ainda não liberou entregas para esta cidade ou para este tipo de veículo. Nenhum pedido foi feito.',
      );
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (c.distanciaMetros != null) Text('Percurso: ${Formato.distancia(c.distanciaMetros)} · ${Formato.duracao(c.duracaoSegundos)}', style: const TextStyle(color: Cores.textoSuave)),
      const SizedBox(height: 12),
      RadioGroup<String>(
        groupValue: _veiculo,
        onChanged: (v) => setState(() => _veiculo = v),
        child: Column(children: [
          for (final o in c.opcoes)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Card(
                child: RadioListTile<String>(
                  value: o.veiculo,
                  title: Text(o.nome.isEmpty ? (o.veiculo == 'MOTO' ? 'Moto' : 'Carro') : o.nome, style: const TextStyle(fontWeight: FontWeight.w700)),
                  secondary: Text(Formato.dinheiro(o.valorCents), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Cores.ouro)),
                ),
              ),
            ),
        ]),
      ),
      const SizedBox(height: 6),
      const Text('Preço calculado pela plataforma. O pagamento é feito direto ao motorista.', style: TextStyle(color: Cores.textoFraco, fontSize: 12)),
    ]);
  }

  String _enderecoCurto(Endereco e) {
    final rua = [e.logradouro.trim(), e.numero.trim()].where((x) => x.isNotEmpty).join(', ');
    final cidade = [e.cidade.trim(), e.uf.trim().toUpperCase()].where((x) => x.isNotEmpty).join('/');
    return [rua, e.bairro.trim(), cidade].where((x) => x.isNotEmpty).join(' - ');
  }

  Widget _resumo(Estabelecimento? loja) {
    final c = _cotacao!;
    final op = c.opcao(_veiculo ?? '');
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Linha('Coleta', c.enderecoColeta),
            Linha('Observações', _observacoes.text.trim()),
            for (var i = 0; i < _entregas.length; i++) ...[
              const Divider(height: 22),
              Text(_entregas.length == 1 ? 'Entrega' : 'Entrega ${i + 1} de ${_entregas.length}', style: const TextStyle(fontWeight: FontWeight.w800, color: Cores.loja)),
              const SizedBox(height: 6),
              Linha('Encomenda', _entregas[i].descricao.text.trim()),
              Linha('Endereço', _enderecoCurto(_entregas[i].destino.ler())),
              Linha('Referência', _entregas[i].referencia.text.trim()),
              Linha('Recebe', _entregas[i].telefone.text.trim().isEmpty ? _entregas[i].nome.text.trim() : '${_entregas[i].nome.text.trim()} · ${Formato.telefone(_entregas[i].telefone.text)}'),
            ],
            const Divider(height: 22),
            Linha('Veículo', _veiculo == 'MOTO' ? 'Moto' : 'Carro'),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text(_entregas.length == 1 ? 'Valor da entrega' : 'Valor do pedido (${_entregas.length} entregas)', style: const TextStyle(fontWeight: FontWeight.w600)),
              Text(op == null ? '—' : Formato.dinheiro(op.valorCents), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Cores.ouro)),
            ]),
          ]),
        ),
      ),
      const SizedBox(height: 12),
      const Faixa('Ao confirmar, o pedido entra na fila dos motoristas. Você acompanha tudo na tela seguinte.'),
    ]);
  }
}
