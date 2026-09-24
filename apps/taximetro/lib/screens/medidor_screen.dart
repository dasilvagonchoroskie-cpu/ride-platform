import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/formato.dart';
import '../models/aparencia.dart';
import '../state/taximetro_state.dart';
import '../widgets/ui.dart';
import 'aparencia_screen.dart';
import 'config_screen.dart';
import 'historico_screen.dart';
import 'pagamento_sheet.dart';
import 'recibo_pdf.dart';

/// Tela principal do medidor (tela-medidor do original).
class MedidorScreen extends StatelessWidget {
  const MedidorScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<TaximetroState>();
    final t = Theme.of(context);
    final escala = fontePorNome(s.aparencia.fonte).fator;
    final vencida = s.cnhVencida;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Taximetro'),
        actions: [
          if (s.emHorarioNoturno)
            const Padding(
              padding: EdgeInsets.only(right: 8),
              child: Center(child: Selo(texto: 'BANDEIRA 2')),
            ),
          IconButton(
            tooltip: 'Historico',
            icon: const Icon(Icons.history),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const HistoricoScreen()),
            ),
          ),
          IconButton(
            tooltip: 'Aparencia',
            icon: const Icon(Icons.palette_outlined),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const AparenciaScreen()),
            ),
          ),
          IconButton(
            tooltip: 'Configuracoes',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const ConfigScreen()),
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
              // ---- Aviso de GPS ----
              if (s.avisoGps != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: t.colorScheme.error.withValues(alpha: 0.16),
                    border: Border.all(color: t.colorScheme.error),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(s.avisoGps!, style: TextStyle(fontSize: 12, color: t.colorScheme.error)),
                ),

              // ---- Aviso de CNH ----
              if (s.avisoValidadeCnh() != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: (vencida ? t.colorScheme.error : const Color(0xFFF59E0B))
                        .withValues(alpha: 0.16),
                    border: Border.all(color: vencida ? t.colorScheme.error : const Color(0xFFF59E0B)),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    s.avisoValidadeCnh()!,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: vencida ? t.colorScheme.error : const Color(0xFFF59E0B),
                    ),
                  ),
                ),

              // ---- Status ----
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: t.colorScheme.surface,
                  border: Border.all(color: t.dividerColor),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Container(
                      height: 10,
                      width: 10,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: s.statusClasse == 'ativo'
                            ? t.colorScheme.primary
                            : s.statusClasse == 'espera'
                                ? const Color(0xFFF59E0B)
                                : s.statusClasse == 'erro'
                                    ? t.colorScheme.error
                                    : t.colorScheme.onSurface.withValues(alpha: 0.4),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(s.statusTexto, style: const TextStyle(fontSize: 13)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // ---- Valor total ----
              Container(
                padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
                decoration: BoxDecoration(
                  color: t.colorScheme.surface,
                  border: Border.all(color: t.colorScheme.primary.withValues(alpha: 0.4)),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Column(
                  children: [
                    Text(
                      'TOTAL',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.4,
                        color: t.colorScheme.onSurface.withValues(alpha: 0.55),
                      ),
                    ),
                    const SizedBox(height: 6),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        'R\$ ${Formato.moeda(s.estado.valorTotal)}',
                        style: TextStyle(
                          fontSize: 56 * escala,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -2,
                          color: t.colorScheme.primary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // ---- Distancia / tempo / velocidade ----
              Row(
                children: [
                  Expanded(
                    child: _Metrica(
                      rotulo: 'DISTANCIA',
                      valor: '${Formato.km(s.estado.distanciaTotalKm)} km',
                      escala: escala,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _Metrica(
                      rotulo: 'TEMPO',
                      valor: Formato.tempo(s.estado.tempoTotalS),
                      escala: escala,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _Metrica(
                      rotulo: 'KM/H',
                      valor: s.velocidadeAtualKmh == null
                          ? '—'
                          : s.velocidadeAtualKmh!.round().toString(),
                      escala: escala,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // ---- Detalhes da conta ----
              Painel(
                titulo: 'DETALHES',
                child: Column(
                  children: [
                    _Linha(rotulo: 'Bandeirada', valor: Formato.moedaComPrefixo(s.bandeiradaAtual)),
                    _Linha(
                      rotulo: 'Distancia cobrada',
                      valor: '${Formato.km(s.estado.kmIncluidoUsado)} km',
                    ),
                    _Linha(
                      rotulo: 'Tempo parado',
                      valor: Formato.tempo(s.estado.tempoParadoS),
                    ),
                    _Linha(rotulo: 'Valor da espera', valor: Formato.moedaComPrefixo(s.estado.valorEspera)),
                    if (!s.estado.jaAndou)
                      _Linha(
                        rotulo: 'Franquia',
                        valor: '${Formato.km(s.config.kmIncluidoNaBandeirada)} km / '
                            '${s.config.minutosIncluidoNaBandeirada.round()} min',
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // ---- Trajeto ----
              Painel(
                titulo: 'TRAJETO',
                child: Column(
                  children: [
                    CampoApp(
                      label: 'Origem',
                      hint: 'De onde saiu',
                      controller: TextEditingController(text: s.trajetoOrigem)
                        ..selection = TextSelection.collapsed(offset: s.trajetoOrigem.length),
                      onChanged: (v) => s.trajetoOrigem = v,
                    ),
                    const SizedBox(height: 10),
                    CampoApp(
                      label: 'Destino',
                      hint: 'Para onde foi',
                      controller: TextEditingController(text: s.trajetoDestino)
                        ..selection = TextSelection.collapsed(offset: s.trajetoDestino.length),
                      onChanged: (v) => s.trajetoDestino = v,
                    ),
                    const SizedBox(height: 10),
                    BotaoApp(
                      label: 'Abrir rota no ${s.config.navegador == 'maps' ? 'Google Maps' : 'Waze'}',
                      icon: Icons.navigation_outlined,
                      cor: t.colorScheme.surfaceContainerHighest,
                      corTexto: t.colorScheme.onSurface,
                      enabled: s.trajetoDestino.trim().isNotEmpty,
                      onPressed: () => _abrirNavegacao(context, s),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // ---- Acoes principais ----
              if (!s.corridaAtiva)
                BotaoApp(
                  label: 'INICIAR CORRIDA',
                  icon: Icons.play_arrow,
                  onPressed: () => s.iniciarCorrida(),
                )
              else ...[
                BotaoApp(
                  label: 'FINALIZAR CORRIDA',
                  icon: Icons.stop,
                  onPressed: () => _finalizar(context, s),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: BotaoApp(
                        label: 'Cancelar',
                        cor: t.colorScheme.surfaceContainerHighest,
                        corTexto: t.colorScheme.onSurface,
                        onPressed: () => s.cancelarCorrida(),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: BotaoApp(
                        label: 'Reiniciar',
                        cor: t.colorScheme.surfaceContainerHighest,
                        corTexto: t.colorScheme.onSurface,
                        onPressed: () => s.reiniciarCorrida(),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _finalizar(BuildContext context, TaximetroState s) async {
    final forma = await mostrarPagamento(context, s.estado.valorTotal);
    if (forma == null) return;

    final registro = await s.finalizarCorrida(formaPagamento: forma);
    if (!context.mounted) return;

    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => ReciboScreen(registro: registro)),
    );
  }

  Future<void> _abrirNavegacao(BuildContext context, TaximetroState s) async {
    final destino = Uri.encodeComponent(s.trajetoDestino);
    final origem = Uri.encodeComponent(s.trajetoOrigem);
    final uri = s.config.navegador == 'maps'
        ? Uri.parse('https://www.google.com/maps/dir/?api=1&origin=$origem&destination=$destino')
        : Uri.parse('https://waze.com/ul?q=$destino&navigate=yes');

    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}

class _Metrica extends StatelessWidget {
  const _Metrica({required this.rotulo, required this.valor, required this.escala});

  final String rotulo;
  final String valor;
  final double escala;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      decoration: BoxDecoration(
        color: t.colorScheme.surface,
        border: Border.all(color: t.dividerColor),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          Text(
            rotulo,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
              color: t.colorScheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              valor,
              style: TextStyle(
                fontSize: 20 * escala,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Linha extends StatelessWidget {
  const _Linha({required this.rotulo, required this.valor});

  final String rotulo;
  final String valor;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            rotulo,
            style: TextStyle(fontSize: 13, color: t.colorScheme.onSurface.withValues(alpha: 0.65)),
          ),
          Text(valor, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
