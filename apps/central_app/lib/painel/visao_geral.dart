import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../core/utils/geo.dart';
import '../data/painel.dart';
import '../widgets/bussola.dart';
import 'comuns.dart';
import 'painel_state.dart';

LatLng _ll(Coords c) => LatLng(c.latitude, c.longitude);

/// Carro offline: cinza, parado na ultima posicao que o aparelho mandou.
const Color _cinzaOffline = Color(0xFF8E8E93);

/// " · visto há 5 min" (ou ha horas/dias).
String _vistoHa(DateTime? quando) {
  if (quando == null) return '';
  final d = DateTime.now().difference(quando);
  if (d.inMinutes < 1) return ' · visto agora';
  if (d.inMinutes < 60) return ' · visto há ${d.inMinutes} min';
  if (d.inHours < 24) return ' · visto há ${d.inHours} h';
  return ' · visto há ${d.inDays} dia(s)';
}

/// Visao Geral: o mapa da cidade em tela cheia, com os carros ao vivo,
/// as corridas procurando motorista e os alertas de SOS. Os numeros do
/// dia ficam pequenos em cima do mapa.
class VisaoGeral extends StatefulWidget {
  const VisaoGeral({super.key, required this.abrirDespacho});

  final VoidCallback abrirDespacho;

  @override
  State<VisaoGeral> createState() => _VisaoGeralState();
}

class _VisaoGeralState extends State<VisaoGeral> {
  final _mapa = MapController();
  late final ControleFlutterMap _controle = ControleFlutterMap(_mapa);
  bool _centralizou = false;

  void _enquadrar(PainelState p) {
    final pontos = <LatLng>[
      for (final m in p.motoristas)
        if (m.posicao != null) _ll(m.posicao!),
      for (final c in p.corridas) _ll(c.embarque),
      for (final a in p.alertas)
        if (a.posicao != null) _ll(a.posicao!),
    ];
    if (pontos.length >= 2) {
      _mapa.fitCamera(CameraFit.coordinates(coordinates: pontos, padding: const EdgeInsets.fromLTRB(40, 170, 40, 60), maxZoom: 16));
    } else {
      _mapa.move(_ll(pontos.isEmpty ? p.centro : Coords(pontos.first.latitude, pontos.first.longitude)), 14);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PainelState>();
    if (!_centralizou && p.atualizadoEm != null) {
      _centralizou = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _enquadrar(p);
      });
    }

    final marcadores = <Marker>[
      for (final c in p.corridas.where((c) => c.naFila && c.status != 'SCHEDULED'))
        Marker(
          point: _ll(c.embarque),
          width: 44,
          height: 44,
          child: GestureDetector(
            onTap: () => _mostrarCorrida(context, c),
            child: const _Pino(cor: AppColors.primary, icone: Icons.person_pin_circle),
          ),
        ),
      for (final m in p.motoristas)
        if (m.posicao != null)
          Marker(
            point: _ll(m.posicao!),
            width: 40,
            height: 40,
            child: GestureDetector(
              onTap: () => _mostrarMotorista(context, m, p),
              child: _Pino(
                cor: !m.online ? _cinzaOffline : (m.ocupado ? AppColors.warning : AppColors.success),
                icone: Icons.local_taxi,
              ),
            ),
          ),
      for (final a in p.alertas)
        if (a.posicao != null)
          Marker(
            point: _ll(a.posicao!),
            width: 52,
            height: 52,
            child: const _Pino(cor: AppColors.danger, icone: Icons.sos, grande: true),
          ),
    ];

    return Stack(
      children: [
        Positioned.fill(
          child: FlutterMap(
            mapController: _mapa,
            options: MapOptions(initialCenter: _ll(p.centro), initialZoom: 14),
            children: [
              if (mostrarRuasNoMapa)
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.rideplatform.central_app',
                  maxZoom: 19,
                ),
              MarkerLayer(markers: marcadores),
            ],
          ),
        ),
        // Indicadores do dia, pequenos, em cima do mapa.
        Positioned(
          top: Spacing.sm,
          left: Spacing.sm,
          right: Spacing.sm,
          child: Column(
            children: [
              Row(
                children: [
                  _Indicador(rotulo: 'Corridas ativas', valor: '${p.indicadores.ativas}', cor: AppColors.primary, onTap: widget.abrirDespacho),
                  const SizedBox(width: Spacing.xs),
                  _Indicador(rotulo: 'Concluídas hoje', valor: '${p.indicadores.concluidasHoje}', cor: AppColors.success),
                ],
              ),
              const SizedBox(height: Spacing.xs),
              Row(
                children: [
                  _Indicador(
                    rotulo: 'Online / ocupados',
                    valor: '${p.indicadores.online} / ${p.indicadores.ocupados}',
                    cor: AppColors.warning,
                  ),
                  const SizedBox(width: Spacing.xs),
                  // Ganho da Central (comissao + mensalidades), nao o total
                  // das corridas dos motoristas. Toque: o detalhe do dia.
                  _Indicador(
                    rotulo: 'Ganho da Central hoje',
                    valor: reais(p.indicadores.ganhoCentralHojeCents),
                    cor: AppColors.brandDark,
                    onTap: () => _mostrarGanhoDoDia(context, p.indicadores),
                  ),
                ],
              ),
              if (p.erro != null) ...[
                const SizedBox(height: Spacing.xs),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(Spacing.sm),
                  decoration: BoxDecoration(color: AppColors.danger, borderRadius: BorderRadius.circular(Radii.sm)),
                  child: Row(
                    children: [
                      const Icon(Icons.wifi_off, color: Colors.white, size: 18),
                      const SizedBox(width: Spacing.sm),
                      Expanded(child: Text(p.erro!, style: AppText.caption.copyWith(color: Colors.white))),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
        // Legenda e botao de enquadrar.
        Positioned(
          left: Spacing.sm,
          bottom: Spacing.sm,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: Spacing.sm, vertical: Spacing.xs),
            decoration: BoxDecoration(
              color: AppColors.surface.withValues(alpha: 0.94),
              borderRadius: BorderRadius.circular(Radii.md),
              boxShadow: AppColors.sombraFlutuante,
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Legenda(cor: AppColors.success, texto: 'Livre (online)'),
                _Legenda(cor: AppColors.warning, texto: 'Em corrida'),
                _Legenda(cor: _cinzaOffline, texto: 'Offline (última posição)'),
                _Legenda(cor: AppColors.primary, texto: 'Esperando motorista'),
                _Legenda(cor: AppColors.danger, texto: 'SOS'),
              ],
            ),
          ),
        ),
        // Bussola (como no Google Maps) e enquadrar todos os carros.
        Positioned(
          right: Spacing.sm,
          bottom: Spacing.sm,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              BotaoBussola(controle: _controle),
              const SizedBox(height: Spacing.sm),
              FloatingActionButton.small(
                heroTag: 'enquadrar',
                backgroundColor: AppColors.surface,
                tooltip: 'Mostrar todos os carros',
                onPressed: () => _enquadrar(p),
                child: const Icon(Icons.center_focus_strong, color: AppColors.text),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// O dia em numeros: quanto rodou no total e quanto ficou para a Central.
  void _mostrarGanhoDoDia(BuildContext context, Indicadores i) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Spacing.lg, 0, Spacing.lg, Spacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Hoje', style: AppText.heading.copyWith(fontSize: 20)),
              const SizedBox(height: Spacing.md),
              Container(
                padding: const EdgeInsets.all(Spacing.lg),
                decoration: BoxDecoration(gradient: AppColors.degradeMarca, borderRadius: BorderRadius.circular(Radii.md)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('GANHO DA CENTRAL', style: AppText.label.copyWith(color: AppColors.gold, fontSize: 11)),
                    const SizedBox(height: Spacing.xs),
                    Text(reais(i.ganhoCentralHojeCents), style: AppText.metric.copyWith(color: AppColors.onPrimary)),
                    Text(
                      'Comissão das corridas ${reais(i.comissaoHojeCents)}'
                      '${i.mensalidadesHojeCents > 0 ? ' + mensalidades ${reais(i.mensalidadesHojeCents)}' : ''}',
                      style: AppText.caption.copyWith(color: AppColors.onPrimary.withValues(alpha: 0.85)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Spacing.md),
              Linha('Total das corridas (${i.concluidasHoje})', reais(i.faturamentoHojeCents), destaque: true),
              Linha('Parte dos motoristas', reais(i.faturamentoHojeCents > i.comissaoHojeCents ? i.faturamentoHojeCents - i.comissaoHojeCents : 0)),
              Linha('Comissão da Central', reais(i.comissaoHojeCents)),
              if (i.mensalidadesHojeCents > 0) Linha('Mensalidades cobradas', reais(i.mensalidadesHojeCents)),
              const SizedBox(height: Spacing.sm),
              Text(
                'O ganho de cada motorista fica no cadastro dele e no relatório em PDF (aba Financeiro).',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _mostrarMotorista(BuildContext context, MotoristaOnline m, PainelState p) {
    final corrida = p.corridas.where((c) => c.motoristaId == m.id).firstOrNull;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (_) => SafeArea(
        child: SingleChildScrollView(
          child: Padding(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(m.nome, style: AppText.heading)),
                  BotoesContato(telefone: m.telefone),
                ],
              ),
              Linha('Situação', !m.online ? 'Offline${_vistoHa(m.vistoEm)}' : (m.ocupado ? 'Em corrida' : 'Livre'), destaque: true),
              Linha('Telefone', telefoneBonito(m.telefone)),
              Linha('Veículo', m.veiculo.isEmpty ? '-' : m.veiculo),
              Linha('Placa', m.placa.isEmpty ? '-' : m.placa),
              Linha('Categoria', m.categoria),
              Linha('Nota', m.nota.toStringAsFixed(1)),
              if (corrida != null) ...[
                const Divider(color: AppColors.border),
                Text('Corrida ${corrida.codigo} - ${corrida.fase}', style: AppText.bodyStrong),
                Linha('Passageiro', corrida.passageiro),
                Linha('Embarque', corrida.enderecoEmbarque),
                Linha('Destino', corrida.enderecoDestino),
              ],
            ],
          ),
        ),
        ),
      ),
    );
  }

  void _mostrarCorrida(BuildContext context, CorridaAtiva c) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          child: Padding(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Corrida ${c.codigo} - ${c.fase}', style: AppText.heading),
              const SizedBox(height: Spacing.sm),
              Row(
                children: [
                  Expanded(child: Linha('Passageiro', c.passageiro)),
                  BotoesContato(telefone: c.telefonePassageiro),
                ],
              ),
              Linha('Embarque', c.enderecoEmbarque),
              Linha('Destino', c.enderecoDestino),
              Linha('Valor', reais(c.valorCents)),
              const SizedBox(height: Spacing.md),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  icon: const Icon(Icons.support_agent),
                  label: const Text('Abrir no Despacho'),
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    widget.abrirDespacho();
                  },
                ),
              ),
            ],
          ),
        ),
        ),
      ),
    );
  }
}

class _Pino extends StatelessWidget {
  const _Pino({required this.cor, required this.icone, this.grande = false});

  final Color cor;
  final IconData icone;
  final bool grande;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: cor,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
        boxShadow: const [BoxShadow(color: Color(0x55000000), blurRadius: 6, offset: Offset(0, 2))],
      ),
      alignment: Alignment.center,
      child: Icon(icone, color: Colors.white, size: grande ? 28 : 20),
    );
  }
}

class _Indicador extends StatelessWidget {
  const _Indicador({required this.rotulo, required this.valor, required this.cor, this.onTap});

  final String rotulo;
  final String valor;
  final Color cor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(Spacing.sm, Spacing.sm, Spacing.md, Spacing.sm),
          decoration: BoxDecoration(
            color: AppColors.surface.withValues(alpha: 0.96),
            borderRadius: BorderRadius.circular(Radii.md),
            boxShadow: AppColors.sombraFlutuante,
          ),
          child: Row(
            children: [
              // Barrinha colorida na esquerda: a cor do numero (igual a legenda).
              Container(
                width: 4,
                height: 34,
                decoration: BoxDecoration(color: cor, borderRadius: BorderRadius.circular(2)),
              ),
              const SizedBox(width: Spacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(rotulo, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.caption.copyWith(color: AppColors.textMuted, fontWeight: FontWeight.w500)),
                    Text(valor, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.heading.copyWith(color: cor, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Legenda extends StatelessWidget {
  const _Legenda({required this.cor, required this.texto});

  final Color cor;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 10, height: 10, decoration: BoxDecoration(color: cor, shape: BoxShape.circle)),
          const SizedBox(width: Spacing.xs),
          Text(texto, style: AppText.caption),
        ],
      ),
    );
  }
}
