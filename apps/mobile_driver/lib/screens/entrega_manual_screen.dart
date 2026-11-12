import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/entrega_manual.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';

/// Azul-ciano do Comercio (o mesmo da Central).
const Color corDoComercio = Color(0xFF00B8D4);

/// "Lancar entrega manualmente" (Evandro, 12/11/2026): o estabelecimento ligou
/// ou chamou o motorista no balcao. Fluxo separado da corrida manual de
/// passageiro, no MESMO caminho oficial do Comercio (preco do servidor,
/// despacho, localizacao, acompanhamento e historico).
///
/// 1) procura o estabelecimento (telefone, e-mail ou nome); 2) confere o perfil
/// e confirma; 3) digita a encomenda e o destino; 4) confere o preco oficial e
/// lanca. Quem decide se pode (e-mail confirmado, loja aprovada, chave geral,
/// Entrega ligada na cidade, veiculo aceito) e SEMPRE o servidor.
class EntregaManualScreen extends StatefulWidget {
  const EntregaManualScreen({super.key});

  @override
  State<EntregaManualScreen> createState() => _EntregaManualScreenState();
}

enum _Etapa { buscar, perfil, dados, conferir }

class _EntregaManualScreenState extends State<EntregaManualScreen> {
  _Etapa _etapa = _Etapa.buscar;
  bool _ocupado = false;
  String? _erro;

  // 1) busca
  final _busca = TextEditingController();
  ResultadoDaBusca? _resultado;

  // 2) perfil
  PerfilDoEstabelecimento? _perfil;

  // 3) dados
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
  List<LugarAchado>? _achados;
  bool _preenchendo = false;

  // 4) conferencia
  DadosDaEntregaManual? _dados;
  CotacaoDaEntrega? _cotacao;
  String _chave = novaChaveDeEntrega();

  /// Recusou por preco mudado: o valor novo ja esta na tela e precisa de novo "confirmar".
  bool _precoMudou = false;

  /// A rede caiu no meio do lancamento: a entrega pode ja existir; repetir usa a MESMA chave.
  bool _talvezCriada = false;

  @override
  void initState() {
    super.initState();
    for (final c in [_rua, _numero, _bairro, _cidade, _uf, _cep]) {
      c.addListener(_mudouEndereco);
    }
  }

  @override
  void dispose() {
    for (final c in [_busca, _descricao, _observacoes, _nomeQuemRecebe, _telefoneQuemRecebe, _rua, _numero, _complemento, _bairro, _cidade, _uf, _cep, _referencia]) {
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

  String _mensagem(Object e) => e is ApiException ? e.message : 'Algo deu errado. Confira a internet e tente de novo.';

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

  // ---------------------------------------------------------------- 1) buscar

  Future<void> _procurar() async {
    if (_busca.text.trim().length < 3) {
      setState(() => _erro = 'Digite ao menos 3 letras ou números: telefone, e-mail ou nome do estabelecimento.');
      return;
    }
    final estado = context.read<DriverState>();
    await _fazer(() async {
      final r = await estado.buscarEstabelecimento(_busca.text);
      if (mounted) setState(() => _resultado = r);
    });
  }

  Future<void> _abrirPerfil(EstabelecimentoAchado e) async {
    final estado = context.read<DriverState>();
    await _fazer(() async {
      final p = await estado.perfilDoEstabelecimento(e.id);
      if (!mounted) return;
      setState(() {
        _perfil = p;
        _etapa = _Etapa.perfil;
        // Cidade e UF do estabelecimento sao o ponto de partida do destino.
        if (_cidade.text.isEmpty) _cidade.text = p.cidade;
        if (_uf.text.isEmpty) _uf.text = p.uf;
      });
    });
  }

  // ---------------------------------------------------------------- 3) dados

  Future<void> _buscarNoMapa() async {
    final texto = '${_rua.text} ${_numero.text} ${_bairro.text} ${_cidade.text}'.trim();
    if (_rua.text.trim().length < 3) {
      setState(() => _erro = 'Digite a rua (e o número) antes de buscar no mapa.');
      return;
    }
    final estado = context.read<DriverState>();
    await _fazer(() async {
      final r = await estado.buscarEnderecoDaEntrega(texto);
      if (!mounted) return;
      setState(() {
        _achados = r;
        if (r.isEmpty) _erro = 'Nenhum endereço encontrado. Confira a rua, o número e o bairro.';
      });
    });
  }

  void _escolherLugar(LugarAchado l) {
    _preenchendo = true;
    final partes = l.endereco.split(',').map((s) => s.trim()).toList();
    if (_rua.text.trim().isEmpty && partes.isNotEmpty) _rua.text = partes.first;
    if (_numero.text.trim().isEmpty && partes.length > 1 && RegExp(r'^\d+\w?$').hasMatch(partes[1])) _numero.text = partes[1];
    _preenchendo = false;
    setState(() {
      _latitude = l.latitude;
      _longitude = l.longitude;
      _achados = null;
      _erro = null;
    });
  }

  String? _conferirDados() {
    if (_descricao.text.trim().length < 3) return 'Descreva a encomenda (ex.: 2 pizzas grandes).';
    if (_nomeQuemRecebe.text.trim().length < 2) return 'Digite o nome de quem recebe.';
    if (onlyDigits(_telefoneQuemRecebe.text).length < 10) return 'Digite o telefone de quem recebe, com DDD.';
    if (_rua.text.trim().length < 3) return 'Digite a rua do destino.';
    if (_numero.text.trim().isEmpty) return 'Digite o número do destino (ou S/N).';
    if (_bairro.text.trim().length < 2) return 'Digite o bairro do destino.';
    if (_cidade.text.trim().length < 2) return 'Digite a cidade do destino.';
    if (_uf.text.trim().length != 2) return 'Digite a UF com 2 letras (ex.: GO).';
    if (onlyDigits(_cep.text).length != 8) return 'Digite o CEP do destino (8 números).';
    if (_latitude == null || _longitude == null) return 'Toque em "Confirmar endereço no mapa" para marcar o ponto exato da entrega.';
    return null;
  }

  DadosDaEntregaManual _montar() => DadosDaEntregaManual(
        comercioId: _perfil!.id,
        descricao: _descricao.text,
        observacoes: _observacoes.text,
        destinatarioNome: _nomeQuemRecebe.text,
        destinatarioTelefone: onlyDigits(_telefoneQuemRecebe.text),
        destino: DestinoDaEntrega(
          logradouro: _rua.text,
          numero: _numero.text,
          complemento: _complemento.text,
          bairro: _bairro.text,
          cidade: _cidade.text,
          uf: _uf.text,
          cep: _cep.text,
          latitude: _latitude!,
          longitude: _longitude!,
          referencia: _referencia.text,
        ),
      );

  // ---------------------------------------------------------------- 4) conferir

  Future<void> _consultarPreco() async {
    final problema = _conferirDados();
    if (problema != null) {
      setState(() => _erro = problema);
      return;
    }
    final estado = context.read<DriverState>();
    final dados = _montar();
    await _fazer(() async {
      final c = await estado.cotarEntregaManual(dados);
      if (!mounted) return;
      if (c == null) {
        setState(() => _erro = 'O preço desta entrega não está disponível agora para o seu veículo. Fale com a Central.');
        return;
      }
      setState(() {
        _dados = dados;
        _cotacao = c;
        _precoMudou = false;
        _talvezCriada = false;
        _chave = novaChaveDeEntrega();
        _etapa = _Etapa.conferir;
      });
    });
  }

  Future<void> _lancar() async {
    final estado = context.read<DriverState>();
    final dados = _dados!;
    final cotacao = _cotacao!;
    final navegador = Navigator.of(context);
    final aviso = ScaffoldMessenger.of(context);
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    try {
      await estado.lancarEntregaManual(dados, chave: _chave, cotacao: cotacao);
      aviso.showSnackBar(const SnackBar(content: Text('Entrega lançada. Siga para a coleta no estabelecimento.')));
      navegador.pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isNetworkError) {
        // Pode ter sido criada: repetir com a MESMA chave nao duplica.
        setState(() {
          _talvezCriada = true;
          _erro = 'Sem conexão. A entrega pode já ter sido lançada: toque em "Tentar de novo" (não duplica) ou confira a tela inicial.';
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

  /// O preco oficial mudou desde a consulta: consulta de novo, mostra o valor novo e pede nova confirmacao (chave nova).
  Future<void> _novoPreco(String mensagem) async {
    final estado = context.read<DriverState>();
    try {
      final c = await estado.cotarEntregaManual(_dados!);
      if (!mounted) return;
      setState(() {
        _cotacao = c ?? _cotacao;
        _chave = novaChaveDeEntrega();
        _precoMudou = true;
        _talvezCriada = false;
        _erro = c == null ? mensagem : '$mensagem Confira o valor novo e confirme de novo.';
      });
    } catch (e) {
      if (mounted) setState(() => _erro = _mensagem(e));
    }
  }

  // ---------------------------------------------------------------- tela

  void _voltar() {
    if (_etapa == _Etapa.buscar) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _erro = null;
      _etapa = switch (_etapa) {
        _Etapa.conferir => _Etapa.dados,
        _Etapa.dados => _Etapa.perfil,
        _ => _Etapa.buscar,
      };
    });
  }

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
          title: const Text('Lançar entrega manualmente'),
          leading: BackButton(onPressed: _ocupado ? null : _voltar),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(Spacing.lg),
            children: [
              ...switch (_etapa) {
                _Etapa.buscar => _telaBuscar(),
                _Etapa.perfil => _telaPerfil(),
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
    );
  }

  List<Widget> _telaBuscar() {
    final r = _resultado;
    return [
      Text(
        'Estabelecimento do Comércio que ligou ou chamou você. A entrega entra no sistema oficial: '
        'preço do servidor, acompanhamento e histórico, igual aos pedidos feitos pelo aplicativo dele.',
        style: AppText.body.copyWith(color: AppColors.textMuted),
      ),
      const SizedBox(height: Spacing.lg),
      TextField(
        controller: _busca,
        enabled: !_ocupado,
        textInputAction: TextInputAction.search,
        onSubmitted: (_) => _procurar(),
        decoration: const InputDecoration(
          labelText: 'Telefone, e-mail ou nome do estabelecimento',
          prefixIcon: Icon(Icons.storefront),
        ),
      ),
      const SizedBox(height: Spacing.md),
      AppButton(label: 'Procurar estabelecimento', loading: _ocupado && _etapa == _Etapa.buscar, onPressed: _procurar),
      if (r != null) ...[
        const SizedBox(height: Spacing.lg),
        if (!r.liberado)
          _Aviso(
            icone: Icons.lock_outline,
            texto: 'O Comércio ainda não está liberado pela Central. Não dá para lançar entregas agora.',
            cor: AppColors.warning,
          ),
        if (r.itens.isEmpty)
          Text(
            'Nenhum estabelecimento da sua cidade com esses dados. Confira o telefone, o e-mail ou o nome. '
            'Se ele ainda não tem cadastro no Comércio, ele precisa se cadastrar pelo aplicativo.',
            style: AppText.body.copyWith(color: AppColors.textMuted),
          )
        else ...[
          Text(
            r.itens.length == 1 ? 'Achei 1 estabelecimento. Toque para conferir:' : 'Achei ${r.itens.length}. Toque no certo:',
            style: AppText.bodyStrong,
          ),
          const SizedBox(height: Spacing.sm),
          for (final e in r.itens) _CartaoAchado(achado: e, aoTocar: _ocupado ? null : () => _abrirPerfil(e)),
        ],
      ],
    ];
  }

  List<Widget> _telaPerfil() {
    final p = _perfil!;
    final r = _resultado;
    final liberado = r?.liberado ?? true;
    return [
      Text('Confira se é este estabelecimento', style: AppText.heading),
      const SizedBox(height: Spacing.md),
      AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.storefront, color: corDoComercio),
              const SizedBox(width: Spacing.sm),
              Expanded(child: Text(p.nome, style: AppText.title)),
            ]),
            const SizedBox(height: Spacing.sm),
            if (p.razaoSocial.isNotEmpty) _Linha('Razão social', p.razaoSocial),
            if (p.cnpj.isNotEmpty) _Linha('CNPJ', p.cnpj),
            _Linha('Telefone', telefoneBonito(p.telefone)),
            _Linha('Endereço de retirada', p.enderecoDeRetirada),
            _Linha('Cadastro', p.situacaoRotulo),
            _Linha('Entregas concluídas', '${p.entregasConcluidas}'),
          ],
        ),
      ),
      const SizedBox(height: Spacing.md),
      Text('Últimas entregas', style: AppText.bodyStrong),
      const SizedBox(height: Spacing.xs),
      if (p.historico.isEmpty)
        Text('Ainda não há entregas deste estabelecimento.', style: AppText.body.copyWith(color: AppColors.textMuted))
      else
        for (final h in p.historico)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Text(
              '${h.codigo} · ${h.situacao}${h.bairro.isEmpty ? '' : ' · ${h.bairro}'} · ${h.origemRotulo}',
              style: AppText.body.copyWith(color: AppColors.textMuted),
            ),
          ),
      const SizedBox(height: Spacing.lg),
      if (!p.podeLancar)
        _Aviso(icone: Icons.block, texto: p.motivo ?? 'Este estabelecimento não pode receber entregas agora.', cor: AppColors.danger)
      else if (!liberado)
        _Aviso(icone: Icons.lock_outline, texto: 'O Comércio ainda não está liberado pela Central.', cor: AppColors.warning)
      else
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
    final p = _perfil!;
    return [
      Row(children: [
        const Icon(Icons.storefront, color: corDoComercio, size: 20),
        const SizedBox(width: Spacing.sm),
        Expanded(child: Text(p.nome, style: AppText.bodyStrong)),
      ]),
      const SizedBox(height: Spacing.xs),
      Text('Retirada em: ${p.enderecoDeRetirada}', style: AppText.body.copyWith(color: AppColors.textMuted)),
      const SizedBox(height: Spacing.lg),
      Text('Encomenda', style: AppText.heading),
      const SizedBox(height: Spacing.sm),
      TextField(
        controller: _descricao,
        enabled: !_ocupado,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(labelText: 'O que vai levar (ex.: 2 pizzas grandes)', prefixIcon: Icon(Icons.inventory_2_outlined)),
      ),
      const SizedBox(height: Spacing.sm),
      TextField(
        controller: _observacoes,
        enabled: !_ocupado,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(labelText: 'Observações (opcional)'),
      ),
      const SizedBox(height: Spacing.lg),
      Text('Quem recebe', style: AppText.heading),
      const SizedBox(height: Spacing.sm),
      TextField(
        controller: _nomeQuemRecebe,
        enabled: !_ocupado,
        textCapitalization: TextCapitalization.words,
        decoration: const InputDecoration(labelText: 'Nome de quem recebe', prefixIcon: Icon(Icons.person)),
      ),
      const SizedBox(height: Spacing.sm),
      TextField(
        controller: _telefoneQuemRecebe,
        enabled: !_ocupado,
        keyboardType: TextInputType.phone,
        decoration: const InputDecoration(labelText: 'Telefone de quem recebe (com DDD)', prefixIcon: Icon(Icons.phone)),
      ),
      const SizedBox(height: Spacing.lg),
      Text('Endereço da entrega', style: AppText.heading),
      const SizedBox(height: Spacing.sm),
      TextField(
        controller: _rua,
        enabled: !_ocupado,
        textCapitalization: TextCapitalization.words,
        decoration: const InputDecoration(labelText: 'Rua / avenida'),
      ),
      const SizedBox(height: Spacing.sm),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          flex: 2,
          child: TextField(controller: _numero, enabled: !_ocupado, decoration: const InputDecoration(labelText: 'Número')),
        ),
        const SizedBox(width: Spacing.sm),
        Expanded(
          flex: 3,
          child: TextField(controller: _complemento, enabled: !_ocupado, decoration: const InputDecoration(labelText: 'Complemento (opcional)')),
        ),
      ]),
      const SizedBox(height: Spacing.sm),
      TextField(
        controller: _bairro,
        enabled: !_ocupado,
        textCapitalization: TextCapitalization.words,
        decoration: const InputDecoration(labelText: 'Bairro'),
      ),
      const SizedBox(height: Spacing.sm),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          flex: 3,
          child: TextField(
            controller: _cidade,
            enabled: !_ocupado,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Cidade'),
          ),
        ),
        const SizedBox(width: Spacing.sm),
        Expanded(
          flex: 1,
          child: TextField(
            controller: _uf,
            enabled: !_ocupado,
            maxLength: 2,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(labelText: 'UF', counterText: ''),
          ),
        ),
      ]),
      const SizedBox(height: Spacing.sm),
      TextField(
        controller: _cep,
        enabled: !_ocupado,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(labelText: 'CEP'),
      ),
      const SizedBox(height: Spacing.sm),
      TextField(
        controller: _referencia,
        enabled: !_ocupado,
        decoration: const InputDecoration(labelText: 'Ponto de referência (opcional)'),
      ),
      const SizedBox(height: Spacing.md),
      if (_latitude != null)
        _Aviso(icone: Icons.check_circle_outline, texto: 'Endereço confirmado no mapa.', cor: AppColors.success)
      else
        OutlinedButton.icon(
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
    final p = _perfil!;
    final c = _cotacao!;
    final d = _dados!;
    return [
      Text('Confira antes de lançar', style: AppText.heading),
      const SizedBox(height: Spacing.md),
      AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Linha('Estabelecimento', p.nome),
            _Linha('Retirada', c.coleta.isEmpty ? p.enderecoDeRetirada : c.coleta),
            _Linha('Entrega em', d.destino.porExtenso),
            _Linha('Encomenda', d.descricao.trim()),
            _Linha('Quem recebe', '${d.destinatarioNome.trim()} · ${telefoneBonito(d.destinatarioTelefone)}'),
            _Linha('Veículo', c.moto ? 'Moto (o seu)' : 'Carro (o seu)'),
            if (c.distanciaMetros > 0) _Linha('Distância', '${(c.distanciaMetros / 1000).toStringAsFixed(1).replaceAll('.', ',')} km'),
          ],
        ),
      ),
      const SizedBox(height: Spacing.md),
      Container(
        key: const Key('preco-oficial'),
        padding: const EdgeInsets.all(Spacing.lg),
        decoration: BoxDecoration(
          color: _precoMudou ? AppColors.warningSoft : AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(Radii.lg),
          border: Border.all(color: _precoMudou ? AppColors.warning : corDoComercio),
        ),
        child: Column(children: [
          Text(_precoMudou ? 'Valor atualizado' : 'Valor da entrega', style: AppText.body.copyWith(color: AppColors.textMuted)),
          const SizedBox(height: Spacing.xs),
          Text(formatMoney(c.valorCents), style: AppText.display),
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

class _Linha extends StatelessWidget {
  const _Linha(this.rotulo, this.valor);

  final String rotulo;
  final String valor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(rotulo, style: AppText.body.copyWith(color: AppColors.textMuted, fontSize: 13)),
          Text(valor, style: AppText.bodyStrong),
        ],
      ),
    );
  }
}

class _Aviso extends StatelessWidget {
  const _Aviso({required this.icone, required this.texto, required this.cor});

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

class _CartaoAchado extends StatelessWidget {
  const _CartaoAchado({required this.achado, required this.aoTocar});

  final EstabelecimentoAchado achado;
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    final a = achado;
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
                  const Icon(Icons.storefront, color: corDoComercio, size: 20),
                  const SizedBox(width: Spacing.sm),
                  Expanded(child: Text(a.nome, style: AppText.bodyStrong)),
                  const Icon(Icons.chevron_right, color: AppColors.textFaint),
                ]),
                const SizedBox(height: 2),
                Text(a.endereco, style: AppText.body.copyWith(color: AppColors.textMuted)),
                if (a.telefoneFinal.isNotEmpty)
                  Text('Telefone terminado em ${a.telefoneFinal}', style: AppText.body.copyWith(color: AppColors.textMuted)),
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
