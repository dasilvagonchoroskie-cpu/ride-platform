import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/central_theme.dart';
import '../core/utils/geo.dart';
import '../data/entrega_manual.dart';
import '../data/painel.dart';
import '../widgets/ui.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Azul-ciano do Comercio (o mesmo do app do motorista).
const Color _corDoComercio = Color(0xFF00B8D4);

/// "Lancar entrega manual" na Central (Evandro, 13/11/2026): o estabelecimento
/// ligou ou chegou na Central. Mesmo caminho oficial do Comercio e do
/// lancamento do motorista: o servidor confere tudo (cidade do operador,
/// e-mail confirmado, loja aprovada, chave geral, Entrega ligada na cidade,
/// veiculo aceito) e calcula o preco; o aplicativo so pergunta e mostra.
///
/// 1) procura o estabelecimento; 2) confere o perfil; 3) encomenda e destino;
/// 4) escolhe o veiculo (Moto ou Carro, com o preco oficial de cada um) e quem
/// leva (automatico ou um motorista); 5) lanca.
///
/// Estabelecimento NAO cadastrado (Evandro, 13/11/2026): em vez de procurar, a
/// Central digita o nome, o telefone e o endereco de coleta (confirmado no
/// mapa) e segue as mesmas etapas 3 a 5: mesmo preco oficial e mesmo despacho.
class EntregaManualCentralTela extends StatefulWidget {
  const EntregaManualCentralTela({super.key});

  @override
  State<EntregaManualCentralTela> createState() => _EntregaManualCentralTelaState();
}

enum _Etapa { buscar, perfil, avulso, dados, conferir }

class _EntregaManualCentralTelaState extends State<EntregaManualCentralTela> {
  _Etapa _etapa = _Etapa.buscar;
  bool _ocupado = false;
  String? _erro;

  final _busca = TextEditingController();
  ResultadoDaBuscaDeLoja? _resultado;
  PerfilDaLoja? _perfil;

  // Estabelecimento sem cadastro (avulso): digitado pela Central.
  bool _avulso = false;
  final _aNome = TextEditingController();
  final _aTelefone = TextEditingController();
  final _aRua = TextEditingController();
  final _aNumero = TextEditingController();
  final _aBairro = TextEditingController();
  final _aCidade = TextEditingController();
  final _aUf = TextEditingController();
  double? _aLatitude;
  double? _aLongitude;
  List<Lugar>? _aAchados;
  bool _aPreenchendo = false;

  final _descricao = TextEditingController();
  final _observacoes = TextEditingController();
  final _nomeQuemRecebe = TextEditingController();
  final _telefoneQuemRecebe = TextEditingController();
  final _rua = TextEditingController();
  final _numero = TextEditingController();
  final _complemento = TextEditingController();
  final _bairro = TextEditingController();
  final _cidade = TextEditingController();
  final _uf = TextEditingController();
  final _cep = TextEditingController();
  final _referencia = TextEditingController();
  double? _latitude;
  double? _longitude;
  List<Lugar>? _achados;
  bool _preenchendo = false;

  Map<String, dynamic>? _destino;
  CotacaoDaCentral? _cotacao;
  String _veiculo = 'MOTO';
  MotoristaOnline? _motorista;
  String _chave = novaChaveDeEntregaDaCentral();
  bool _precoMudou = false;
  bool _talvezCriada = false;

  PainelApi get _api => Provider.of<PainelState>(context, listen: false).api;

  @override
  void initState() {
    super.initState();
    for (final c in [_rua, _numero, _bairro, _cidade, _uf, _cep]) {
      c.addListener(_mudouEndereco);
    }
    for (final c in [_aRua, _aNumero, _aBairro, _aCidade, _aUf]) {
      c.addListener(_mudouEnderecoDaColeta);
    }
  }

  @override
  void dispose() {
    for (final c in [_busca, _aNome, _aTelefone, _aRua, _aNumero, _aBairro, _aCidade, _aUf, _descricao, _observacoes, _nomeQuemRecebe, _telefoneQuemRecebe, _rua, _numero, _complemento, _bairro, _cidade, _uf, _cep, _referencia]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Mexeu no endereco depois de confirmar no mapa: a posicao some e precisa ser confirmada de novo.
  void _mudouEndereco() {
    if (_preenchendo || _latitude == null) return;
    setState(() {
      _latitude = null;
      _longitude = null;
    });
  }

  void _mudouEnderecoDaColeta() {
    if (_aPreenchendo || _aLatitude == null) return;
    setState(() {
      _aLatitude = null;
      _aLongitude = null;
    });
  }

  String _mensagem(Object e) => e is ApiException ? e.message : mensagemDe(e);

  Future<void> _fazer(Future<void> Function() acao) async {
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    try {
      await acao();
    } catch (e) {
      if (mounted) setState(() => _erro = _mensagem(e));
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  // ------------------------------------------------------------ 1) buscar

  Future<void> _procurar() async {
    if (_busca.text.trim().length < 3) {
      setState(() => _erro = 'Digite ao menos 3 letras ou números: telefone, e-mail ou nome do estabelecimento.');
      return;
    }
    await _fazer(() async {
      final r = ResultadoDaBuscaDeLoja.fromJson(await _api.buscarLojaParaEntrega(_busca.text));
      if (mounted) setState(() => _resultado = r);
    });
  }

  Future<void> _abrirPerfil(LojaAchada e) async {
    await _fazer(() async {
      final p = PerfilDaLoja.fromJson(await _api.perfilDaLojaParaEntrega(e.id));
      if (!mounted) return;
      setState(() {
        _perfil = p;
        _avulso = false;
        _etapa = _Etapa.perfil;
        if (_cidade.text.isEmpty) _cidade.text = p.cidade;
        if (_uf.text.isEmpty) _uf.text = p.uf;
      });
    });
  }

  // ------------------------------------------------------------ 2b) estabelecimento sem cadastro

  String get _enderecoDaColeta => '${_aRua.text.trim()}, ${_aNumero.text.trim()}, ${_aBairro.text.trim()}, ${_aCidade.text.trim()}/${_aUf.text.trim().toUpperCase()}';

  Future<void> _buscarColetaNoMapa() async {
    if (_aRua.text.trim().length < 3) {
      setState(() => _erro = 'Digite a rua (e o número) da coleta antes de buscar no mapa.');
      return;
    }
    final texto = '${_aRua.text} ${_aNumero.text} ${_aBairro.text} ${_aCidade.text}'.trim();
    final centro = Provider.of<PainelState>(context, listen: false).centro;
    await _fazer(() async {
      final r = await _api.buscarEndereco(texto, centro);
      if (!mounted) return;
      setState(() {
        _aAchados = r;
        if (r.isEmpty) _erro = 'Nenhum endereço encontrado. Confira a rua, o número e o bairro.';
      });
    });
  }

  void _escolherLugarDaColeta(Lugar l) {
    _aPreenchendo = true;
    final partes = l.endereco.split(',').map((s) => s.trim()).toList();
    if (_aRua.text.trim().isEmpty && partes.isNotEmpty) _aRua.text = partes.first;
    if (_aNumero.text.trim().isEmpty && partes.length > 1 && RegExp(r'^\d+\w?$').hasMatch(partes[1])) _aNumero.text = partes[1];
    _aPreenchendo = false;
    setState(() {
      _aLatitude = l.coords.latitude;
      _aLongitude = l.coords.longitude;
      _aAchados = null;
      _erro = null;
    });
  }

  void _comecarAvulso() => setState(() {
        _erro = null;
        _etapa = _Etapa.avulso;
      });

  void _continuarAvulso() {
    String? problema;
    if (_aNome.text.trim().length < 2) {
      problema = 'Digite o nome do estabelecimento.';
    } else if (_digitos(_aTelefone.text).length < 10) {
      problema = 'Digite o telefone do estabelecimento, com DDD.';
    } else if (_aRua.text.trim().length < 3) {
      problema = 'Digite a rua da coleta.';
    } else if (_aNumero.text.trim().isEmpty) {
      problema = 'Digite o número da coleta (ou S/N).';
    } else if (_aBairro.text.trim().length < 2) {
      problema = 'Digite o bairro da coleta.';
    } else if (_aCidade.text.trim().length < 2) {
      problema = 'Digite a cidade da coleta.';
    } else if (_aUf.text.trim().length != 2) {
      problema = 'Digite a UF com 2 letras (ex.: GO).';
    } else if (_aLatitude == null || _aLongitude == null) {
      problema = 'Toque em "Confirmar coleta no mapa" para marcar o ponto exato da retirada.';
    }
    if (problema != null) {
      setState(() => _erro = problema);
      return;
    }
    setState(() {
      _erro = null;
      _avulso = true;
      // A entrega costuma ser na mesma cidade da coleta: adianta o preenchimento.
      if (_cidade.text.isEmpty) _cidade.text = _aCidade.text.trim();
      if (_uf.text.isEmpty) _uf.text = _aUf.text.trim().toUpperCase();
      _etapa = _Etapa.dados;
    });
  }

  String get _nomeDoEstabelecimento => _avulso ? _aNome.text.trim() : _perfil!.nome;
  String get _retirada => _avulso ? _enderecoDaColeta : _perfil!.enderecoDeRetirada;

  // ------------------------------------------------------------ 3) dados

  Future<void> _buscarNoMapa() async {
    final texto = '${_rua.text} ${_numero.text} ${_bairro.text} ${_cidade.text}'.trim();
    if (_rua.text.trim().length < 3) {
      setState(() => _erro = 'Digite a rua (e o número) antes de buscar no mapa.');
      return;
    }
    final centro = Provider.of<PainelState>(context, listen: false).centro;
    await _fazer(() async {
      final r = await _api.buscarEndereco(texto, centro);
      if (!mounted) return;
      setState(() {
        _achados = r;
        if (r.isEmpty) _erro = 'Nenhum endereço encontrado. Confira a rua, o número e o bairro.';
      });
    });
  }

  void _escolherLugar(Lugar l) {
    _preenchendo = true;
    final partes = l.endereco.split(',').map((s) => s.trim()).toList();
    if (_rua.text.trim().isEmpty && partes.isNotEmpty) _rua.text = partes.first;
    if (_numero.text.trim().isEmpty && partes.length > 1 && RegExp(r'^\d+\w?$').hasMatch(partes[1])) _numero.text = partes[1];
    _preenchendo = false;
    setState(() {
      _latitude = l.coords.latitude;
      _longitude = l.coords.longitude;
      _achados = null;
      _erro = null;
    });
  }

  String _digitos(String t) => t.replaceAll(RegExp(r'\D'), '');

  String? _conferirDados() {
    if (_descricao.text.trim().length < 3) return 'Descreva a encomenda (ex.: 2 pizzas grandes).';
    if (_nomeQuemRecebe.text.trim().length < 2) return 'Digite o nome de quem recebe.';
    if (_digitos(_telefoneQuemRecebe.text).length < 10) return 'Digite o telefone de quem recebe, com DDD.';
    if (_rua.text.trim().length < 3) return 'Digite a rua do destino.';
    if (_numero.text.trim().isEmpty) return 'Digite o número do destino (ou S/N).';
    if (_bairro.text.trim().length < 2) return 'Digite o bairro do destino.';
    if (_cidade.text.trim().length < 2) return 'Digite a cidade do destino.';
    if (_uf.text.trim().length != 2) return 'Digite a UF com 2 letras (ex.: GO).';
    if (_digitos(_cep.text).length != 8) return 'Digite o CEP do destino (8 números).';
    if (_latitude == null || _longitude == null) return 'Toque em "Confirmar endereço no mapa" para marcar o ponto exato da entrega.';
    return null;
  }

  Map<String, dynamic> _destinoJson() => {
        'logradouro': _rua.text.trim(),
        'numero': _numero.text.trim(),
        if (_complemento.text.trim().isNotEmpty) 'complemento': _complemento.text.trim(),
        'bairro': _bairro.text.trim(),
        'cidade': _cidade.text.trim(),
        'uf': _uf.text.trim().toUpperCase(),
        'cep': _digitos(_cep.text),
        'latitude': _latitude,
        'longitude': _longitude,
        if (_referencia.text.trim().isNotEmpty) 'referencia': _referencia.text.trim(),
      };

  Map<String, dynamic> _corpoBase() => {
        if (_avulso)
          'estabelecimento': {
            'nome': _aNome.text.trim(),
            'telefone': _digitos(_aTelefone.text),
            'coleta': {'address': _enderecoDaColeta, 'latitude': _aLatitude, 'longitude': _aLongitude},
          }
        else
          'comercioId': _perfil!.id,
        'encomenda': {
          'descricao': _descricao.text.trim(),
          if (_observacoes.text.trim().isNotEmpty) 'observacoes': _observacoes.text.trim(),
        },
        'destinatario': {'nome': _nomeQuemRecebe.text.trim(), 'telefone': _digitos(_telefoneQuemRecebe.text)},
        'destino': _destino ?? _destinoJson(),
      };

  String get _enderecoPorExtenso => '${_rua.text.trim()}, ${_numero.text.trim()} - ${_bairro.text.trim()}, ${_cidade.text.trim()} - ${_uf.text.trim().toUpperCase()}';

  // ------------------------------------------------------------ 4) conferir

  Future<Map<String, dynamic>> _cotarNoServidor() => _avulso ? _api.cotarEntregaAvulsaDaCentral(_corpoBase()) : _api.cotarEntregaDaCentral(_corpoBase());

  Future<void> _consultarPreco() async {
    final problema = _conferirDados();
    if (problema != null) {
      setState(() => _erro = problema);
      return;
    }
    _destino = _destinoJson();
    await _fazer(() async {
      final c = CotacaoDaCentral.fromJson(await _cotarNoServidor());
      if (!mounted) return;
      if (c.opcoes.isEmpty) {
        setState(() => _erro = 'Nenhum veículo tem preço para esta entrega agora (a Entrega pode estar desligada nesta cidade). Confira em Cidades.');
        return;
      }
      setState(() {
        _cotacao = c;
        _veiculo = c.opcao(_veiculo) != null ? _veiculo : c.opcoes.first.veiculo;
        _motorista = null;
        _precoMudou = false;
        _talvezCriada = false;
        _chave = novaChaveDeEntregaDaCentral();
        _etapa = _Etapa.conferir;
      });
    });
  }

  Future<void> _escolherMotorista() async {
    final centro = Provider.of<PainelState>(context, listen: false).centro;
    final moto = _veiculo == 'MOTO';
    final escolhido = await showModalBottomSheet<MotoristaOnline>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (_) => _EscolherMotoristaDaEntrega(api: _api, perto: centro, moto: moto),
    );
    if (escolhido != null && mounted) setState(() => _motorista = escolhido);
  }

  Future<void> _lancar() async {
    final c = _cotacao!;
    final opcao = c.opcao(_veiculo);
    if (opcao == null) {
      setState(() => _erro = 'Escolha o veículo da entrega.');
      return;
    }
    final navegador = Navigator.of(context);
    final aviso = ScaffoldMessenger.of(context);
    final estado = Provider.of<PainelState>(context, listen: false);
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    try {
      final Map<String, dynamic> corpo = {
        ..._corpoBase(),
        'chave': _chave,
        'veiculo': _veiculo,
        if (c.cotacao != null && c.cotacao!.isNotEmpty) 'cotacao': c.cotacao,
        'valorEsperadoCents': opcao.valorCents,
        if (_motorista != null) 'motoristaId': _motorista!.id,
      };
      final r = _avulso ? await _api.lancarEntregaAvulsaDaCentral(corpo) : await _api.lancarEntregaDaCentral(corpo);
      final codigo = r['codigo'] is String ? ' (${r['codigo']})' : '';
      aviso.showSnackBar(SnackBar(
        content: Text(_motorista == null
            ? 'Entrega lançada$codigo. O sistema já está procurando um motorista.'
            : 'Entrega lançada$codigo e enviada para ${_motorista!.nome}.'),
      ));
      await estado.atualizar();
      navegador.pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isNetworkError) {
        setState(() {
          _talvezCriada = true;
          _erro = 'Sem conexão. A entrega pode já ter sido lançada: toque em "Tentar de novo" (não duplica) ou confira em Despacho.';
        });
      } else if (e.statusCode == 409 && e.message.startsWith('O preço mudou')) {
        await _novoPreco(e.message);
      } else {
        setState(() => _erro = e.message);
      }
    } catch (_) {
      if (mounted) setState(() => _erro = 'Algo deu errado. Confira a internet e tente de novo.');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  /// O preco oficial mudou: consulta de novo, mostra o valor novo e pede nova confirmacao (chave nova).
  Future<void> _novoPreco(String mensagem) async {
    try {
      final c = CotacaoDaCentral.fromJson(await _cotarNoServidor());
      if (!mounted) return;
      setState(() {
        if (c.opcoes.isNotEmpty) _cotacao = c;
        _chave = novaChaveDeEntregaDaCentral();
        _precoMudou = true;
        _talvezCriada = false;
        _erro = '$mensagem Confira o valor novo e confirme de novo.';
      });
    } catch (e) {
      if (mounted) setState(() => _erro = _mensagem(e));
    }
  }

  void _voltar() {
    if (_etapa == _Etapa.buscar) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _erro = null;
      _etapa = switch (_etapa) {
        _Etapa.conferir => _Etapa.dados,
        _Etapa.dados => _avulso ? _Etapa.avulso : _Etapa.perfil,
        _ => _Etapa.buscar,
      };
    });
  }

  // ------------------------------------------------------------ tela

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _etapa == _Etapa.buscar,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _voltar();
      },
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: const Text('Lançar entrega manual'),
          leading: BackButton(onPressed: _ocupado ? null : _voltar),
        ),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Spacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ...switch (_etapa) {
                  _Etapa.buscar => _telaBuscar(),
                  _Etapa.perfil => _telaPerfil(),
                  _Etapa.avulso => _telaAvulso(),
                  _Etapa.dados => _telaDados(),
                  _Etapa.conferir => _telaConferir(),
                },
                if (_erro != null) ...[
                  const SizedBox(height: Spacing.md),
                  Text(_erro!, key: const Key('erro-entrega-manual'), style: AppText.body.copyWith(color: AppColors.danger)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _campo(String rotulo, TextEditingController c, {TextInputType? teclado, TextCapitalization caps = TextCapitalization.none, IconData? icone, int? max}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.sm),
      child: TextField(
        controller: c,
        enabled: !_ocupado,
        keyboardType: teclado,
        textCapitalization: caps,
        maxLength: max,
        decoration: InputDecoration(labelText: rotulo, prefixIcon: icone == null ? null : Icon(icone), counterText: max == null ? null : ''),
      ),
    );
  }

  List<Widget> _telaBuscar() {
    final r = _resultado;
    return [
      Text(
        'Estabelecimento do Comércio que ligou ou chegou na Central. A entrega entra no sistema oficial: '
        'preço do servidor, acompanhamento e histórico, igual aos pedidos feitos pelo aplicativo dele.',
        style: AppText.body.copyWith(color: AppColors.textMuted),
      ),
      const SizedBox(height: Spacing.lg),
      TextField(
        controller: _busca,
        enabled: !_ocupado,
        textInputAction: TextInputAction.search,
        onSubmitted: (_) => _procurar(),
        decoration: const InputDecoration(labelText: 'Telefone, e-mail ou nome do estabelecimento', prefixIcon: Icon(Icons.storefront)),
      ),
      const SizedBox(height: Spacing.md),
      AppButton(label: 'Procurar estabelecimento', loading: _ocupado && _etapa == _Etapa.buscar, onPressed: _procurar),
      if (r != null) ...[
        const SizedBox(height: Spacing.lg),
        if (!r.liberado)
          _AvisoLinha(icone: Icons.lock_outline, texto: 'O aplicativo Comércio está desligado na Central (Comércios). Não dá para lançar entregas agora.', cor: AppColors.warning),
        if (r.itens.isEmpty)
          Text(
            'Nenhum estabelecimento com esses dados na sua cidade. Confira o telefone, o e-mail ou o nome. '
            'Se ele não tem cadastro no Comércio, use "Estabelecimento não cadastrado" logo abaixo.',
            style: AppText.body.copyWith(color: AppColors.textMuted),
          )
        else ...[
          Text(r.itens.length == 1 ? 'Achei 1 estabelecimento. Toque para conferir:' : 'Achei ${r.itens.length}. Toque no certo:', style: AppText.bodyStrong),
          const SizedBox(height: Spacing.sm),
          for (final e in r.itens) _CartaoDaLoja(achada: e, aoTocar: _ocupado ? null : () => _abrirPerfil(e)),
        ],
      ],
      const SizedBox(height: Spacing.xl),
      const Divider(),
      const SizedBox(height: Spacing.sm),
      Text('Não tem cadastro no Comércio?', style: AppText.bodyStrong),
      const SizedBox(height: Spacing.xs),
      Text(
        'Dá para lançar a coleta e a entrega mesmo assim: digite o nome, o telefone e o endereço de retirada. O preço e o despacho são os mesmos.',
        style: AppText.body.copyWith(color: AppColors.textMuted),
      ),
      const SizedBox(height: Spacing.sm),
      OutlinedButton.icon(
        key: const Key('entrega-avulsa'),
        onPressed: _ocupado ? null : _comecarAvulso,
        icon: const Icon(Icons.add_business_outlined),
        label: const Text('Estabelecimento não cadastrado'),
      ),
    ];
  }

  List<Widget> _telaAvulso() {
    return [
      Text('Estabelecimento não cadastrado', style: AppText.heading),
      const SizedBox(height: Spacing.xs),
      Text(
        'Só para esta entrega: não cria cadastro no Comércio. O telefone serve para o motorista ligar na coleta.',
        style: AppText.body.copyWith(color: AppColors.textMuted),
      ),
      const SizedBox(height: Spacing.md),
      _campo('Nome do estabelecimento', _aNome, caps: TextCapitalization.words, icone: Icons.storefront),
      _campo('Telefone do estabelecimento (com DDD)', _aTelefone, teclado: TextInputType.phone, icone: Icons.phone),
      const SizedBox(height: Spacing.sm),
      Text('Endereço da coleta (retirada)', style: AppText.bodyStrong),
      const SizedBox(height: Spacing.sm),
      _campo('Rua / avenida', _aRua, caps: TextCapitalization.words),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(flex: 2, child: _campo('Número', _aNumero)),
        const SizedBox(width: Spacing.sm),
        Expanded(flex: 3, child: _campo('Bairro', _aBairro, caps: TextCapitalization.words)),
      ]),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(flex: 3, child: _campo('Cidade', _aCidade, caps: TextCapitalization.words)),
        const SizedBox(width: Spacing.sm),
        Expanded(flex: 1, child: _campo('UF', _aUf, caps: TextCapitalization.characters, max: 2)),
      ]),
      if (_aLatitude != null)
        _AvisoLinha(icone: Icons.check_circle_outline, texto: 'Coleta confirmada no mapa.', cor: AppColors.success)
      else
        OutlinedButton.icon(
          key: const Key('confirmar-coleta-no-mapa'),
          onPressed: _ocupado ? null : _buscarColetaNoMapa,
          icon: const Icon(Icons.pin_drop_outlined),
          label: const Text('Confirmar coleta no mapa'),
        ),
      if (_aAchados != null && _aAchados!.isNotEmpty) ...[
        const SizedBox(height: Spacing.sm),
        Text('Toque no endereço certo:', style: AppText.bodyStrong),
        for (final l in _aAchados!)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.place_outlined),
            title: Text(l.endereco),
            subtitle: l.detalhe.isEmpty ? null : Text(l.detalhe),
            onTap: () => _escolherLugarDaColeta(l),
          ),
      ],
      const SizedBox(height: Spacing.lg),
      AppButton(label: 'Continuar', enabled: !_ocupado, onPressed: _continuarAvulso),
    ];
  }

  List<Widget> _telaPerfil() {
    final p = _perfil!;
    final liberado = _resultado?.liberado ?? true;
    return [
      Text('Confira se é este estabelecimento', style: AppText.heading),
      const SizedBox(height: Spacing.md),
      if (!p.podeLancar)
        _AvisoLinha(icone: Icons.block, texto: p.motivo ?? 'Este estabelecimento não pode receber entregas agora.', cor: AppColors.danger)
      else if (!liberado)
        _AvisoLinha(icone: Icons.lock_outline, texto: 'O aplicativo Comércio está desligado na Central.', cor: AppColors.warning),
      AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.storefront, color: _corDoComercio),
              const SizedBox(width: Spacing.sm),
              Expanded(child: Text(p.nome, style: AppText.title)),
            ]),
            const SizedBox(height: Spacing.sm),
            if (p.razaoSocial.isNotEmpty) Linha('Razão social', p.razaoSocial),
            if (p.cnpj.isNotEmpty) Linha('CNPJ', p.cnpj),
            Linha('Telefone', telefoneBonito(p.telefone)),
            Linha('Endereço de retirada', p.enderecoDeRetirada),
            Linha('Cadastro', p.situacaoRotulo),
            Linha('Entregas concluídas', '${p.entregasConcluidas}'),
          ],
        ),
      ),
      const SizedBox(height: Spacing.lg),
      if (p.podeLancar && liberado)
        AppButton(
          label: 'Confirmar este estabelecimento',
          onPressed: () => setState(() {
            _etapa = _Etapa.dados;
            _erro = null;
          }),
        ),
    ];
  }

  List<Widget> _telaDados() {
    return [
      Row(children: [
        const Icon(Icons.storefront, color: _corDoComercio, size: 20),
        const SizedBox(width: Spacing.sm),
        Expanded(child: Text(_nomeDoEstabelecimento, style: AppText.bodyStrong)),
        if (_avulso) Text('sem cadastro', style: AppText.body.copyWith(color: AppColors.textMuted)),
      ]),
      const SizedBox(height: Spacing.xs),
      Text('Retirada em: $_retirada', style: AppText.body.copyWith(color: AppColors.textMuted)),
      const SizedBox(height: Spacing.lg),
      Text('Encomenda', style: AppText.heading),
      const SizedBox(height: Spacing.sm),
      _campo('O que vai levar (ex.: 2 pizzas grandes)', _descricao, caps: TextCapitalization.sentences, icone: Icons.inventory_2_outlined),
      _campo('Observações (opcional)', _observacoes, caps: TextCapitalization.sentences),
      const SizedBox(height: Spacing.md),
      Text('Quem recebe', style: AppText.heading),
      const SizedBox(height: Spacing.sm),
      _campo('Nome de quem recebe', _nomeQuemRecebe, caps: TextCapitalization.words, icone: Icons.person),
      _campo('Telefone de quem recebe (com DDD)', _telefoneQuemRecebe, teclado: TextInputType.phone, icone: Icons.phone),
      const SizedBox(height: Spacing.md),
      Text('Endereço da entrega', style: AppText.heading),
      const SizedBox(height: Spacing.sm),
      _campo('Rua / avenida', _rua, caps: TextCapitalization.words),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(flex: 2, child: _campo('Número', _numero)),
        const SizedBox(width: Spacing.sm),
        Expanded(flex: 3, child: _campo('Complemento (opcional)', _complemento)),
      ]),
      _campo('Bairro', _bairro, caps: TextCapitalization.words),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(flex: 3, child: _campo('Cidade', _cidade, caps: TextCapitalization.words)),
        const SizedBox(width: Spacing.sm),
        Expanded(flex: 1, child: _campo('UF', _uf, caps: TextCapitalization.characters, max: 2)),
      ]),
      _campo('CEP', _cep, teclado: TextInputType.number),
      _campo('Ponto de referência (opcional)', _referencia),
      const SizedBox(height: Spacing.sm),
      if (_latitude != null)
        _AvisoLinha(icone: Icons.check_circle_outline, texto: 'Endereço confirmado no mapa.', cor: AppColors.success)
      else
        OutlinedButton.icon(
          key: const Key('confirmar-no-mapa'),
          onPressed: _ocupado ? null : _buscarNoMapa,
          icon: const Icon(Icons.pin_drop_outlined),
          label: const Text('Confirmar endereço no mapa'),
        ),
      if (_achados != null && _achados!.isNotEmpty) ...[
        const SizedBox(height: Spacing.sm),
        Text('Toque no endereço certo:', style: AppText.bodyStrong),
        for (final l in _achados!)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.place_outlined),
            title: Text(l.endereco),
            subtitle: l.detalhe.isEmpty ? null : Text(l.detalhe),
            onTap: () => _escolherLugar(l),
          ),
      ],
      const SizedBox(height: Spacing.lg),
      AppButton(label: 'Ver o preço', loading: _ocupado, onPressed: _consultarPreco),
    ];
  }

  List<Widget> _telaConferir() {
    final c = _cotacao!;
    final opcao = c.opcao(_veiculo) ?? c.opcoes.first;
    return [
      Text('Confira antes de lançar', style: AppText.heading),
      const SizedBox(height: Spacing.md),
      AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Linha('Estabelecimento', _avulso ? '$_nomeDoEstabelecimento (sem cadastro)' : _nomeDoEstabelecimento),
            if (_avulso) Linha('Telefone', telefoneBonito(_digitos(_aTelefone.text))),
            Linha('Retirada', c.coleta.isEmpty ? _retirada : c.coleta),
            Linha('Entrega em', _enderecoPorExtenso),
            Linha('Encomenda', _descricao.text.trim()),
            Linha('Quem recebe', '${_nomeQuemRecebe.text.trim()} · ${telefoneBonito(_digitos(_telefoneQuemRecebe.text))}'),
            if (c.distanciaMetros > 0) Linha('Distância', '${(c.distanciaMetros / 1000).toStringAsFixed(1).replaceAll('.', ',')} km'),
          ],
        ),
      ),
      const SizedBox(height: Spacing.md),
      Text('Veículo da entrega', style: AppText.bodyStrong),
      const SizedBox(height: Spacing.xs),
      Wrap(
        spacing: Spacing.sm,
        children: [
          for (final o in c.opcoes)
            ChoiceChip(
              key: Key('veiculo-${o.veiculo}'),
              avatar: Icon(o.moto ? Icons.two_wheeler : Icons.directions_car_outlined, size: 18),
              label: Text('${o.moto ? 'Moto' : 'Carro'} · ${reais(o.valorCents)}'),
              selected: _veiculo == o.veiculo,
              onSelected: _ocupado
                  ? null
                  : (_) => setState(() {
                        _veiculo = o.veiculo;
                        _motorista = null;
                        _erro = null;
                      }),
            ),
        ],
      ),
      const SizedBox(height: Spacing.md),
      Text('Quem leva', style: AppText.bodyStrong),
      const SizedBox(height: Spacing.xs),
      if (_motorista == null)
        Text('Automático: o sistema procura o motorista mais perto, como nos pedidos do aplicativo.', style: AppText.body.copyWith(color: AppColors.textMuted))
      else
        Text('${_motorista!.nome} (${_veiculo == 'MOTO' ? 'moto' : 'carro'}): o chamado vai só para ele.', style: AppText.body),
      const SizedBox(height: Spacing.xs),
      Wrap(spacing: Spacing.sm, runSpacing: Spacing.xs, crossAxisAlignment: WrapCrossAlignment.center, children: [
        OutlinedButton.icon(
          key: const Key('escolher-motorista-da-entrega'),
          onPressed: _ocupado ? null : _escolherMotorista,
          icon: const Icon(Icons.person_search),
          label: Text(_motorista == null ? 'Escolher um motorista' : 'Trocar motorista'),
        ),
        if (_motorista != null)
          TextButton(onPressed: _ocupado ? null : () => setState(() => _motorista = null), child: const Text('Automático')),
      ]),
      const SizedBox(height: Spacing.md),
      Container(
        key: const Key('preco-oficial'),
        padding: const EdgeInsets.all(Spacing.lg),
        decoration: BoxDecoration(
          color: _precoMudou ? AppColors.warningSoft : AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(Radii.lg),
          border: Border.all(color: _precoMudou ? AppColors.warning : _corDoComercio),
        ),
        child: Column(children: [
          Text(_precoMudou ? 'Valor atualizado' : 'Valor da entrega', style: AppText.body.copyWith(color: AppColors.textMuted)),
          const SizedBox(height: Spacing.xs),
          Text(reais(opcao.valorCents), style: AppText.display),
          const SizedBox(height: Spacing.xs),
          Text('Preço oficial calculado pelo servidor.', style: AppText.body.copyWith(color: AppColors.textMuted)),
        ]),
      ),
      const SizedBox(height: Spacing.lg),
      AppButton(
        label: _talvezCriada ? 'Tentar de novo' : 'Confirmar o preço e lançar a entrega',
        loading: _ocupado,
        onPressed: _lancar,
      ),
    ];
  }
}

class _AvisoLinha extends StatelessWidget {
  const _AvisoLinha({required this.icone, required this.texto, required this.cor});

  final IconData icone;
  final String texto;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icone, color: cor, size: 20),
          const SizedBox(width: Spacing.sm),
          Expanded(child: Text(texto, style: AppText.body.copyWith(color: cor))),
        ],
      ),
    );
  }
}

class _CartaoDaLoja extends StatelessWidget {
  const _CartaoDaLoja({required this.achada, required this.aoTocar});

  final LojaAchada achada;
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    final a = achada;
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.sm),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(Radii.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.md),
          onTap: aoTocar,
          child: Padding(
            padding: const EdgeInsets.all(Spacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Icon(Icons.storefront, color: _corDoComercio, size: 20),
                  const SizedBox(width: Spacing.sm),
                  Expanded(child: Text(a.nome, style: AppText.bodyStrong)),
                  const Icon(Icons.chevron_right, color: AppColors.textFaint),
                ]),
                const SizedBox(height: 2),
                Text(a.endereco, style: AppText.body.copyWith(color: AppColors.textMuted)),
                if (a.telefoneFinal.isNotEmpty) Text('Telefone terminado em ${a.telefoneFinal}', style: AppText.body.copyWith(color: AppColors.textMuted)),
                const SizedBox(height: 2),
                Text(
                  a.podeLancar ? a.situacaoRotulo : (a.motivo ?? a.situacaoRotulo),
                  style: AppText.body.copyWith(color: a.podeLancar ? AppColors.success : AppColors.danger),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Motoristas online (livres) do veiculo escolhido, do mais perto ao mais longe.
class _EscolherMotoristaDaEntrega extends StatefulWidget {
  const _EscolherMotoristaDaEntrega({required this.api, required this.perto, required this.moto});

  final PainelApi api;
  final Coords perto;
  final bool moto;

  @override
  State<_EscolherMotoristaDaEntrega> createState() => _EscolherMotoristaDaEntregaState();
}

class _EscolherMotoristaDaEntregaState extends State<_EscolherMotoristaDaEntrega> {
  late Future<List<MotoristaOnline>> _lista = widget.api.motoristasOnline(widget.perto);

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.7,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.all(Spacing.lg),
              child: Text(widget.moto ? 'Motoristas de moto online' : 'Motoristas de carro online', style: AppText.heading),
            ),
            Expanded(
              child: FutureBuilder<List<MotoristaOnline>>(
                future: _lista,
                builder: (context, s) {
                  if (s.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
                  if (s.hasError) {
                    return Aviso(texto: 'Não foi possível carregar: ${mensagemDe(s.error!)}', tentarDeNovo: () => setState(() => _lista = widget.api.motoristasOnline(widget.perto)));
                  }
                  final lista = [for (final m in s.data!) if (m.moto == widget.moto && !m.ocupado) m];
                  if (lista.isEmpty) {
                    return Aviso(texto: 'Nenhum motorista de ${widget.moto ? 'moto' : 'carro'} livre agora. Deixe em "Automático".', icone: Icons.person_off_outlined);
                  }
                  return ListView(
                    children: [
                      for (final m in lista)
                        ListTile(
                          leading: Icon(m.moto ? Icons.two_wheeler : Icons.local_taxi, color: AppColors.success),
                          title: Text(m.nome),
                          subtitle: Text('${m.veiculo} · ${m.placa}${m.distanciaKm == null ? '' : ' · ${m.distanciaKm!.toStringAsFixed(1).replaceAll('.', ',')} km'}'),
                          onTap: () => Navigator.of(context).pop(m),
                        ),
                    ],
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
