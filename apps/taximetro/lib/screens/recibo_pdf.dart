import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../core/formato.dart';
import '../models/registro_corrida.dart';
import '../state/taximetro_state.dart';
import '../widgets/ui.dart';

/// Gera o relatorio de corridas em PDF (equivalente ao exportarHistoricoPdf).
Future<File?> gerarPdfHistorico(TaximetroState s, List<RegistroCorrida> lista) async {
  final doc = pw.Document();
  final total = lista.fold<double>(0, (soma, item) => soma + item.valor);
  final km = lista.fold<double>(0, (soma, item) => soma + item.distanciaKm);

  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(28),
      build: (contexto) => [
        pw.Header(
          level: 0,
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text('Relatorio de corridas', style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold)),
              pw.SizedBox(height: 4),
              pw.Text('Taximetro - gerado em ${Formato.dataHistorico(DateTime.now())}',
                  style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey700)),
            ],
          ),
        ),
        pw.SizedBox(height: 8),
        pw.Container(
          padding: const pw.EdgeInsets.all(10),
          decoration: pw.BoxDecoration(color: PdfColors.grey100, borderRadius: pw.BorderRadius.circular(6)),
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              _linha('Motorista', s.config.motoristaNome.isEmpty ? '—' : s.config.motoristaNome),
              _linha('CNH', '${s.config.motoristaCnh} ${s.config.cnhCategoria}'.trim()),
              _linha('Veiculo', s.config.descricaoVeiculo.isEmpty ? '—' : s.config.descricaoVeiculo),
              _linha('Placa', s.config.veiculoPlaca.isEmpty ? '—' : s.config.veiculoPlaca),
            ],
          ),
        ),
        pw.SizedBox(height: 14),
        pw.TableHelper.fromTextArray(
          headers: const ['Data', 'Trajeto', 'Km', 'Tempo', 'Pagamento', 'Valor'],
          headerStyle: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: PdfColors.white),
          headerDecoration: const pw.BoxDecoration(color: PdfColors.blueGrey800),
          cellStyle: const pw.TextStyle(fontSize: 8),
          cellAlignment: pw.Alignment.centerLeft,
          data: lista
              .map((r) => [
                    Formato.dataHistorico(r.data),
                    r.trajeto.isEmpty ? '—' : r.trajeto,
                    Formato.km(r.distanciaKm),
                    Formato.tempo(r.tempoS),
                    r.formaPagamento.isEmpty ? '—' : r.formaPagamento,
                    'R\$ ${Formato.moeda(r.valor)}',
                  ])
              .toList(),
        ),
        pw.SizedBox(height: 14),
        pw.Container(
          alignment: pw.Alignment.centerRight,
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.end,
            children: [
              pw.Text('Corridas: ${lista.length}', style: const pw.TextStyle(fontSize: 11)),
              pw.Text('Distancia total: ${Formato.km(km)} km', style: const pw.TextStyle(fontSize: 11)),
              pw.SizedBox(height: 4),
              pw.Text('TOTAL: R\$ ${Formato.moeda(total)}',
                  style: pw.TextStyle(fontSize: 15, fontWeight: pw.FontWeight.bold)),
            ],
          ),
        ),
      ],
    ),
  );

  final dir = await getApplicationDocumentsDirectory();
  final arquivo = File('${dir.path}/taximetro-${DateTime.now().millisecondsSinceEpoch}.pdf');
  await arquivo.writeAsBytes(await doc.save());
  return arquivo;
}

pw.Widget _linha(String rotulo, String valor) => pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 1),
      child: pw.Row(
        children: [
          pw.SizedBox(width: 70, child: pw.Text(rotulo, style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700))),
          pw.Expanded(child: pw.Text(valor, style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold))),
        ],
      ),
    );

/// Tela de recibo exibida apos finalizar.
class ReciboScreen extends StatelessWidget {
  const ReciboScreen({super.key, required this.registro});

  final RegistroCorrida registro;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final s = context.read<TaximetroState>();

    return Scaffold(
      appBar: AppBar(title: const Text('Comprovante')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(vertical: 26),
                decoration: BoxDecoration(
                  color: t.colorScheme.surface,
                  border: Border.all(color: t.colorScheme.primary.withValues(alpha: 0.4)),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Column(
                  children: [
                    Text('TOTAL', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1.4, color: t.colorScheme.onSurface.withValues(alpha: 0.55))),
                    const SizedBox(height: 6),
                    Text(
                      'R\$ ${Formato.moeda(registro.valor)}',
                      style: TextStyle(fontSize: 44, fontWeight: FontWeight.w800, letterSpacing: -1.5, color: t.colorScheme.primary),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      Formato.dataHistorico(registro.data),
                      style: TextStyle(fontSize: 12, color: t.colorScheme.onSurface.withValues(alpha: 0.6)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Painel(
                titulo: 'DETALHES DA CONTA',
                child: Text(registro.detalhamento, style: const TextStyle(fontSize: 13, height: 1.5)),
              ),
              const SizedBox(height: 14),
              Painel(
                titulo: 'CORRIDA',
                child: Column(
                  children: [
                    _L(rotulo: 'Distancia', valor: '${Formato.km(registro.distanciaKm)} km'),
                    _L(rotulo: 'Tempo', valor: Formato.tempo(registro.tempoS)),
                    _L(rotulo: 'Tempo parado', valor: Formato.tempo(registro.tempoParadoS)),
                    if (registro.trajeto.isNotEmpty) _L(rotulo: 'Trajeto', valor: registro.trajeto),
                    if (registro.formaPagamento.isNotEmpty)
                      _L(rotulo: 'Pagamento', valor: rotuloPagamento[registro.formaPagamento] ?? registro.formaPagamento),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Painel(
                titulo: 'PRESTADOR',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.config.motoristaNome.isEmpty ? 'Motorista nao informado' : s.config.motoristaNome, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text('CNH ${s.config.motoristaCnh.isEmpty ? '—' : s.config.motoristaCnh} ${s.config.cnhCategoria}', style: TextStyle(fontSize: 12, color: t.colorScheme.onSurface.withValues(alpha: 0.7))),
                    Text(s.config.descricaoVeiculo.isEmpty ? 'Veiculo nao informado' : s.config.descricaoVeiculo, style: TextStyle(fontSize: 12, color: t.colorScheme.onSurface.withValues(alpha: 0.7))),
                    if (s.config.veiculoPlaca.isNotEmpty)
                      Text(s.config.veiculoPlaca, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 1)),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              BotaoApp(
                label: 'EXPORTAR PDF',
                icon: Icons.picture_as_pdf_outlined,
                cor: t.colorScheme.surfaceContainerHighest,
                corTexto: t.colorScheme.onSurface,
                onPressed: () => gerarPdfHistorico(s, [registro]),
              ),
              const SizedBox(height: 10),
              BotaoApp(label: 'CONCLUIR', icon: Icons.check, onPressed: () => Navigator.of(context).pop()),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class _L extends StatelessWidget {
  const _L({required this.rotulo, required this.valor});

  final String rotulo;
  final String valor;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 110, child: Text(rotulo, style: TextStyle(fontSize: 12, color: t.colorScheme.onSurface.withValues(alpha: 0.65)))),
          Expanded(child: Text(valor, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}
