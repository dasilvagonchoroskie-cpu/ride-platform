import 'package:flutter/material.dart';

import '../core/formato.dart';
import '../core/tema.dart';
import '../dados/comercio_api.dart';
import '../dados/modelos.dart';
import '../telas/escolher_no_mapa_tela.dart';
import 'comuns.dart';

/// Campos de um endereco + a posicao no mapa. A posicao vem da busca do
/// servidor; se a pessoa mexer no endereco depois, ela some e precisa ser
/// confirmada de novo (senao o motorista iria para o lugar errado).
class EnderecoControle extends ChangeNotifier {
  final logradouro = TextEditingController();
  final numero = TextEditingController();
  final complemento = TextEditingController();
  final bairro = TextEditingController();
  final cidade = TextEditingController();
  final uf = TextEditingController();
  final cep = TextEditingController();
  double? latitude;
  double? longitude;
  bool _preenchendo = false;

  /// A posicao veio do alfinete: ela manda mais que o texto (a pessoa pode
  /// completar numero e complemento sem perder o ponto marcado).
  bool _porAlfinete = false;

  EnderecoControle([Endereco? inicial]) {
    if (inicial != null) preencher(inicial);
    for (final c in [logradouro, numero, bairro, cidade, cep]) {
      c.addListener(_mudouTexto);
    }
  }

  bool get temLocalizacao => latitude != null && longitude != null;

  bool get porAlfinete => _porAlfinete && temLocalizacao;

  void _mudouTexto() {
    if (_preenchendo || !temLocalizacao || _porAlfinete) return;
    latitude = null;
    longitude = null;
    notifyListeners();
  }

  void preencher(Endereco e) {
    _preenchendo = true;
    logradouro.text = e.logradouro;
    numero.text = e.numero;
    complemento.text = e.complemento ?? '';
    bairro.text = e.bairro;
    cidade.text = e.cidade;
    uf.text = e.uf;
    cep.text = e.cep.isEmpty ? '' : Formato.cep(e.cep);
    latitude = e.latitude;
    longitude = e.longitude;
    _porAlfinete = false;
    _preenchendo = false;
    notifyListeners();
  }

  /// Separa "Goiatuba - GO" em cidade e sigla do estado (null = nao veio nesse formato).
  static ({String cidade, String uf})? cidadeEUf(String texto) {
    final m = RegExp(r'^(.+?)\s*[-–]\s*([A-Za-z]{2})$').firstMatch(texto.trim());
    if (m == null) return null;
    return (cidade: m.group(1)!.trim(), uf: m.group(2)!.toUpperCase());
  }

  /// Escolheu um resultado da busca (ou um ponto do alfinete): guarda a posicao
  /// e completa os campos. O que vem do mapa e a verdade do lugar: cidade e UF
  /// sempre sao trocados (cidade SO com o nome, UF no campo proprio); os demais
  /// campos so se estiverem vazios, ou sempre, quando [doAlfinete].
  void escolher(Lugar l, {bool doAlfinete = false}) {
    _preenchendo = true;
    bool livre(TextEditingController c) => doAlfinete || c.text.trim().isEmpty;
    final semRua = l.endereco.startsWith('Ponto no mapa');
    final partes = l.endereco.split(',').map((s) => s.trim()).toList();
    if (!semRua && partes.isNotEmpty && livre(logradouro)) logradouro.text = partes.first;
    if (partes.length > 1 && RegExp(r'^\d+\w?$').hasMatch(partes[1])) {
      if (livre(numero)) numero.text = partes[1];
    } else if (doAlfinete) {
      numero.clear(); // o alfinete nao sabe o numero: a pessoa digita
    }
    final det = l.detalhe.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    final cu = det.isEmpty ? null : cidadeEUf(det.last);
    if (cu != null) {
      cidade.text = cu.cidade;
      uf.text = cu.uf;
    } else if (det.isNotEmpty && cidade.text.trim().isEmpty) {
      cidade.text = det.last;
    }
    // O bairro e o item antes da "Cidade - UF" (nunca a rua).
    final antes = cu != null ? det.sublist(0, det.length - 1) : det;
    if (l.bairro.isNotEmpty) {
      // Veio do mapa em campo proprio: e a fonte mais certa.
      if (livre(bairro)) bairro.text = l.bairro;
    } else if (antes.isNotEmpty && livre(bairro) && antes.last != logradouro.text.trim()) {
      bairro.text = antes.last;
    } else if (doAlfinete) {
      bairro.clear(); // o ponto anterior era de outro lugar: nao deixa o bairro velho
    }
    if (l.cep.length == 8 && livre(cep)) {
      cep.text = Formato.cep(l.cep);
    } else if (doAlfinete && l.cep.isEmpty) {
      cep.clear();
    }
    latitude = l.latitude;
    longitude = l.longitude;
    _porAlfinete = doAlfinete;
    _preenchendo = false;
    notifyListeners();
  }

  Endereco ler() => Endereco(
        logradouro: logradouro.text,
        numero: numero.text,
        complemento: complemento.text,
        bairro: bairro.text,
        cidade: cidade.text,
        uf: uf.text,
        cep: cep.text,
        latitude: latitude,
        longitude: longitude,
      );

  /// Texto para a busca no mapa.
  String get consulta => [logradouro.text, numero.text, bairro.text, cidade.text].where((s) => s.trim().isNotEmpty).join(', ');

  @override
  void dispose() {
    for (final c in [logradouro, numero, complemento, bairro, cidade, uf, cep]) {
      c.dispose();
    }
    super.dispose();
  }
}

class EnderecoCampos extends StatefulWidget {
  const EnderecoCampos({super.key, required this.controle, required this.servidor, this.centro});

  final EnderecoControle controle;
  final ComercioApi servidor;

  /// Onde orientar a busca (ex.: a loja). null = centro padrao da regiao.
  final Endereco? centro;

  @override
  State<EnderecoCampos> createState() => _EnderecoCamposState();
}

class _EnderecoCamposState extends State<EnderecoCampos> {
  bool _buscando = false;
  List<Lugar>? _achados;
  String? _erro;

  @override
  void initState() {
    super.initState();
    widget.controle.addListener(_redesenhar);
  }

  @override
  void dispose() {
    widget.controle.removeListener(_redesenhar);
    super.dispose();
  }

  void _redesenhar() {
    if (mounted) setState(() {});
  }

  Future<void> _buscar() async {
    final c = widget.controle;
    final texto = c.consulta;
    if (texto.trim().length < 3) {
      setState(() => _erro = 'Preencha a rua (e o número) antes de buscar no mapa.');
      return;
    }
    setState(() {
      _buscando = true;
      _erro = null;
      _achados = null;
    });
    try {
      final r = await widget.servidor.buscarEndereco(texto, lat: widget.centro?.latitude, lng: widget.centro?.longitude);
      if (!mounted) return;
      setState(() {
        _achados = r;
        if (r.isEmpty) _erro = 'Nenhum endereço encontrado. Confira a rua, o número e a cidade.';
      });
    } catch (e) {
      if (mounted) setState(() => _erro = mensagemDe(e));
    } finally {
      if (mounted) setState(() => _buscando = false);
    }
  }

  /// Abre o mapa com o alfinete no meio; volta com o ponto escolhido.
  Future<void> _marcarNoMapa() async {
    final c = widget.controle;
    final lugar = await Navigator.of(context).push<Lugar>(MaterialPageRoute(
      builder: (_) => EscolherNoMapaTela(
        servidor: widget.servidor,
        inicioLat: c.temLocalizacao ? c.latitude : widget.centro?.latitude,
        inicioLng: c.temLocalizacao ? c.longitude : widget.centro?.longitude,
      ),
    ));
    if (lugar == null || !mounted) return;
    setState(() {
      _achados = null;
      _erro = null;
    });
    c.escolher(lugar, doAlfinete: true);
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controle;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      TextFormField(
        controller: c.logradouro,
        textCapitalization: TextCapitalization.words,
        decoration: const InputDecoration(labelText: 'Rua / avenida'),
        validator: (v) => Validar.obrigatorio(v, 'Rua', 3),
      ),
      const SizedBox(height: 12),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          flex: 2,
          child: TextFormField(controller: c.numero, decoration: const InputDecoration(labelText: 'Número'), validator: (v) => Validar.obrigatorio(v, 'Número')),
        ),
        const SizedBox(width: 12),
        Expanded(flex: 3, child: TextFormField(controller: c.complemento, decoration: const InputDecoration(labelText: 'Complemento (opcional)'))),
      ]),
      const SizedBox(height: 12),
      TextFormField(
        controller: c.bairro,
        textCapitalization: TextCapitalization.words,
        decoration: const InputDecoration(labelText: 'Bairro'),
        validator: (v) => Validar.obrigatorio(v, 'Bairro', 2),
      ),
      const SizedBox(height: 12),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          flex: 3,
          child: TextFormField(
            controller: c.cidade,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Cidade'),
            validator: (v) => Validar.obrigatorio(v, 'Cidade', 2),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          flex: 1,
          child: TextFormField(
            controller: c.uf,
            textCapitalization: TextCapitalization.characters,
            maxLength: 2,
            decoration: const InputDecoration(labelText: 'UF', counterText: ''),
            validator: Validar.campoUf,
          ),
        ),
      ]),
      const SizedBox(height: 12),
      TextFormField(
        controller: c.cep,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(labelText: 'CEP'),
        validator: Validar.campoCep,
      ),
      const SizedBox(height: 14),
      if (c.temLocalizacao)
        Faixa(c.porAlfinete ? 'Localização marcada no mapa com o alfinete.' : 'Localização confirmada no mapa.', icone: Icons.check_circle_outline)
      else
        const Faixa('Falta confirmar a localização no mapa. Toque em "Buscar no mapa" e escolha o endereço certo.', tipo: TipoFaixa.atencao),
      const SizedBox(height: 10),
      OutlinedButton.icon(
        onPressed: _buscando ? null : _buscar,
        icon: _buscando ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.search),
        label: const Text('Buscar no mapa'),
      ),
      const SizedBox(height: 10),
      OutlinedButton.icon(
        onPressed: _marcarNoMapa,
        icon: const Icon(Icons.location_pin),
        label: const Text('Marcar no mapa (alfinete)'),
      ),
      if (_erro != null) ...[const SizedBox(height: 10), Faixa(_erro!, tipo: TipoFaixa.erro)],
      if (_achados != null && _achados!.isNotEmpty) ...[
        const SizedBox(height: 10),
        Material(
          color: Cores.cartao,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: Cores.borda)),
          child: Column(children: [
            for (final l in _achados!)
              ListTile(
                dense: true,
                leading: const Icon(Icons.place_outlined, color: Cores.loja),
                title: Text(l.endereco),
                subtitle: Text(l.detalhe, style: const TextStyle(color: Cores.textoSuave)),
                onTap: () {
                  c.escolher(l);
                  setState(() => _achados = null);
                },
              ),
          ]),
        ),
      ],
    ]);
  }
}
