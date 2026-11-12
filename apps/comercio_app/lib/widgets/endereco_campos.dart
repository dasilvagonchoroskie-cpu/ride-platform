import 'package:flutter/material.dart';

import '../core/formato.dart';
import '../core/tema.dart';
import '../dados/comercio_api.dart';
import '../dados/modelos.dart';
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

  EnderecoControle([Endereco? inicial]) {
    if (inicial != null) preencher(inicial);
    for (final c in [logradouro, numero, bairro, cidade, cep]) {
      c.addListener(_mudouTexto);
    }
  }

  bool get temLocalizacao => latitude != null && longitude != null;

  void _mudouTexto() {
    if (_preenchendo || !temLocalizacao) return;
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
    _preenchendo = false;
    notifyListeners();
  }

  /// Escolheu um resultado da busca: guarda a posicao e completa o que estiver vazio.
  void escolher(Lugar l) {
    _preenchendo = true;
    final partes = l.endereco.split(',').map((s) => s.trim()).toList();
    if (logradouro.text.trim().isEmpty && partes.isNotEmpty) logradouro.text = partes.first;
    if (numero.text.trim().isEmpty && partes.length > 1 && RegExp(r'^\d+\w?$').hasMatch(partes[1])) numero.text = partes[1];
    final det = l.detalhe.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    if (bairro.text.trim().isEmpty && det.length > 1) bairro.text = det.first;
    if (cidade.text.trim().isEmpty && det.isNotEmpty) cidade.text = det.length > 1 ? det[1] : det.first;
    latitude = l.latitude;
    longitude = l.longitude;
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
        const Faixa('Localização confirmada no mapa.', icone: Icons.check_circle_outline)
      else
        const Faixa('Falta confirmar a localização no mapa. Toque em "Buscar no mapa" e escolha o endereço certo.', tipo: TipoFaixa.atencao),
      const SizedBox(height: 10),
      OutlinedButton.icon(
        onPressed: _buscando ? null : _buscar,
        icon: _buscando ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.search),
        label: const Text('Buscar no mapa'),
      ),
      if (_erro != null) ...[const SizedBox(height: 10), Faixa(_erro!, tipo: TipoFaixa.erro)],
      if (_achados != null && _achados!.isNotEmpty) ...[
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(color: Cores.cartao, borderRadius: BorderRadius.circular(12), border: Border.all(color: Cores.borda)),
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
