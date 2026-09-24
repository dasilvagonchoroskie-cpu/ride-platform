import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/pix.dart';
import '../state/taximetro_state.dart';
import '../widgets/ui.dart';
import 'motorista_screen.dart';

/// Configuracoes de tarifa (tela-config do original).
class ConfigScreen extends StatefulWidget {
  const ConfigScreen({super.key});

  @override
  State<ConfigScreen> createState() => _ConfigScreenState();
}

class _ConfigScreenState extends State<ConfigScreen> {
  late final TextEditingController _dia;
  late final TextEditingController _noite;
  late final TextEditingController _hIni;
  late final TextEditingController _hFim;
  late final TextEditingController _kmInc;
  late final TextEditingController _minInc;
  late final TextEditingController _taxaKm;
  late final TextEditingController _taxaEspera;
  late final TextEditingController _limiar;
  late final TextEditingController _chavePix;
  late final TextEditingController _nomePix;
  late final TextEditingController _cidadePix;
  String? _erro;
  String _tipoPix = 'aleatoria';
  String _navegador = 'waze';

  @override
  void initState() {
    super.initState();
    final c = context.read<TaximetroState>().config;
    String n(double v) => v.toString().replaceAll('.', ',');
    _dia = TextEditingController(text: n(c.bandeiradaDia));
    _noite = TextEditingController(text: n(c.bandeiradaNoite));
    _hIni = TextEditingController(text: c.horaInicioNoite.toString());
    _hFim = TextEditingController(text: c.horaFimNoite.toString());
    _kmInc = TextEditingController(text: n(c.kmIncluidoNaBandeirada));
    _minInc = TextEditingController(text: n(c.minutosIncluidoNaBandeirada));
    _taxaKm = TextEditingController(text: n(c.taxaKm));
    _taxaEspera = TextEditingController(text: n(c.taxaEspera));
    _limiar = TextEditingController(text: n(c.limiarVelocidadeKmh));
    _chavePix = TextEditingController(text: c.chavePix);
    _nomePix = TextEditingController(text: c.nomeRecebedorPix);
    _cidadePix = TextEditingController(text: c.cidadePix);
    _tipoPix = c.tipoChavePix;
    _navegador = c.navegador;
  }

  @override
  void dispose() {
    for (final c in [_dia, _noite, _hIni, _hFim, _kmInc, _minInc, _taxaKm, _taxaEspera, _limiar, _chavePix, _nomePix, _cidadePix]) {
      c.dispose();
    }
    super.dispose();
  }

  double _d(TextEditingController c) => double.tryParse(c.text.replaceAll(',', '.')) ?? 0;
  int _i(TextEditingController c) => int.tryParse(c.text.trim()) ?? 0;

  Future<void> _salvar() async {
    final s = context.read<TaximetroState>();
    final ini = _i(_hIni);
    final fim = _i(_hFim);
    if (ini < 0 || ini > 23 || fim < 0 || fim > 23) {
      setState(() => _erro = 'As horas devem estar entre 0 e 23.');
      return;
    }

    final chaveNormalizada = Pix.normalizar(_tipoPix, _chavePix.text);
    if (_chavePix.text.trim().isNotEmpty && chaveNormalizada.trim().isEmpty) {
      setState(() => _erro = 'Chave Pix invalida para o tipo escolhido.');
      return;
    }

    setState(() => _erro = null);
    final c = s.config
      ..bandeiradaDia = _d(_dia)
      ..bandeiradaNoite = _d(_noite)
      ..horaInicioNoite = ini
      ..horaFimNoite = fim
      ..kmIncluidoNaBandeirada = _d(_kmInc)
      ..minutosIncluidoNaBandeirada = _d(_minInc)
      ..taxaKm = _d(_taxaKm)
      ..taxaEspera = _d(_taxaEspera)
      ..limiarVelocidadeKmh = _d(_limiar)
      ..navegador = _navegador
      ..tipoChavePix = _tipoPix
      ..chavePix = chaveNormalizada
      ..nomeRecebedorPix = _nomePix.text.trim()
      ..cidadePix = _cidadePix.text.trim();
    c.bandeiradaDia = _d(_dia);

    await s.gravarConfig();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Configuracoes salvas.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Configuracoes'),
        actions: [
          IconButton(
            tooltip: 'Motorista e veiculo',
            icon: const Icon(Icons.badge_outlined),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const MotoristaScreen()),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Painel(
                titulo: 'BANDEIRADA',
                child: Column(
                  children: [
                    CampoApp(label: 'Bandeirada dia (R\$)', controller: _dia, keyboardType: const TextInputType.numberWithOptions(decimal: true), onChanged: (_) => setState(() {})),
                    const SizedBox(height: 12),
                    CampoApp(label: 'Bandeirada noite (R\$)', controller: _noite, keyboardType: const TextInputType.numberWithOptions(decimal: true), onChanged: (_) => setState(() {})),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: CampoApp(label: 'Inicio noite (h)', controller: _hIni, keyboardType: TextInputType.number, ajuda: '0-23', onChanged: (_) => setState(() {}))),
                        const SizedBox(width: 12),
                        Expanded(child: CampoApp(label: 'Fim noite (h)', controller: _hFim, keyboardType: TextInputType.number, ajuda: '0-23', onChanged: (_) => setState(() {}))),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(Icons.info_outline, size: 15, color: t.colorScheme.onSurface.withValues(alpha: 0.5)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Fora dessas horas vale a bandeirada do dia.',
                            style: TextStyle(fontSize: 12, color: t.colorScheme.onSurface.withValues(alpha: 0.6)),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Painel(
                titulo: 'FRANQUIA',
                child: Row(
                  children: [
                    Expanded(child: CampoApp(label: 'Km incl. na bandeirada', controller: _kmInc, keyboardType: const TextInputType.numberWithOptions(decimal: true), onChanged: (_) => setState(() {}))),
                    const SizedBox(width: 12),
                    Expanded(child: CampoApp(label: 'Minutos incl. parado', controller: _minInc, keyboardType: const TextInputType.numberWithOptions(decimal: true), onChanged: (_) => setState(() {}))),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Painel(
                titulo: 'TARIFAS',
                child: Column(
                  children: [
                    CampoApp(label: 'Taxa por km (R\$)', controller: _taxaKm, keyboardType: const TextInputType.numberWithOptions(decimal: true), onChanged: (_) => setState(() {})),
                    const SizedBox(height: 12),
                    CampoApp(label: 'Taxa de espera por minuto (R\$)', controller: _taxaEspera, keyboardType: const TextInputType.numberWithOptions(decimal: true), onChanged: (_) => setState(() {})),
                    const SizedBox(height: 12),
                    CampoApp(label: 'Limiar de velocidade (km/h)', controller: _limiar, keyboardType: const TextInputType.numberWithOptions(decimal: true), ajuda: 'Abaixo disso o tempo conta como parado', onChanged: (_) => setState(() {})),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Painel(
                titulo: 'NAVEGADOR',
                child: SeletorOpcoes<String>(
                  opcoes: const ['waze', 'maps'],
                  rotulo: (v) => v == 'waze' ? 'Waze' : 'Google Maps',
                  selecionado: _navegador,
                  onSelecionar: (v) => setState(() => _navegador = v),
                ),
              ),
              const SizedBox(height: 14),
              Painel(
                titulo: 'PIX',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('TIPO DE CHAVE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: t.colorScheme.onSurface.withValues(alpha: 0.6))),
                    const SizedBox(height: 8),
                    SeletorOpcoes<String>(
                      opcoes: const ['cpf', 'cnpj', 'telefone', 'email', 'aleatoria'],
                      rotulo: (v) => const {'cpf': 'CPF', 'cnpj': 'CNPJ', 'telefone': 'Telefone', 'email': 'E-mail', 'aleatoria': 'Aleatoria'}[v]!,
                      selecionado: _tipoPix,
                      onSelecionar: (v) => setState(() {
                        _tipoPix = v;
                        _chavePix.text = Pix.formatarDigitada(v, _chavePix.text);
                      }),
                    ),
                    const SizedBox(height: 12),
                    CampoApp(
                      label: 'Chave Pix',
                      controller: _chavePix,
                      onChanged: (v) {
                        final m = Pix.formatarDigitada(_tipoPix, v);
                        if (m != v) {
                          _chavePix.value = TextEditingValue(text: m, selection: TextSelection.collapsed(offset: m.length));
                        }
                        setState(() {});
                      },
                      ajuda: 'Chave normalizada: ${Pix.normalizar(_tipoPix, _chavePix.text)}',
                    ),
                    const SizedBox(height: 12),
                    CampoApp(label: 'Nome do recebedor', controller: _nomePix, onChanged: (_) => setState(() {})),
                    const SizedBox(height: 12),
                    CampoApp(label: 'Cidade do recebedor', controller: _cidadePix, onChanged: (_) => setState(() {})),
                  ],
                ),
              ),
              if (_erro != null) ...[
                const SizedBox(height: 12),
                Text(_erro!, style: TextStyle(fontSize: 13, color: t.colorScheme.error)),
              ],
              const SizedBox(height: 18),
              BotaoApp(label: 'SALVAR CONFIGURACOES', icon: Icons.save, onPressed: _salvar),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}
