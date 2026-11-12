import 'package:flutter/material.dart';

import '../core/tema.dart';
import '../dados/comercio_api.dart';
import '../dados/modelos.dart';
import 'comuns.dart';

/// Caixa de busca de um endereco no mapa (usada na coleta em outro endereco).
class BuscaDeLugar extends StatefulWidget {
  const BuscaDeLugar({super.key, required this.servidor, required this.aoEscolher, this.centro, this.escolhido});

  final ComercioApi servidor;
  final void Function(Lugar) aoEscolher;
  final Endereco? centro;
  final Lugar? escolhido;

  @override
  State<BuscaDeLugar> createState() => _BuscaDeLugarState();
}

class _BuscaDeLugarState extends State<BuscaDeLugar> {
  final _texto = TextEditingController();
  bool _buscando = false;
  List<Lugar>? _achados;
  String? _erro;

  @override
  void dispose() {
    _texto.dispose();
    super.dispose();
  }

  Future<void> _buscar() async {
    if (_texto.text.trim().length < 3) {
      setState(() => _erro = 'Digite a rua e o número (mínimo 3 letras).');
      return;
    }
    setState(() {
      _buscando = true;
      _erro = null;
      _achados = null;
    });
    try {
      final r = await widget.servidor.buscarEndereco(_texto.text, lat: widget.centro?.latitude, lng: widget.centro?.longitude);
      if (!mounted) return;
      setState(() {
        _achados = r;
        if (r.isEmpty) _erro = 'Nenhum endereço encontrado.';
      });
    } catch (e) {
      if (mounted) setState(() => _erro = mensagemDe(e));
    } finally {
      if (mounted) setState(() => _buscando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (widget.escolhido != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Faixa('Coleta em: ${widget.escolhido!.endereco} — ${widget.escolhido!.detalhe}', icone: Icons.check_circle_outline),
        ),
      TextField(
        controller: _texto,
        textInputAction: TextInputAction.search,
        onSubmitted: (_) => _buscar(),
        decoration: InputDecoration(
          labelText: 'Buscar endereço de coleta',
          suffixIcon: IconButton(icon: _buscando ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.search), onPressed: _buscando ? null : _buscar),
        ),
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
                  widget.aoEscolher(l);
                  setState(() => _achados = null);
                },
              ),
          ]),
        ),
      ],
    ]);
  }
}
