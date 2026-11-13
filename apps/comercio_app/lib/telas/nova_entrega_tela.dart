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

/// Pedir uma entrega, em 6 passos: encomenda, coleta, quem recebe, endereco,
/// veiculo e preco (do servidor), resumo e confirmacao.
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

class _NovaEntregaTelaState extends State<NovaEntregaTela> {
  static const _titulos = ['Encomenda', 'Coleta', 'Quem recebe', 'Endereço de entrega', 'Veículo e preço', 'Resumo'];

  final _chaves = List<GlobalKey<FormState>>.generate(6, (_) => GlobalKey<FormState>());
  final _descricao = TextEditingController();
  final _observacoes = TextEditingController();
  final _nome = TextEditingController();
  final _telefone = TextEditingController();
  final _referencia = TextEditingController();
  final _destino = EnderecoControle();

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
    if (r != null) {
      _descricao.text = r.descricao;
      _observacoes.text = r.observacoes ?? '';
      _nome.text = r.destinatarioNome;
      _telefone.text = r.destinatarioTelefone;
      _referencia.text = r.referencia;
      // Repetir NAO leva a posicao antiga: a pessoa confere e confirma de novo no mapa.
      _destino.preencher(Endereco(
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

  @override
  void dispose() {
    for (final c in [_descricao, _observacoes, _nome, _telefone, _referencia]) {
      c.dispose();
    }
    _destino.dispose();
    super.dispose();
  }

  DadosDeEntrega _dados() => DadosDeEntrega(
        descricao: _descricao.text,
        observacoes: _observacoes.text,
        coletaAlternativa: _coletaOutra ? _coletaLugar : null,
        destinatarioNome: _nome.text,
        destinatarioTelefone: _telefone.text,
        destino: _destino.ler(),
        referencia: _referencia.text,
        veiculo: _veiculo,
      );

  Future<void> _avancar() async {
    if (_passo <= 3 && !(_chaves[_passo].currentState?.validate() ?? true)) return;
    if (_passo == 1 && _coletaOutra && _coletaLugar == null) {
      setState(() => _erro = 'Busque e escolha o endereço de coleta, ou volte para o endereço do estabelecimento.');
      return;
    }
    if (_passo == 3 && !_destino.temLocalizacao) {
      setState(() => _erro = 'Confirme a localização do endereço de entrega no mapa ("Buscar no mapa").');
      return;
    }
    setState(() => _erro = null);
    if (_passo == 3) {
      await _consultar();
      return;
    }
    if (_passo == 4) {
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
    if (_passo == 5) _chave = null;
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
        _passo = 4;
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
          _passo = 3;
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
        appBar: AppBar(title: Text('Nova entrega · ${_passo + 1}/6')),
        body: SafeArea(
          child: Column(children: [
            LinearProgressIndicator(value: (_passo + 1) / 6, minHeight: 3, backgroundColor: Cores.borda, color: Cores.loja),
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
    final noResumo = _passo == 5;
    final semOpcoes = _passo == 4 && (_cotacao?.opcoes.isEmpty ?? true);
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
                  texto: _passo == 3 ? 'Consultar preço' : 'Continuar',
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
          child: Column(children: [
            TextFormField(
              controller: _descricao,
              maxLength: 120,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'O que será entregue', hintText: 'Ex.: 1 caixa de pizza grande'),
              validator: (v) => Validar.obrigatorio(v, 'Descrição da encomenda', 3),
            ),
            const SizedBox(height: 8),
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
            RadioGroup<bool>(
              groupValue: _coletaOutra,
              onChanged: (v) => setState(() => _coletaOutra = v ?? false),
              child: Column(children: [
                RadioListTile<bool>(
                  value: false,
                  title: const Text('No endereço do estabelecimento'),
                  subtitle: Text(loja?.endereco.porExtenso ?? '', style: const TextStyle(color: Cores.textoSuave)),
                ),
                const RadioListTile<bool>(value: true, title: Text('Em outro endereço')),
              ]),
            ),
            if (_coletaOutra) ...[
              const SizedBox(height: 10),
              BuscaDeLugar(servidor: s.servidor, centro: loja?.endereco, escolhido: _coletaLugar, aoEscolher: (l) => setState(() => _coletaLugar = l)),
            ],
          ]),
        );
      case 2:
        return Form(
          key: _chaves[2],
          child: Column(children: [
            TextFormField(
              controller: _nome,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Nome de quem recebe'),
              validator: (v) => Validar.obrigatorio(v, 'Nome', 2),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _telefone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Telefone de quem recebe (com DDD)'),
              validator: Validar.campoTelefone,
            ),
          ]),
        );
      case 3:
        return Form(
          key: _chaves[3],
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            EnderecoCampos(controle: _destino, servidor: s.servidor, centro: loja?.endereco),
            const SizedBox(height: 12),
            TextFormField(controller: _referencia, maxLength: 160, decoration: const InputDecoration(labelText: 'Ponto de referência (opcional)')),
          ]),
        );
      case 4:
        return _passoPreco();
      default:
        return _resumo(loja);
    }
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

  Widget _resumo(Estabelecimento? loja) {
    final c = _cotacao!;
    final op = c.opcao(_veiculo ?? '');
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Linha('Encomenda', _descricao.text.trim()),
            Linha('Observações', _observacoes.text.trim()),
            const Divider(height: 22),
            Linha('Coleta', c.enderecoColeta),
            Linha('Entrega', c.enderecoEntrega),
            Linha('Referência', _referencia.text.trim()),
            const Divider(height: 22),
            Linha('Recebe', '${_nome.text.trim()} · ${Formato.telefone(_telefone.text)}'),
            Linha('Veículo', _veiculo == 'MOTO' ? 'Moto' : 'Carro'),
            const Divider(height: 22),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              const Text('Valor da entrega', style: TextStyle(fontWeight: FontWeight.w600)),
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
