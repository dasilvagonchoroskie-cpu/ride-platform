import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../core/alarme.dart';
import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Aba Alertas e Seguranca: SOS abertos (ao vivo) e o historico.
class Alertas extends StatefulWidget {
  const Alertas({super.key});

  @override
  State<Alertas> createState() => _AlertasState();
}

class _AlertasState extends State<Alertas> {
  late Future<List<AlertaSos>> _resolvidos;

  @override
  void initState() {
    super.initState();
    _resolvidos = Provider.of<PainelState>(context, listen: false).api.alertas(resolvidos: true);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PainelState>();
    return ListView(
      padding: const EdgeInsets.all(Spacing.md),
      children: [
        Text('Abertos agora (${p.alertas.length})', style: AppText.heading),
        const SizedBox(height: Spacing.sm),
        if (p.alertas.isEmpty)
          Text('Nenhum SOS aberto.', style: AppText.body.copyWith(color: AppColors.textMuted)),
        for (final a in p.alertas)
          Card(
            color: AppColors.dangerSoft,
            child: ListTile(
              leading: const Icon(Icons.sos, color: AppColors.danger, size: 32),
              title: Text('${a.papelNome}: ${a.quem}', style: AppText.bodyStrong),
              subtitle: Text('Desde ${dataHora(a.criadoEm)}${a.corridaCodigo == null ? '' : ' · corrida ${a.corridaCodigo}'}', style: AppText.caption),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => abrirSos(context, a),
            ),
          ),
        const SizedBox(height: Spacing.lg),
        const Text('Encerrados', style: AppText.heading),
        FutureBuilder<List<AlertaSos>>(
          future: _resolvidos,
          builder: (context, s) {
            if (s.hasError) return Text('Não carregou: ${s.error}', style: AppText.caption);
            if (!s.hasData) return const Padding(padding: EdgeInsets.all(Spacing.lg), child: Center(child: CircularProgressIndicator()));
            if (s.data!.isEmpty) return Text('Nenhum alerta encerrado.', style: AppText.caption.copyWith(color: AppColors.textMuted));
            return Column(
              children: [
                for (final a in s.data!)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.check_circle_outline, color: AppColors.success),
                    title: Text('${a.papelNome}: ${a.quem} · ${dataHora(a.criadoEm)}', style: AppText.body),
                    subtitle: Text(a.nota ?? '', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

/// Janela fixa do SOS: posicao ao vivo, contatos e encerrar.
Future<void> abrirSos(BuildContext context, AlertaSos alerta) {
  return Navigator.of(context).push(MaterialPageRoute<void>(
    fullscreenDialog: true,
    builder: (_) => TelaSos(id: alerta.id),
  ));
}

class TelaSos extends StatefulWidget {
  const TelaSos({super.key, required this.id});

  final String id;

  @override
  State<TelaSos> createState() => _TelaSosState();
}

class _TelaSosState extends State<TelaSos> {
  final _mapa = MapController();
  LatLng? _ultima;

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PainelState>();
    final a = p.alertas.where((x) => x.id == widget.id).firstOrNull;
    if (a == null) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(title: const Text('SOS')),
        body: const Aviso(texto: 'Este alerta foi encerrado.', icone: Icons.check_circle_outline),
      );
    }
    final pos = a.posicao == null ? null : LatLng(a.posicao!.latitude, a.posicao!.longitude);
    if (pos != null && _ultima != null && pos != _ultima) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _mapa.move(pos, _mapa.camera.zoom);
      });
    }
    _ultima = pos;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.danger,
        title: Text('SOS - ${a.papelNome}'),
        actions: [
          TextButton.icon(
            onPressed: () => p.silenciar(a.id),
            icon: const Icon(Icons.volume_off, color: Colors.white),
            label: const Text('Silenciar', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
      body: ListView(
        children: [
          SizedBox(
            height: 260,
            child: pos == null
                ? const Aviso(texto: 'Sem posição do aparelho.')
                : FlutterMap(
                    mapController: _mapa,
                    options: MapOptions(initialCenter: pos, initialZoom: 16),
                    children: [
                      TileLayer(
                        urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'com.rideplatform.central_app',
                      ),
                      MarkerLayer(markers: [
                        Marker(
                          point: pos,
                          width: 48,
                          height: 48,
                          child: const Icon(Icons.sos, color: AppColors.danger, size: 44),
                        ),
                      ]),
                    ],
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(Spacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Posição atualizada às ${dataHora(a.atualizadoEm)}', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                if (pos != null)
                  TextButton.icon(
                    onPressed: () => Alarme.mapa(pos.latitude, pos.longitude),
                    icon: const Icon(Icons.map),
                    label: const Text('Abrir no aplicativo de mapas'),
                  ),
                Row(
                  children: [
                    Expanded(child: Linha('Quem pediu', '${a.quem}\n${telefoneBonito(a.telefone)}', destaque: true)),
                    BotoesContato(telefone: a.telefone),
                  ],
                ),
                if (a.corridaCodigo != null) ...[
                  const Divider(color: AppColors.border),
                  Text('Corrida ${a.corridaCodigo}', style: AppText.heading),
                  Linha('Embarque', a.embarque ?? '-'),
                  Linha('Destino', a.destino ?? '-'),
                  if (a.veiculo != null) Linha('Veículo', a.veiculo!),
                  Row(
                    children: [
                      Expanded(child: Linha('Passageiro', '${a.passageiro ?? '-'}\n${telefoneBonito(a.telefonePassageiro)}')),
                      BotoesContato(telefone: a.telefonePassageiro),
                    ],
                  ),
                  Row(
                    children: [
                      Expanded(child: Linha('Motorista', '${a.motorista ?? '-'}\n${telefoneBonito(a.telefoneMotorista)}')),
                      BotoesContato(telefone: a.telefoneMotorista),
                    ],
                  ),
                ],
                const Divider(color: AppColors.border),
                const Text('Contatos de emergência', style: AppText.heading),
                if (a.contatos.isEmpty)
                  Text('A pessoa não cadastrou contatos de emergência.', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                for (final c in a.contatos)
                  Row(
                    children: [
                      Expanded(child: Linha(c.nome, telefoneBonito(c.telefone))),
                      BotoesContato(telefone: c.telefone),
                    ],
                  ),
                const SizedBox(height: Spacing.md),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
                        onPressed: () => Alarme.ligar('190'),
                        icon: const Icon(Icons.local_police),
                        label: const Text('190 Polícia'),
                      ),
                    ),
                    const SizedBox(width: Spacing.sm),
                    Expanded(
                      child: FilledButton.icon(
                        style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
                        onPressed: () => Alarme.ligar('192'),
                        icon: const Icon(Icons.local_hospital),
                        label: const Text('192 SAMU'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: Spacing.lg),
                OutlinedButton(
                  onPressed: () async {
                    final nota = await pedirTexto(
                      context,
                      titulo: 'Encerrar alerta',
                      rotulo: 'O que foi feito',
                      confirmar: 'Encerrar',
                    );
                    if (nota == null || !context.mounted) return;
                    final ok = await tentar(context, () => p.encerrarAlerta(a.id, nota), sucesso: 'Alerta encerrado.');
                    if (ok && context.mounted) Navigator.of(context).pop();
                  },
                  child: const Text('Encerrar alerta'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
