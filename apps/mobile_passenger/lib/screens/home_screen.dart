import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
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
import 'destino_sheet.dart';
import '../core/mapa_config.dart';
import '../core/marca.dart';

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
      if (!mounted) return;
      final ride = context.read<RideState>();
      ride.carregarAgendadas();
      // Endereco das imagens do mapa (TomTom, com a chave) so com login.
      unawaited(MapaConfig.atualizarComLogin((c) => ride.api.request('GET', c)));
    });
    var voltas = 0;
    _relogio = Timer.periodic(const Duration(seconds: 30), (_) {
      voltas++;
      // Modo economia do mapa: os carros por perto a cada 90 s (antes 30 s).
      if (!MapaConfig.economia || voltas % 3 == 0) _atualizarCarros();
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
    final alvo = await DestinoSheet.abrir(context);
    if (alvo == null || !mounted) return;
    await _irPara(alvo);
  }

  Future<void> _irPara(PlaceSuggestion alvo) async {
    final app = context.read<AppState>();
    final ride = context.read<RideState>();

    // O embarque e a posicao do GPS: se ele ainda nao respondeu nesta
    // abertura, espera um pouco antes de calcular a corrida.
    if (!app.localizacaoReal) {
      avisar('Confirmando o seu local de embarque pelo GPS…');
      final ok = await app.esperarGps(const Duration(seconds: 10));
      if (!mounted) return;
      if (!ok && app.centroDaCidade) {
        avisar('Ainda não achamos você no mapa. Confira se o GPS está ligado e tente de novo perto de uma janela.');
        return;
      }
      if (!ok) avisar('O GPS ainda não respondeu: confira o endereço de embarque antes de confirmar.');
    }

    // Etapa 3: "Ir sem destino" — pelo taximetro, com valor estimado.
    final semDestino = DestinoSheet.ehSemDestino(alvo);
    ride.novaViagem(semDestino: semDestino);
    if (!semDestino) {
      await app.addDestinoRecente(alvo);
      await app.addRecentPlace(alvo.fullAddress);
    }
    final destino = semDestino ? app.coords : alvo.coords;
    final endereco = semDestino ? DestinoSheet.semDestino.address : alvo.fullAddress;
    await ride.estimate(app.coords, destino, dropoffAddress: endereco);

    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ConfirmScreen(destination: destino, address: endereco, semDestino: semDestino),
      ),
    );
  }

  void _abrir(Widget tela) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => tela));

  /// O mapa abriu na ultima posicao conhecida; quando o GPS de verdade
  /// chega, o mapa vai ate ele e os carros por perto sao buscados de novo.
  bool _gpsVisto = false;

  void _conferirGps(AppState app) {
    if (_gpsVisto || !app.localizacaoReal) return;
    _gpsVisto = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() => _recentrar++);
      _atualizarCarros();
    });
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    _conferirGps(app);
    final auth = context.watch<AuthState>();
    final ride = context.watch<RideState>();
    final config = context.watch<ConfigState>();
    final nome = auth.user?.firstName;
    final agendarPara = ride.agendarPara;

    final markers = <MapMarker>[
      if (!app.centroDaCidade) MapMarker(id: 'me', coords: app.coords, kind: MarkerKind.pickup),
      for (final driver in ride.nearbyDrivers)
        MapMarker(id: driver.id, coords: driver.position, kind: driver.moto ? MarkerKind.moto : MarkerKind.car),
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
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
              Row(
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
                    // Etapa 6: nome, cor e logo escolhidos na Central.
                    color: Marca.cor,
                    elevation: 3,
                    shadowColor: const Color(0x55000000),
                    borderRadius: BorderRadius.circular(Radii.pill),
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(Marca.logoUrl != null ? 8 : 22, Marca.logoUrl != null ? 8 : 14, 22, Marca.logoUrl != null ? 8 : 14),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (Marca.logoUrl != null) ...[
                            const BrandLogo(size: 40),
                            const SizedBox(width: 10),
                          ],
                          Text(
                            Marca.nome,
                            style: AppText.heading.copyWith(color: Colors.white, fontSize: 21, fontWeight: FontWeight.w700),
                          ),
                        ],
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
              // Faixa de aviso da Central (promocao, horario especial...).
              if (Marca.faixa != null) ...[
                const SizedBox(height: Spacing.sm),
                FaixaDaCentral(texto: Marca.faixa!),
              ],
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
                if (!app.localizacaoReal)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: Spacing.sm),
                      child: _AvisoGps(soCidade: app.centroDaCidade),
                    ),
                  ),
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

/// Aviso pequeno em cima do "Buscar destino" enquanto o GPS acerta.
class _AvisoGps extends StatelessWidget {
  const _AvisoGps({required this.soCidade});

  final bool soCidade;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      elevation: 2,
      borderRadius: BorderRadius.circular(Radii.pill),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Icone parado (sem animacao): o aviso pode ficar varios segundos.
            const Icon(Icons.gps_not_fixed, size: 16, color: AppColors.brand),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                soCidade ? 'Procurando você no mapa…' : 'Atualizando sua localização…',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.body.copyWith(fontSize: 14, color: AppColors.text),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Faixa de aviso do Inicio (Central > Configuracoes > Aparencia do app).
class FaixaDaCentral extends StatelessWidget {
  const FaixaDaCentral({super.key, required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 3,
      shadowColor: const Color(0x55000000),
      borderRadius: BorderRadius.circular(Radii.md),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 5, color: Marca.cor),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(Spacing.md, Spacing.sm, Spacing.md, Spacing.sm),
                child: Row(
                  children: [
                    Icon(Icons.campaign, color: Marca.cor, size: 22),
                    const SizedBox(width: Spacing.sm),
                    Expanded(
                      child: Text(
                        texto,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.body.copyWith(fontWeight: FontWeight.w600, color: AppColors.text),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
