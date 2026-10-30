import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/mapa/busca.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/geo.dart';
import '../data/models/models.dart';
import '../state/app_state.dart';
import '../state/ride_state.dart';
import '../widgets/contingencia_mapa.dart';
import '../widgets/ui.dart';
import 'map_pick_screen.dart';

/// Busca do destino (ou de uma parada): digita e o servidor procura na
/// TomTom. Etapa 3 (Evandro, 29/10/2026):
/// - SALVOS (Casa, Trabalho...) e RECENTES ficam no servidor, so da conta;
///   a lixeira apaga no servidor e a lista so muda depois da resposta;
/// - "Ir sem destino": a corrida vai pelo taximetro, com valor estimado;
/// - "Escolher no mapa" com o alfinete fixo;
/// - a mesma "sessao" de busca enquanto a tela esta aberta.
class DestinoSheet extends StatefulWidget {
  const DestinoSheet({super.key, this.parada = false, this.titulo});

  /// Entrega (Etapa 5): "Endereço de coleta" / "Endereço de entrega" (sem "Ir sem destino").
  final String? titulo;

  /// Escolhendo uma parada no caminho (sem "Ir sem destino").
  final bool parada;

  /// Resposta quando a pessoa escolhe "Ir sem destino".
  static const PlaceSuggestion semDestino = PlaceSuggestion(
    address: 'Sem destino definido (pelo taxímetro)',
    coords: Coords(0, 0),
    distanceKm: -1,
  );

  static bool ehSemDestino(PlaceSuggestion? p) => p != null && identical(p, semDestino);

  /// Abre a busca. null = fechou sem escolher.
  static Future<PlaceSuggestion?> abrir(BuildContext context, {bool parada = false, String? titulo}) {
    return showModalBottomSheet<PlaceSuggestion>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: const Color(0x66000000),
      builder: (_) => DestinoSheet(parada: parada, titulo: titulo),
    );
  }

  @override
  State<DestinoSheet> createState() => _DestinoSheetState();
}

class _DestinoSheetState extends State<DestinoSheet> {
  final TextEditingController _controller = TextEditingController();
  Timer? _espera;
  String _busca = '';
  bool _procurando = false;
  bool _falhou = false;
  List<PlaceSuggestion> _resultados = const [];

  /// A TomTom esta no limite agora (MAPA_LIMITE): mostra a contingencia.
  bool _limite = false;

  /// Destino recente sendo apagado no servidor (mostra o relogio na linha).
  String? _apagando;

  /// Token de sessao desta abertura da tela (vai junto em cada busca).
  late final String _sessao = _novaSessao();

  /// Buscas desta abertura do app: a mesma busca nao vai ao servidor de novo.
  static final BuscasGuardadas<PlaceSuggestion> _guardadas = BuscasGuardadas<PlaceSuggestion>();

  static String _novaSessao() {
    final r = math.Random();
    return List.generate(16, (_) => r.nextInt(36).toRadixString(36)).join();
  }

  @override
  void initState() {
    super.initState();
    // Salvos e recentes do servidor (rapido; enquanto isso ficam os do celular).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(context.read<RideState>().carregarEnderecos());
    });
  }

  @override
  void dispose() {
    _espera?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _digitou(String texto) {
    _espera?.cancel();
    final t = texto.trim();
    final pode = RegrasDaBusca.podeBuscar(t);
    setState(() {
      _busca = t;
      _falhou = false;
      _limite = false;
      if (!pode) {
        _resultados = const [];
        _procurando = false;
      }
    });
    if (!pode) return;
    // Economia (29/10/2026): 3 letras uteis (sem contar "rua", "av."...) e
    // espera de 500 ms depois da ultima tecla — nunca uma busca por tecla.
    _espera = Timer(RegrasDaBusca.espera, () => _procurar(t));
  }

  Future<void> _procurar(String texto) async {
    final app = context.read<AppState>();
    final chave = BuscasGuardadas.chave(texto, app.coords.latitude, app.coords.longitude);
    final guardada = _guardadas.ler(chave);
    if (guardada != null) {
      setState(() {
        _resultados = guardada;
        _procurando = false;
      });
      return;
    }
    setState(() => _procurando = true);
    try {
      final lista = await context.read<RideState>().searchPlaces(texto, app.coords, sessao: _sessao);
      if (lista.isNotEmpty) _guardadas.gravar(chave, lista);
      if (!mounted || texto != _busca) return;
      setState(() {
        _resultados = lista;
        _procurando = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _procurando = false;
        _limite = e.code == 'MAPA_LIMITE';
        _falhou = !_limite;
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
      MaterialPageRoute<PlaceSuggestion>(builder: (_) => MapPickScreen(inicio: origem, parada: widget.parada || widget.titulo != null)),
    );
    if (lugar != null && mounted) Navigator.of(context).pop(lugar);
  }

  /// Lixeira: apaga no servidor; a linha so some quando o servidor confirma.
  Future<void> _apagarRecente(DestinoRecente d) async {
    setState(() => _apagando = d.chave);
    final ok = await context.read<RideState>().esconderDestino(d.chave);
    if (!mounted) return;
    setState(() => _apagando = null);
    if (!ok) avisar('Não deu para apagar agora (sem conexão). Tente de novo.');
  }

  /// Estrela: salva como Casa, Trabalho ou outro nome.
  Future<void> _salvar(PlaceSuggestion lugar) async {
    final rotulo = await escolherNomeDoEndereco(context);
    if (rotulo == null || !mounted) return;
    final erro = await context.read<RideState>().salvarEndereco(rotulo, lugar);
    if (!mounted) return;
    avisar(erro ?? 'Endereço salvo como "$rotulo".');
  }

  Future<void> _apagarSalvo(EnderecoSalvo e) async {
    final certeza = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Apagar "${e.rotulo}"?'),
        content: Text(e.endereco),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(false), child: const Text('Voltar')),
          TextButton(onPressed: () => Navigator.of(c).pop(true), child: const Text('Apagar')),
        ],
      ),
    );
    if (certeza != true || !mounted) return;
    final ok = await context.read<RideState>().apagarSalvo(e.id);
    if (!ok && mounted) avisar('Não deu para apagar agora (sem conexão). Tente de novo.');
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final ride = context.watch<RideState>();
    final digitando = RegrasDaBusca.podeBuscar(_busca);
    final salvos = ride.salvos;
    // Recentes: os do servidor (so da conta); sem servidor, os do celular.
    final recentesServidor = ride.recentesDoServidor ? ride.recentes : const <DestinoRecente>[];
    final recentesCelular = ride.recentesDoServidor ? const <PlaceSuggestion>[] : app.destinosRecentes;

    final linhas = <Widget>[];
    if (digitando) {
      if (_limite) {
        linhas.add(ContingenciaDoMapa(endereco: _busca, outraAcao: _marcarNoMapa, outraAcaoTexto: 'Escolher no mapa'));
      } else if (_resultados.isEmpty) {
        linhas.add(Padding(
          padding: const EdgeInsets.only(top: Spacing.lg),
          child: Text(
            _falhou
                ? 'Sem conexão para buscar agora. Tente de novo ou escolha no mapa.'
                : _procurando
                    ? 'Procurando...'
                    : 'Nada encontrado com esse nome. Tente outro jeito de escrever ou escolha no mapa.',
            style: SheetText.muted,
          ),
        ));
      } else {
        for (final item in _resultados) {
          final longe = item.distanceKm > 0 ? '${formatDistance(item.distanceKm * 1000)} • ' : '';
          linhas.add(_LinhaLugar(
            icone: Icons.location_on_outlined,
            titulo: item.address,
            subtitulo: '$longe${item.detail}',
            aoTocar: () => Navigator.of(context).pop(item),
            acao: IconButton(
              tooltip: 'Salvar endereço',
              icon: const Icon(Icons.star_border, color: AppColors.sheetMuted),
              onPressed: () => _salvar(item),
            ),
          ));
        }
      }
    } else {
      if (salvos.isNotEmpty) {
        linhas.add(Text('SALVOS', style: SheetText.label));
        for (final e in salvos) {
          linhas.add(_LinhaLugar(
            icone: e.icone,
            titulo: e.rotulo,
            subtitulo: e.endereco,
            aoTocar: () => Navigator.of(context).pop(e.comoLugar),
            acao: IconButton(
              tooltip: 'Apagar endereço salvo',
              icon: const Icon(Icons.delete_outline, color: AppColors.sheetMuted),
              onPressed: () => _apagarSalvo(e),
            ),
          ));
        }
        linhas.add(const SizedBox(height: Spacing.md));
      }
      linhas.add(Text('RECENTES', style: SheetText.label));
      if (recentesServidor.isEmpty && recentesCelular.isEmpty) {
        linhas.add(Padding(
          padding: const EdgeInsets.only(top: Spacing.sm),
          child: Text('Digite pelo menos 3 letras do destino.', style: SheetText.muted),
        ));
      }
      for (final d in recentesServidor) {
        linhas.add(_LinhaLugar(
          icone: Icons.schedule,
          titulo: d.lugar.address,
          subtitulo: '',
          aoTocar: () => Navigator.of(context).pop(d.lugar),
          acao: _apagando == d.chave
              ? const Padding(
                  padding: EdgeInsets.all(12),
                  child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
                )
              : Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: 'Salvar endereço',
                      icon: const Icon(Icons.star_border, color: AppColors.sheetMuted),
                      onPressed: () => _salvar(d.lugar),
                    ),
                    IconButton(
                      tooltip: 'Apagar do histórico',
                      icon: const Icon(Icons.delete_outline, color: AppColors.sheetMuted),
                      onPressed: _apagando == null ? () => _apagarRecente(d) : null,
                    ),
                  ],
                ),
        ));
      }
      for (final item in recentesCelular) {
        linhas.add(_LinhaLugar(
          icone: Icons.schedule,
          titulo: item.address,
          subtitulo: item.detail,
          aoTocar: () => Navigator.of(context).pop(item),
        ));
      }
    }

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
              if (widget.parada || widget.titulo != null) ...[
                Text(widget.titulo ?? 'Adicionar parada', style: SheetText.title),
                const SizedBox(height: Spacing.sm),
              ],
              AppField(
                hint: widget.titulo != null
                    ? 'Digite o endereço (rua, bairro ou lugar)'
                    : widget.parada
                        ? 'Digite a parada (rua, bairro ou lugar)'
                        : 'Digite o destino (rua, bairro ou lugar)',
                controller: _controller,
                autofocus: true,
                onLight: true,
                prefixIcon: Icons.search,
                onChanged: _digitou,
              ),
              _Atalho(
                icone: Icons.map_outlined,
                titulo: 'Escolher no mapa',
                subtitulo: 'Para quando a busca não achar o lugar',
                aoTocar: _marcarNoMapa,
              ),
              if (!widget.parada && widget.titulo == null)
                _Atalho(
                  icone: Icons.local_taxi_outlined,
                  titulo: 'Ir sem destino',
                  subtitulo: 'Você diz ao motorista no caminho. O valor é estimado e sai pelo taxímetro.',
                  aoTocar: () => Navigator.of(context).pop(DestinoSheet.semDestino),
                ),
              const Divider(height: 1, color: AppColors.sheetBorder),
              const SizedBox(height: Spacing.md),
              if (digitando)
                Row(
                  children: [
                    Text('RESULTADOS', style: SheetText.label),
                    const Spacer(),
                    if (_procurando) const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                  ],
                ),
              if (digitando) const SizedBox(height: Spacing.sm),
              Expanded(
                child: ListView(padding: EdgeInsets.zero, children: linhas),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Casa, Trabalho ou outro nome para salvar um endereco.
Future<String?> escolherNomeDoEndereco(BuildContext context) async {
  final campo = TextEditingController();
  final escolha = await showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (c) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom),
      child: SheetSurface(
        padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.lg, Spacing.lg, Spacing.xl),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Salvar endereço como', style: SheetText.title),
              const SizedBox(height: Spacing.md),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.home_outlined),
                      label: const Text('Casa'),
                      onPressed: () => Navigator.of(c).pop('Casa'),
                    ),
                  ),
                  const SizedBox(width: Spacing.sm),
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.work_outline),
                      label: const Text('Trabalho'),
                      onPressed: () => Navigator.of(c).pop('Trabalho'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Spacing.md),
              AppField(
                hint: 'Ou outro nome (ex.: Casa da mãe)',
                controller: campo,
                onLight: true,
                maxLength: 40,
                prefixIcon: Icons.star_border,
              ),
              const SizedBox(height: Spacing.sm),
              AppButton(
                label: 'Salvar com este nome',
                onPressed: () {
                  final t = campo.text.trim();
                  if (t.isNotEmpty) Navigator.of(c).pop(t);
                },
              ),
            ],
          ),
        ),
      ),
    ),
  );
  return escolha;
}

class _Atalho extends StatelessWidget {
  const _Atalho({required this.icone, required this.titulo, required this.subtitulo, required this.aoTocar});

  final IconData icone;
  final String titulo;
  final String subtitulo;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Container(
          width: 38,
          height: 38,
          decoration: const BoxDecoration(color: AppColors.brandSoft, shape: BoxShape.circle),
          child: Icon(icone, color: AppColors.brand, size: 20),
        ),
        title: Text(titulo, style: SheetText.body.copyWith(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitulo, style: SheetText.muted),
        onTap: aoTocar,
      );
}

class _LinhaLugar extends StatelessWidget {
  const _LinhaLugar({required this.icone, required this.titulo, required this.subtitulo, required this.aoTocar, this.acao});

  final IconData icone;
  final String titulo;
  final String subtitulo;
  final VoidCallback aoTocar;
  final Widget? acao;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(icone, color: AppColors.sheetMuted),
            title: Text(titulo, maxLines: 1, overflow: TextOverflow.ellipsis, style: SheetText.body.copyWith(fontWeight: FontWeight.w600)),
            subtitle: subtitulo.isEmpty ? null : Text(subtitulo, maxLines: 1, overflow: TextOverflow.ellipsis, style: SheetText.muted),
            trailing: acao,
            onTap: aoTocar,
          ),
          const Divider(height: 1, color: AppColors.sheetBorder),
        ],
      );
}
