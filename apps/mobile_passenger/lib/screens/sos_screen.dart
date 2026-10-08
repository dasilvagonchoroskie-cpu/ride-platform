import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/avisos.dart';
import '../core/permissoes_nativas.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/geo.dart';
import '../data/models/models.dart';
import '../state/app_state.dart';
import '../state/ride_state.dart';
import 'contatos_emergencia_screen.dart';

/// Botao vermelho "SOS" que fica sobre o mapa durante a corrida.
class BotaoSos extends StatelessWidget {
  const BotaoSos({super.key});

  @override
  Widget build(BuildContext context) {
    final ativo = context.watch<RideState>().sosId != null;
    return Material(
      color: AppColors.danger,
      shape: const StadiumBorder(),
      elevation: 4,
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SosScreen())),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.sm),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.sos, color: Colors.white, size: 22),
              const SizedBox(width: Spacing.xs),
              Text(ativo ? 'SOS ativo' : 'SOS', style: AppText.bodyStrong.copyWith(color: Colors.white)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Seguranca do passageiro: botao de panico (a Central recebe a posicao e
/// um alarme toca la), aviso aos contatos de emergencia pelo WhatsApp e
/// atalhos para 190 e 192.
class SosScreen extends StatefulWidget {
  const SosScreen({super.key});

  @override
  State<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends State<SosScreen> {
  bool _enviando = false;
  List<ContatoEmergencia>? _contatos;

  @override
  void initState() {
    super.initState();
    _carregarContatos();
  }

  Future<void> _carregarContatos() async {
    try {
      final lista = await context.read<RideState>().contatosEmergencia();
      if (mounted) setState(() => _contatos = lista);
    } catch (_) {
      if (mounted) setState(() => _contatos = const []);
    }
  }

  Coords _posicao() => context.read<AppState>().coords;

  Future<void> _acionar() async {
    setState(() => _enviando = true);
    final ok = await context.read<RideState>().acionarSos(_posicao);
    if (!mounted) return;
    setState(() => _enviando = false);
    if (ok) avisar('Alerta enviado para a Central.');
  }

  /// Mensagem com o link do mapa, o motorista e o carro.
  String _mensagem() {
    final p = _posicao();
    final corrida = context.read<RideState>().activeRide;
    final m = corrida?.driver;
    final linhas = [
      'SOS! Estou numa corrida da Fortaleza Mov e preciso de ajuda.',
      'Minha localização: https://maps.google.com/?q=${p.latitude.toStringAsFixed(6)},${p.longitude.toStringAsFixed(6)}',
      if (m != null) 'Motorista: ${m.name} · ${m.vehicle} ${m.color} · placa ${m.plate}',
      if (corrida != null) 'Corrida ${corrida.code}: de ${corrida.pickup.address} para ${corrida.dropoff.address}',
    ];
    return linhas.join('\n');
  }

  Future<void> _avisar(ContatoEmergencia c) async {
    var d = c.telefone.replaceAll(RegExp(r'\D'), '');
    if (!d.startsWith('55')) d = '55$d';
    final abriu = await PermissoesNativas.abrirLink('https://wa.me/$d?text=${Uri.encodeComponent(_mensagem())}');
    if (!abriu) avisar('Não foi possível abrir o WhatsApp. Ligue para ${c.telefoneBonito}.');
  }

  Future<void> _ligar(String numero) async {
    if (!await PermissoesNativas.abrirLink('tel:$numero')) avisar('Não foi possível abrir o telefone. Disque $numero.');
  }

  Future<void> _cadastrarContatos() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ContatosEmergenciaScreen()));
    if (mounted) await _carregarContatos();
  }

  @override
  Widget build(BuildContext context) {
    final estado = context.watch<RideState>();
    final ativo = estado.sosId != null;
    final contatos = _contatos;
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Segurança')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(Spacing.xl),
          children: [
            Text(
              ativo
                  ? 'Alerta enviado para a Central. Sua localização está sendo enviada a cada 10 segundos.'
                  : 'Em perigo? Aperte o botão. A Central recebe sua localização na hora e um alarme toca lá.',
              textAlign: TextAlign.center,
              style: AppText.body.copyWith(color: ativo ? AppColors.danger : AppColors.textMuted),
            ),
            const SizedBox(height: Spacing.xl),
            Center(
              child: SizedBox(
                width: 200,
                height: 200,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.danger,
                    foregroundColor: Colors.white,
                    shape: const CircleBorder(),
                    elevation: 8,
                  ),
                  onPressed: _enviando ? null : _acionar,
                  child: _enviando
                      ? const CircularProgressIndicator(color: Colors.white)
                      : Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.sos, size: 64),
                            Text(
                              ativo ? 'ENVIAR DE NOVO' : 'PÂNICO',
                              style: AppText.heading.copyWith(color: Colors.white),
                            ),
                          ],
                        ),
                ),
              ),
            ),
            if (ativo) ...[
              const SizedBox(height: Spacing.md),
              Center(
                child: OutlinedButton(
                  onPressed: estado.pararSos,
                  child: const Text('Parar de enviar minha localização'),
                ),
              ),
            ],
            const SizedBox(height: Spacing.xl),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
                    onPressed: () => _ligar('190'),
                    icon: const Icon(Icons.local_police),
                    label: const Text('190 Polícia'),
                  ),
                ),
                const SizedBox(width: Spacing.md),
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
                    onPressed: () => _ligar('192'),
                    icon: const Icon(Icons.local_hospital),
                    label: const Text('192 SAMU'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: Spacing.xl),
            const Divider(color: AppColors.border),
            const SizedBox(height: Spacing.md),
            Text('Avisar meus contatos', style: AppText.heading.copyWith(color: AppColors.text)),
            const SizedBox(height: Spacing.xs),
            Text(
              'Abre o WhatsApp com a sua localização, o motorista e a placa do carro.',
              style: AppText.caption.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: Spacing.sm),
            if (contatos == null)
              const Padding(
                padding: EdgeInsets.all(Spacing.md),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (contatos.isEmpty)
              OutlinedButton.icon(
                onPressed: _cadastrarContatos,
                icon: const Icon(Icons.person_add_alt),
                label: const Text('Cadastrar contatos de emergência'),
              )
            else
              for (final c in contatos)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.person, color: AppColors.text),
                  title: Text(c.nome, style: AppText.bodyStrong),
                  subtitle: Text(c.telefoneBonito, style: AppText.caption),
                  trailing: FilledButton.tonal(onPressed: () => _avisar(c), child: const Text('Avisar')),
                ),
          ],
        ),
      ),
    );
  }
}
