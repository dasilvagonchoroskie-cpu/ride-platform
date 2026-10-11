import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' show LatLng;
import 'package:provider/provider.dart';

import '../core/alarme.dart';
import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import 'comuns.dart';
import 'painel_state.dart';

/// Painel "Ao vivo" (Evandro, 11/10/2026, no modelo da Central do Motocas):
/// quantos motoristas estao livres, a caminho, no embarque e em viagem; o
/// mapa com o nome de cada um na cor da situacao; a lista com o carro ou a
/// moto, a placa e os botoes de WhatsApp e ligar; e as corridas de hoje.
/// Atualiza sozinho a cada 5 segundos.

/// Cor de cada situacao (mapa, contadores e etiquetas).
Color corDaSituacao(String s) => switch (s) {
      'LIVRE' => AppColors.success,
      'A_CAMINHO' => AppColors.warning,
      'NO_EMBARQUE' => AppColors.brand,
      'EM_VIAGEM' => const Color(0xFF8E44AD),
      _ => const Color(0xFF8E8E93),
    };

String nomeDaSituacao(String s) => switch (s) {
      'LIVRE' => 'Livre',
      'A_CAMINHO' => 'A caminho',
      'NO_EMBARQUE' => 'No embarque',
      'EM_VIAGEM' => 'Em viagem',
      _ => 'Offline',
    };

/// Situacao da corrida em palavras e cor (lista de corridas de hoje).
(String, Color) situacaoDaCorrida(String status) => switch (status) {
      'SCHEDULED' => ('Agendada', AppColors.textMuted),
      'REQUESTED' || 'SEARCHING' => ('Procurando', AppColors.brand),
      'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' => ('A caminho', AppColors.warning),
      'DRIVER_WAITING' => ('No embarque', AppColors.brand),
      'IN_PROGRESS' => ('Em viagem', const Color(0xFF8E44AD)),
      'COMPLETED' => ('Concluída', AppColors.success),
      'EXPIRED' => ('Sem motorista', AppColors.textMuted),
      _ => status.startsWith('CANCELLED') ? ('Cancelada', AppColors.danger) : (status, AppColors.textMuted),
    };

class AoVivo extends StatefulWidget {
  const AoVivo({super.key, this.ativa = true, this.intervalo = const Duration(seconds: 5)});

  /// A aba esta na tela? Escondida (outra aba aberta), para de perguntar ao
  /// servidor e volta a atualizar quando a pessoa abre de novo.
  final bool ativa;

  /// De quanto em quanto tempo pergunta ao servidor.
  final Duration intervalo;

  @override
  State<AoVivo> createState() => _AoVivoState();
}

class _AoVivoState extends State<AoVivo> {
  PainelAoVivo? _dados;
  String? _erro;
  Timer? _timer;
  bool _carregando = false;

  final _mapa = MapController();
  bool _enquadrou = false;
  bool _mapaPronto = false;

  final _busca = TextEditingController();
  String _categoria = 'TODAS';
  String? _situacao;
  int _aba = 0;

  @override
  void initState() {
    super.initState();
    _carregar();
    if (widget.ativa) _ligar();
  }

  void _ligar() {
    _timer?.cancel();
    _timer = Timer.periodic(widget.intervalo, (_) => _carregar());
  }

  @override
  void didUpdateWidget(AoVivo antes) {
    super.didUpdateWidget(antes);
    if (widget.ativa == antes.ativa) return;
    if (widget.ativa) {
      _carregar();
      _ligar();
    } else {
      _timer?.cancel();
      _timer = null;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _busca.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    if (_carregando || !mounted) return;
    _carregando = true;
    try {
      final d = await context.read<PainelState>().api.aoVivo();
      if (!mounted) return;
      setState(() {
        _dados = d;
        _erro = null;
      });
      if (!_enquadrou) {
        _enquadrou = true;
        WidgetsBinding.instance.addPostFrameCallback((_) => _enquadrar());
      }
    } catch (e) {
      if (mounted) setState(() => _erro = mensagemDe(e));
    } finally {
      _carregando = false;
    }
  }

  List<MotoristaAoVivo> get _filtrados {
    final d = _dados;
    if (d == null) return const [];
    final q = _busca.text.trim().toLowerCase();
    return d.motoristas.where((m) {
      if (_situacao != null && m.situacao != _situacao) return false;
      if (_situacao == null && m.situacao == 'OFFLINE' && q.isEmpty) return false;
      if (_categoria == 'MOTO' && !m.moto) return false;
      if (_categoria == 'CARRO' && m.moto) return false;
      if (q.isNotEmpty &&
          !m.nome.toLowerCase().contains(q) &&
          !m.placa.toLowerCase().contains(q) &&
          !m.veiculo.toLowerCase().contains(q)) {
        return false;
      }
      return true;
    }).toList();
  }

  void _enquadrar() {
    if (!_mapaPronto) return;
    final pontos = [
      for (final m in _filtrados)
        if (m.posicao != null) LatLng(m.posicao!.latitude, m.posicao!.longitude),
    ];
    try {
      if (pontos.length >= 2) {
        _mapa.fitCamera(CameraFit.coordinates(coordinates: pontos, padding: const EdgeInsets.fromLTRB(60, 50, 60, 30), maxZoom: 16));
      } else if (pontos.length == 1) {
        _mapa.move(pontos.first, 15);
      }
    } catch (_) {}
  }

  void _verNoMapa(MotoristaAoVivo m) {
    final p = m.posicao;
    if (p == null || !_mapaPronto) {
      avisar(context, 'Sem posição de ${m.primeiroNome} agora.', erro: true);
      return;
    }
    _mapa.move(LatLng(p.latitude, p.longitude), 16);
  }

  void _escolherSituacao(String s) => setState(() {
        _situacao = _situacao == s ? null : s;
        _aba = 0;
      });

  @override
  Widget build(BuildContext context) {
    final d = _dados;
    if (d == null) {
      if (_erro != null) return Aviso(texto: 'Não foi possível carregar: $_erro', tentarDeNovo: _carregar);
      return const Center(child: CircularProgressIndicator());
    }
    final lista = _filtrados;
    final altura = MediaQuery.sizeOf(context).height;
    return RefreshIndicator(
      onRefresh: _carregar,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Spacing.md, Spacing.md, Spacing.md, Spacing.xl),
        children: [
          if (_erro != null)
            Padding(
              padding: const EdgeInsets.only(bottom: Spacing.sm),
              child: Text('Sem conexão agora: mostrando os últimos dados.', style: AppText.caption.copyWith(color: AppColors.danger)),
            ),
          // Contadores (toque filtra a lista e o mapa).
          Row(
            children: [
              _Contador(rotulo: 'Livres', valor: d.livres, situacao: 'LIVRE', icone: Icons.check_circle_outline, selecionado: _situacao == 'LIVRE', aoTocar: _escolherSituacao),
              const SizedBox(width: Spacing.sm),
              _Contador(rotulo: 'A caminho', valor: d.aCaminho, situacao: 'A_CAMINHO', icone: Icons.near_me_outlined, selecionado: _situacao == 'A_CAMINHO', aoTocar: _escolherSituacao),
            ],
          ),
          const SizedBox(height: Spacing.sm),
          Row(
            children: [
              _Contador(rotulo: 'No embarque', valor: d.noEmbarque, situacao: 'NO_EMBARQUE', icone: Icons.hail, selecionado: _situacao == 'NO_EMBARQUE', aoTocar: _escolherSituacao),
              const SizedBox(width: Spacing.sm),
              _Contador(rotulo: 'Em viagem', valor: d.emViagem, situacao: 'EM_VIAGEM', icone: Icons.route_outlined, selecionado: _situacao == 'EM_VIAGEM', aoTocar: _escolherSituacao),
            ],
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => _escolherSituacao('OFFLINE'),
              icon: Icon(_situacao == 'OFFLINE' ? Icons.check_box : Icons.check_box_outline_blank, size: 18),
              label: Text('Mostrar offline (${d.offline})'),
            ),
          ),
          // Busca e categoria.
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _busca,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    isDense: true,
                    hintText: 'Nome ou placa',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    filled: true,
                    fillColor: AppColors.surface,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.sm), borderSide: const BorderSide(color: AppColors.border)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.sm), borderSide: const BorderSide(color: AppColors.border)),
                  ),
                ),
              ),
              const SizedBox(width: Spacing.sm),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: Spacing.sm),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(Radii.sm),
                  border: Border.all(color: AppColors.border),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _categoria,
                    items: const [
                      DropdownMenuItem(value: 'TODAS', child: Text('Todas')),
                      DropdownMenuItem(value: 'CARRO', child: Text('Carro')),
                      DropdownMenuItem(value: 'MOTO', child: Text('Moto')),
                    ],
                    onChanged: (v) => setState(() => _categoria = v ?? 'TODAS'),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.sm),
          // Mapa com o nome de cada motorista na cor da situacao.
          ClipRRect(
            borderRadius: BorderRadius.circular(Radii.md),
            child: SizedBox(
              height: (altura * 0.42).clamp(260.0, 520.0),
              child: Stack(
                children: [
                  Positioned.fill(
                    child: FlutterMap(
                      mapController: _mapa,
                      options: MapOptions(
                        initialCenter: _centro(d),
                        initialZoom: 14,
                        onMapReady: () {
                          _mapaPronto = true;
                          _enquadrar();
                        },
                      ),
                      children: [
                        if (mostrarRuasNoMapa)
                          TileLayer(
                            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                            userAgentPackageName: 'com.rideplatform.central_app',
                            maxZoom: 19,
                          ),
                        MarkerLayer(
                          markers: [
                            for (final m in lista)
                              if (m.posicao != null)
                                Marker(
                                  point: LatLng(m.posicao!.latitude, m.posicao!.longitude),
                                  width: 120,
                                  height: 34,
                                  alignment: Alignment.topCenter,
                                  child: GestureDetector(
                                    onTap: () => _detalhes(m),
                                    child: _Etiqueta(motorista: m),
                                  ),
                                ),
                          ],
                        ),
                        if (mostrarRuasNoMapa)
                          const SimpleAttributionWidget(source: Text('OpenStreetMap')),
                      ],
                    ),
                  ),
                  Positioned(
                    right: Spacing.sm,
                    top: Spacing.sm,
                    child: FloatingActionButton.small(
                      heroTag: 'aovivo-enquadrar',
                      backgroundColor: AppColors.surface,
                      tooltip: 'Mostrar todos',
                      onPressed: _enquadrar,
                      child: const Icon(Icons.center_focus_strong, color: AppColors.text),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: Spacing.md),
          SegmentedButton<int>(
            showSelectedIcon: false,
            segments: [
              ButtonSegment(value: 0, label: Text('Motoristas (${lista.length})')),
              ButtonSegment(value: 1, label: Text('Corridas de hoje (${d.corridasHoje.length})')),
            ],
            selected: {_aba},
            onSelectionChanged: (s) => setState(() => _aba = s.first),
          ),
          const SizedBox(height: Spacing.sm),
          if (_aba == 0) ...[
            if (lista.isEmpty)
              Padding(
                padding: const EdgeInsets.all(Spacing.xl),
                child: Text(
                  _situacao == null ? 'Nenhum motorista online agora.' : 'Nenhum motorista ${nomeDaSituacao(_situacao!).toLowerCase()} agora.',
                  textAlign: TextAlign.center,
                  style: AppText.body.copyWith(color: AppColors.textMuted),
                ),
              ),
            for (final m in lista) _LinhaMotorista(motorista: m, aoTocar: () => _detalhes(m), verNoMapa: () => _verNoMapa(m)),
          ] else ...[
            if (d.corridasHoje.isEmpty)
              Padding(
                padding: const EdgeInsets.all(Spacing.xl),
                child: Text('Nenhuma corrida hoje ainda.', textAlign: TextAlign.center, style: AppText.body.copyWith(color: AppColors.textMuted)),
              ),
            for (final c in d.corridasHoje) _LinhaCorrida(corrida: c, aoTocar: () => _detalhesCorrida(c)),
          ],
        ],
      ),
    );
  }

  LatLng _centro(PainelAoVivo d) {
    for (final m in d.motoristas) {
      if (m.posicao != null) return LatLng(m.posicao!.latitude, m.posicao!.longitude);
    }
    final c = context.read<PainelState>().centro;
    return LatLng(c.latitude, c.longitude);
  }

  void _detalhes(MotoristaAoVivo m) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(child: Text(m.nome, style: AppText.heading)),
                  _EtiquetaSituacao(situacao: m.situacao),
                ],
              ),
              const SizedBox(height: Spacing.xs),
              Text(
                [
                  if (m.moto) 'Moto' else 'Carro',
                  if (m.veiculo.isNotEmpty) m.veiculo,
                  if (m.cor.isNotEmpty) m.cor,
                  if (m.placa.isNotEmpty) m.placa,
                ].join(' · '),
                style: AppText.body.copyWith(color: AppColors.textMuted),
              ),
              if (m.telefone != null) Text(telefoneBonito(m.telefone), style: AppText.body.copyWith(color: AppColors.textMuted)),
              if (m.corridaCodigo != null) ...[
                const SizedBox(height: Spacing.sm),
                Text('Corrida ${m.corridaCodigo}${m.corridaPassageiro == null ? '' : ' · ${m.corridaPassageiro}'}', style: AppText.bodyStrong),
              ],
              if (m.situacao == 'OFFLINE' && m.vistoEm != null)
                Text('Última posição: ${dataHora(m.vistoEm)}', style: AppText.caption.copyWith(color: AppColors.textMuted)),
              const SizedBox(height: Spacing.md),
              Row(
                children: [
                  if (m.telefone != null) ...[
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => Alarme.ligar(m.telefone!),
                        icon: const Icon(Icons.call),
                        label: const Text('Ligar'),
                      ),
                    ),
                    const SizedBox(width: Spacing.sm),
                    Expanded(
                      child: FilledButton.icon(
                        style: FilledButton.styleFrom(backgroundColor: AppColors.success),
                        onPressed: () => Alarme.whatsapp(m.telefone!),
                        icon: const Icon(Icons.chat),
                        label: const Text('WhatsApp'),
                      ),
                    ),
                  ],
                ],
              ),
              if (m.posicao != null)
                TextButton.icon(
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    _verNoMapa(m);
                  },
                  icon: const Icon(Icons.my_location),
                  label: const Text('Ver no mapa'),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _detalhesCorrida(CorridaDoDia c) {
    final (nome, cor) = situacaoDaCorrida(c.status);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(child: Text('Corrida ${c.codigo}', style: AppText.heading)),
                  _Pilula(texto: nome, cor: cor),
                ],
              ),
              const SizedBox(height: Spacing.sm),
              Linha('Pedida às', dataHora(c.pedidaEm)),
              Linha('Passageiro', c.passageiro),
              Linha('Motorista', c.motorista == null ? '—' : '${c.motorista}${c.placa == null || c.placa!.isEmpty ? '' : ' · ${c.placa}'}'),
              Linha('Embarque', c.embarque),
              Linha('Destino', c.destino),
              Linha(c.status == 'COMPLETED' ? 'Valor' : 'Valor estimado', reais(c.valorCents)),
              if (c.passageiroTelefone != null) ...[
                const SizedBox(height: Spacing.sm),
                Align(alignment: Alignment.centerLeft, child: BotoesContato(telefone: c.passageiroTelefone)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Contador extends StatelessWidget {
  const _Contador({
    required this.rotulo,
    required this.valor,
    required this.situacao,
    required this.icone,
    required this.selecionado,
    required this.aoTocar,
  });

  final String rotulo;
  final int valor;
  final String situacao;
  final IconData icone;
  final bool selecionado;
  final ValueChanged<String> aoTocar;

  @override
  Widget build(BuildContext context) {
    final cor = corDaSituacao(situacao);
    return Expanded(
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(Radii.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.md),
          onTap: () => aoTocar(situacao),
          child: Container(
            padding: const EdgeInsets.all(Spacing.md),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(Radii.md),
              border: Border.all(color: selecionado ? cor : AppColors.border, width: selecionado ? 2 : 1),
            ),
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(color: cor.withValues(alpha: 0.14), shape: BoxShape.circle),
                  child: Icon(icone, color: cor, size: 20),
                ),
                const SizedBox(width: Spacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(rotulo, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.caption.copyWith(color: AppColors.textMuted)),
                      Text('$valor', style: AppText.heading.copyWith(fontSize: 22, color: AppColors.text)),
                    ],
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

/// Etiqueta do mapa: icone do carro/moto e o primeiro nome, na cor da situacao.
class _Etiqueta extends StatelessWidget {
  const _Etiqueta({required this.motorista});

  final MotoristaAoVivo motorista;

  @override
  Widget build(BuildContext context) {
    final cor = corDaSituacao(motorista.situacao);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
          decoration: BoxDecoration(
            color: cor,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: Colors.white, width: 1.5),
            boxShadow: const [BoxShadow(color: Color(0x44000000), blurRadius: 4, offset: Offset(0, 1))],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(motorista.moto ? Icons.two_wheeler : Icons.local_taxi, color: Colors.white, size: 14),
              const SizedBox(width: 4),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 80),
                child: Text(
                  motorista.primeiroNome,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 11),
                ),
              ),
            ],
          ),
        ),
        CustomPaint(size: const Size(10, 6), painter: _Ponta(cor)),
      ],
    );
  }
}

class _Ponta extends CustomPainter {
  _Ponta(this.cor);

  final Color cor;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width / 2, size.height)
      ..close();
    canvas.drawPath(p, Paint()..color = cor);
  }

  @override
  bool shouldRepaint(_Ponta old) => old.cor != cor;
}

class _Pilula extends StatelessWidget {
  const _Pilula({required this.texto, required this.cor});

  final String texto;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Spacing.sm, vertical: 3),
      decoration: BoxDecoration(color: cor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(Radii.pill)),
      child: Text(texto, style: AppText.label.copyWith(color: cor, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0)),
    );
  }
}

class _EtiquetaSituacao extends StatelessWidget {
  const _EtiquetaSituacao({required this.situacao});

  final String situacao;

  @override
  Widget build(BuildContext context) => _Pilula(texto: nomeDaSituacao(situacao), cor: corDaSituacao(situacao));
}

class _LinhaMotorista extends StatelessWidget {
  const _LinhaMotorista({required this.motorista, required this.aoTocar, required this.verNoMapa});

  final MotoristaAoVivo motorista;
  final VoidCallback aoTocar;
  final VoidCallback verNoMapa;

  @override
  Widget build(BuildContext context) {
    final m = motorista;
    final carro = [
      if (m.moto) 'Moto' else 'Carro',
      if (m.veiculo.isNotEmpty) m.veiculo,
      if (m.placa.isNotEmpty) m.placa,
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.xs),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(Radii.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.md),
          onTap: aoTocar,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(Spacing.md, Spacing.sm, Spacing.xs, Spacing.sm),
            child: Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(color: corDaSituacao(m.situacao), shape: BoxShape.circle),
                ),
                const SizedBox(width: Spacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(m.nome, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.bodyStrong),
                      Text(carro, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.caption.copyWith(color: AppColors.textMuted)),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          _EtiquetaSituacao(situacao: m.situacao),
                          if (m.corridaCodigo != null) ...[
                            const SizedBox(width: Spacing.xs),
                            Flexible(
                              child: Text(
                                m.corridaPassageiro == null ? m.corridaCodigo! : '${m.corridaCodigo} · ${m.corridaPassageiro}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppText.caption.copyWith(color: AppColors.textMuted),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                if (m.posicao != null)
                  IconButton(tooltip: 'Ver no mapa', icon: const Icon(Icons.my_location, color: AppColors.brand), onPressed: verNoMapa),
                if (m.telefone != null)
                  IconButton(
                    tooltip: 'WhatsApp',
                    icon: const Icon(Icons.chat, color: AppColors.success),
                    onPressed: () => Alarme.whatsapp(m.telefone!),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LinhaCorrida extends StatelessWidget {
  const _LinhaCorrida({required this.corrida, required this.aoTocar});

  final CorridaDoDia corrida;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final c = corrida;
    final (nome, cor) = situacaoDaCorrida(c.status);
    final hora = c.pedidaEm == null
        ? '--:--'
        : '${c.pedidaEm!.hour.toString().padLeft(2, '0')}:${c.pedidaEm!.minute.toString().padLeft(2, '0')}';
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.xs),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(Radii.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.md),
          onTap: aoTocar,
          child: Padding(
            padding: const EdgeInsets.all(Spacing.md),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 52,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(hora, style: AppText.bodyStrong),
                      Icon(c.moto ? Icons.two_wheeler : Icons.local_taxi, size: 16, color: AppColors.textMuted),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: Spacing.xs,
                        runSpacing: 2,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          _Pilula(texto: nome, cor: cor),
                          Text(c.codigo, style: AppText.caption.copyWith(color: AppColors.textMuted)),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(c.passageiro, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.bodyStrong),
                      Text(
                        c.motorista == null ? 'Sem motorista' : 'Motorista: ${c.motorista}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.caption.copyWith(color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: Spacing.sm),
                Text(reais(c.valorCents), style: AppText.bodyStrong),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
