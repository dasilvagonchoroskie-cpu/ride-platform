import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/geo.dart';
import '../data/models/models.dart';
import '../state/app_state.dart';
import '../state/auth_state.dart';
import '../state/ride_state.dart';
import '../widgets/painel_ui.dart';
import '../widgets/ride_map.dart';
import '../widgets/ui.dart';
import '../state/config_state.dart';
import 'avisos_screen.dart';
import 'cupons_screen.dart';
import '../core/avisos.dart';
import 'agendadas_screen.dart';
import 'confirm_screen.dart';
import 'map_pick_screen.dart';

/// Tela Inicio: mapa em tela cheia, carros disponiveis por perto (de
/// verdade, do servidor), sino de avisos e o "Buscar destino" embaixo.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Timer? _relogio;
  int _recentrar = 0;

  Future<void> _minhaLocalizacao() async {
    final app = context.read<AppState>();
    await app.atualizarLocalizacao();
    if (!mounted) return;
    if (!app.locationGranted) {
      avisar('Ative a localização do celular para o mapa mostrar onde você está.');
    }
    setState(() => _recentrar++);
    _atualizarCarros();
  }
  bool _configPedida = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _atualizarCarros();
      if (mounted) context.read<RideState>().carregarAgendadas();
    });
    _relogio = Timer.periodic(const Duration(seconds: 30), (_) {
      _atualizarCarros();
      // Perto do horario de uma agendada, a corrida abre sozinha.
      if (mounted) context.read<RideState>().conferirAgendadas();
    });
  }

  /// Calendario ao lado de "Buscar destino" (modelo Du Goias): escolhe o
  /// dia e a hora e ja abre a busca do destino.
  Future<void> _agendar() async {
    final quando = await escolherHorarioAgendado(context);
    if (quando == null || !mounted) return;
    context.read<RideState>().escolherHorario(quando);
    await _escolherDestino();
  }

  @override
  void dispose() {
    _relogio?.cancel();
    super.dispose();
  }

  void _atualizarCarros() {
    if (!mounted) return;
    context.read<RideState>().refreshNearby(context.read<AppState>().coords);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Avisos novos da Central aparecem no sino sem precisar reabrir o app.
    if (!_configPedida) {
      _configPedida = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.read<ConfigState>().carregar();
      });
    }
  }

  Future<void> _escolherDestino() async {
    final alvo = await showModalBottomSheet<PlaceSuggestion>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: const Color(0x66000000),
      builder: (_) => const _DestinationSheet(),
    );
    if (alvo == null || !mounted) return;
    await _irPara(alvo);
  }

  Future<void> _irPara(PlaceSuggestion alvo) async {
    final app = context.read<AppState>();
    final ride = context.read<RideState>();

    await app.addDestinoRecente(alvo);
    await app.addRecentPlace(alvo.fullAddress);
    await ride.estimate(app.coords, alvo.coords, dropoffAddress: alvo.fullAddress);

    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ConfirmScreen(destination: alvo.coords, address: alvo.fullAddress),
      ),
    );
  }

  void _abrir(Widget tela) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => tela));

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final auth = context.watch<AuthState>();
    final ride = context.watch<RideState>();
    final config = context.watch<ConfigState>();
    final nome = auth.user?.firstName;
    final agendarPara = ride.agendarPara;

    final markers = <MapMarker>[
      MapMarker(id: 'me', coords: app.coords, kind: MarkerKind.pickup),
      for (final driver in ride.nearbyDrivers)
        MapMarker(id: driver.id, coords: driver.position, kind: MarkerKind.car),
    ];

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: RideMap(center: app.coords, markers: markers, span: 0.03, rounded: false, recentrar: _recentrar, bussola: true),
          ),

          // ---- Topo: marca a esquerda, sino a direita ----
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, 0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    // heightFactor 1: sem ele o Align ocupava a tela toda e a
                    // pilula "Fortaleza Mov" ia parar no meio do mapa (05/10).
                    child: Align(
                      alignment: Alignment.centerLeft,
                      heightFactor: 1,
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Material(
                    color: AppColors.brand,
                    elevation: 3,
                    shadowColor: const Color(0x55000000),
                    borderRadius: BorderRadius.circular(Radii.pill),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
                      child: Text(
                        'Fortaleza Mov',
                        style: AppText.heading.copyWith(color: Colors.white, fontSize: 21, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                      ),
                    ),
                  ),
                  const SizedBox(width: Spacing.sm),
                  if (app.isDemo) ...[
                    const AppBadge(text: 'DEMONSTRAÇÃO', tone: AppBadgeTone.info),
                    const SizedBox(width: Spacing.sm),
                  ],
                  BotaoRedondo(
                    icone: Icons.confirmation_number,
                    onTap: () => _abrir(const CuponsScreen()),
                  ),
                  const SizedBox(width: Spacing.sm),
                  BotaoRedondo(
                    icone: Icons.notifications,
                    marcado: config.temAvisoNovo,
                    onTap: () => _abrir(const AvisosScreen()),
                  ),
                ],
              ),
            ),
          ),

          // ---- Base: "minha localizacao" + saudacao + "Buscar destino" ----
          Align(
            alignment: Alignment.bottomCenter,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Align(
                  alignment: Alignment.centerRight,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(0, 0, Spacing.lg, Spacing.md),
                    child: Material(
                      color: AppColors.surface,
                      shape: const CircleBorder(),
                      elevation: 3,
                      child: IconButton(
                        tooltip: 'Minha localização',
                        iconSize: 28,
                        padding: const EdgeInsets.all(14),
                        onPressed: _minhaLocalizacao,
                        icon: const Icon(Icons.my_location, color: AppColors.text),
                      ),
                    ),
                  ),
                ),
                SheetSurface(
              padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.md, Spacing.xl, Spacing.xl),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.sheetBorder,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: Spacing.lg),
                  Text(
                    nome == null || nome.isEmpty || nome == 'Passageiro' ? saudacao() : '${saudacao()}, $nome',
                    textAlign: TextAlign.center,
                    style: SheetText.title.copyWith(fontSize: 24, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: Spacing.lg),
                  if (agendarPara != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: Spacing.sm),
                      child: Material(
                        color: AppColors.brandSoft,
                        borderRadius: BorderRadius.circular(Radii.pill),
                        child: Padding(
                          padding: const EdgeInsets.only(left: Spacing.md),
                          child: Row(
                            children: [
                              const Icon(Icons.event, color: AppColors.brand, size: 20),
                              const SizedBox(width: Spacing.sm),
                              Expanded(
                                child: Text(
                                  'Agendar para ${horarioAgendado(agendarPara)}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: SheetText.body.copyWith(fontWeight: FontWeight.w600, color: AppColors.brand),
                                ),
                              ),
                              IconButton(
                                tooltip: 'Chamar agora',
                                onPressed: () => context.read<RideState>().escolherHorario(null),
                                icon: const Icon(Icons.close, color: AppColors.brand, size: 20),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  Row(
                    children: [
                      Expanded(
                        child: Material(
                    color: AppColors.sheetField,
                    borderRadius: BorderRadius.circular(Radii.pill),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(Radii.pill),
                      onTap: _escolherDestino,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: Spacing.xl, vertical: 18),
                        child: Row(
                          children: [
                            const Icon(Icons.search, color: AppColors.sheetText, size: 28),
                            const SizedBox(width: Spacing.md),
                            Flexible(
                              child: Text(
                                'Buscar destino',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: SheetText.heading.copyWith(fontSize: 20),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                      ),
                      const SizedBox(width: Spacing.sm),
                      Material(
                        color: AppColors.surface,
                        shape: const CircleBorder(side: BorderSide(color: AppColors.sheetText, width: 1.5)),
                        child: IconButton(
                          tooltip: 'Agendar corrida',
                          iconSize: 28,
                          padding: const EdgeInsets.all(14),
                          onPressed: _agendar,
                          icon: const Icon(Icons.edit_calendar, color: AppColors.sheetText),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Bom dia / Boa tarde / Boa noite pela hora do aparelho.
String saudacao([DateTime? agora]) {
  final h = (agora ?? DateTime.now()).hour;
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/// Busca do destino: digita e o servidor procura no OpenStreetMap.
/// Se nao achar, da para marcar no mapa.
class _DestinationSheet extends StatefulWidget {
  const _DestinationSheet();

  @override
  State<_DestinationSheet> createState() => _DestinationSheetState();
}

class _DestinationSheetState extends State<_DestinationSheet> {
  final TextEditingController _controller = TextEditingController();
  Timer? _espera;
  String _busca = '';
  bool _procurando = false;
  bool _falhou = false;
  List<PlaceSuggestion> _resultados = const [];

  @override
  void dispose() {
    _espera?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _digitou(String texto) {
    _espera?.cancel();
    final t = texto.trim();
    setState(() {
      _busca = t;
      _falhou = false;
      if (t.length < 3) {
        _resultados = const [];
        _procurando = false;
      }
    });
    if (t.length < 3) return;
    // Espera a pessoa parar de digitar: cada busca e uma consulta ao mapa.
    _espera = Timer(const Duration(milliseconds: 650), () => _procurar(t));
  }

  Future<void> _procurar(String texto) async {
    setState(() => _procurando = true);
    try {
      final app = context.read<AppState>();
      final lista = await context.read<RideState>().searchPlaces(texto, app.coords);
      if (!mounted || texto != _busca) return;
      setState(() {
        _resultados = lista;
        _procurando = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _procurando = false;
        _falhou = true;
      });
    }
  }

  Future<void> _marcarNoMapa() async {
    final origem = context.read<AppState>().coords;
    final lugar = await Navigator.of(context).push<PlaceSuggestion>(
      MaterialPageRoute<PlaceSuggestion>(builder: (_) => MapPickScreen(inicio: origem)),
    );
    if (lugar != null && mounted) Navigator.of(context).pop(lugar);
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final mostrandoRecentes = _busca.length < 3;
    final lista = mostrandoRecentes ? app.destinosRecentes : _resultados;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SheetSurface(
        padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, Spacing.lg),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.78,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(color: AppColors.sheetBorder, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: Spacing.lg),
              AppField(
                hint: 'Digite o destino (rua, bairro ou lugar)',
                controller: _controller,
                autofocus: true,
                onLight: true,
                prefixIcon: Icons.search,
                onChanged: _digitou,
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Container(
                  width: 38,
                  height: 38,
                  decoration: const BoxDecoration(color: AppColors.brandSoft, shape: BoxShape.circle),
                  child: const Icon(Icons.map_outlined, color: AppColors.brand, size: 20),
                ),
                title: Text('Escolher no mapa', style: SheetText.body.copyWith(fontWeight: FontWeight.w600)),
                subtitle: Text('Para quando a busca não achar o lugar', style: SheetText.muted),
                onTap: _marcarNoMapa,
              ),
              const Divider(height: 1, color: AppColors.sheetBorder),
              const SizedBox(height: Spacing.md),
              Row(
                children: [
                  Text(mostrandoRecentes ? 'RECENTES' : 'RESULTADOS', style: SheetText.label),
                  const Spacer(),
                  if (_procurando)
                    const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                ],
              ),
              const SizedBox(height: Spacing.sm),
              Expanded(
                child: lista.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.only(top: Spacing.lg),
                        child: Text(
                          _falhou
                              ? 'Sem conexão para buscar agora. Tente de novo ou escolha no mapa.'
                              : mostrandoRecentes
                                  ? 'Digite pelo menos 3 letras do destino.'
                                  : _procurando
                                      ? 'Procurando...'
                                      : 'Nada encontrado com esse nome. Tente outro jeito de escrever ou escolha no mapa.',
                          style: SheetText.muted,
                        ),
                      )
                    : ListView.separated(
                        padding: EdgeInsets.zero,
                        itemCount: lista.length,
                        separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.sheetBorder),
                        itemBuilder: (context, index) {
                          final item = lista[index];
                          final longe = !mostrandoRecentes && item.distanceKm > 0
                              ? '${formatDistance(item.distanceKm * 1000)} • '
                              : '';
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(
                              mostrandoRecentes ? Icons.schedule : Icons.location_on_outlined,
                              color: AppColors.sheetMuted,
                            ),
                            title: Text(
                              item.address,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: SheetText.body.copyWith(fontWeight: FontWeight.w600),
                            ),
                            subtitle: Text(
                              '$longe${item.detail}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: SheetText.muted,
                            ),
                            onTap: () => Navigator.of(context).pop(item),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
