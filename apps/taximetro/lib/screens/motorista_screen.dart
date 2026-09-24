import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/taximetro_state.dart';
import '../widgets/ui.dart';

/// Dados do motorista e do veiculo (tela-motorista do original).
class MotoristaScreen extends StatefulWidget {
  const MotoristaScreen({super.key});

  @override
  State<MotoristaScreen> createState() => _MotoristaScreenState();
}

class _MotoristaScreenState extends State<MotoristaScreen> {
  late final Map<String, TextEditingController> _campos;

  @override
  void initState() {
    super.initState();
    final c = context.read<TaximetroState>().config;
    _campos = {
      'motoristaNome': TextEditingController(text: c.motoristaNome),
      'motoristaCnh': TextEditingController(text: c.motoristaCnh),
      'cnhCategoria': TextEditingController(text: c.cnhCategoria),
      'cnhValidade': TextEditingController(text: c.cnhValidade),
      'veiculoMarca': TextEditingController(text: c.veiculoMarca),
      'veiculoModelo': TextEditingController(text: c.veiculoModelo),
      'veiculoPlaca': TextEditingController(text: c.veiculoPlaca),
      'veiculoCor': TextEditingController(text: c.veiculoCor),
      'veiculoAno': TextEditingController(text: c.veiculoAno),
    };
  }

  @override
  void dispose() {
    for (final c in _campos.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _salvar() async {
    final s = context.read<TaximetroState>();
    final c = s.config;
    c.motoristaNome = _campos['motoristaNome']!.text.trim();
    c.motoristaCnh = _campos['motoristaCnh']!.text.trim();
    c.cnhCategoria = _campos['cnhCategoria']!.text.trim();
    c.cnhValidade = _campos['cnhValidade']!.text.trim();
    c.veiculoMarca = _campos['veiculoMarca']!.text.trim();
    c.veiculoModelo = _campos['veiculoModelo']!.text.trim();
    c.veiculoPlaca = _campos['veiculoPlaca']!.text.trim().toUpperCase();
    c.veiculoCor = _campos['veiculoCor']!.text.trim();
    c.veiculoAno = _campos['veiculoAno']!.text.trim();

    await s.gravarConfig();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Dados salvos. Aparecem no comprovante em PDF.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<TaximetroState>();
    final t = Theme.of(context);
    final aviso = s.avisoValidadeCnh();

    return Scaffold(
      appBar: AppBar(title: const Text('Motorista e veiculo')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Painel(
                titulo: 'MOTORISTA',
                child: Column(
                  children: [
                    CampoApp(label: 'Nome completo', controller: _campos['motoristaNome'], onChanged: (_) => setState(() {})),
                    const SizedBox(height: 12),
                    CampoApp(label: 'Numero da CNH', controller: _campos['motoristaCnh'], onChanged: (_) => setState(() {})),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: CampoApp(label: 'Categoria', hint: 'AB', controller: _campos['cnhCategoria'], onChanged: (_) => setState(() {}))),
                        const SizedBox(width: 12),
                        Expanded(
                          child: CampoApp(
                            label: 'Validade',
                            hint: '2030-12-31',
                            controller: _campos['cnhValidade'],
                            keyboardType: TextInputType.datetime,
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              if (aviso != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: (s.cnhVencida ? t.colorScheme.error : const Color(0xFFF59E0B)).withValues(alpha: 0.16),
                    border: Border.all(color: s.cnhVencida ? t.colorScheme.error : const Color(0xFFF59E0B)),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.warning_amber, size: 18, color: s.cnhVencida ? t.colorScheme.error : const Color(0xFFF59E0B)),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          aviso,
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: s.cnhVencida ? t.colorScheme.error : const Color(0xFFF59E0B)),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 14),
              Painel(
                titulo: 'VEICULO',
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(child: CampoApp(label: 'Marca', controller: _campos['veiculoMarca'], onChanged: (_) => setState(() {}))),
                        const SizedBox(width: 12),
                        Expanded(child: CampoApp(label: 'Modelo', controller: _campos['veiculoModelo'], onChanged: (_) => setState(() {}))),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: CampoApp(label: 'Placa', hint: 'ABC1D23', controller: _campos['veiculoPlaca'], maxLength: 8, onChanged: (_) => setState(() {}))),
                        const SizedBox(width: 12),
                        Expanded(child: CampoApp(label: 'Cor', controller: _campos['veiculoCor'], onChanged: (_) => setState(() {}))),
                      ],
                    ),
                    const SizedBox(height: 12),
                    CampoApp(label: 'Ano', controller: _campos['veiculoAno'], keyboardType: TextInputType.number, onChanged: (_) => setState(() {})),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Painel(
                titulo: 'PREVIA DO COMPROVANTE',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      s.config.motoristaNome.isEmpty ? 'Motorista nao informado' : s.config.motoristaNome,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'CNH ${s.config.motoristaCnh.isEmpty ? '—' : s.config.motoristaCnh} '
                      '${s.config.cnhCategoria.isEmpty ? '' : '(${s.config.cnhCategoria})'}',
                      style: TextStyle(fontSize: 13, color: t.colorScheme.onSurface.withValues(alpha: 0.7)),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      s.config.descricaoVeiculo.isEmpty ? 'Veiculo nao informado' : s.config.descricaoVeiculo,
                      style: TextStyle(fontSize: 13, color: t.colorScheme.onSurface.withValues(alpha: 0.7)),
                    ),
                    if (s.config.veiculoPlaca.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(s.config.veiculoPlaca, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 1)),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 18),
              BotaoApp(label: 'SALVAR DADOS', icon: Icons.save, onPressed: _salvar),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}
