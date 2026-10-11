import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/avisos.dart';
import '../core/fotos.dart';
import '../core/permissoes_nativas.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/geo.dart';
import '../data/models/models.dart';
import '../screens/chat_screen.dart';
import '../state/ride_state.dart';

// ---------------------------------------------------------------------
// Tela "motorista a caminho" no modelo que o Evandro escolheu (Pop Move):
// tempo e distancia ate o passageiro, fotos do motorista e do carro,
// nota e numero de viagens, Bloquear / Favoritar, carro com a placa em
// destaque, chat e Cancelar.
// ---------------------------------------------------------------------

/// Tempo (minutos) e distancia (km) do carro ate o embarque, pela rua.
/// A conta usa a linha reta com 30% a mais (ruas nao sao retas) e 25 km/h
/// de media na cidade.
(int, double) tempoAteVoce(Coords carro, Coords embarque) {
  final km = distanceKm(carro, embarque) * 1.3;
  final minutos = (km / 25 * 60).round();
  return (minutos < 1 ? 1 : minutos, km);
}

String _km(double km) => km < 1 ? '${(km * 1000).round()} m' : '${km.toStringAsFixed(1).replaceAll('.', ',')} km';

/// Faixa "Tempo até você: 2 min · 1,3 km".
class FaixaTempoAteVoce extends StatelessWidget {
  const FaixaTempoAteVoce({super.key, required this.corrida});

  final Ride corrida;

  @override
  Widget build(BuildContext context) {
    final m = corrida.driver;
    final chegou = corrida.status == RideStatus.driverWaiting;
    final emViagem = corrida.status == RideStatus.inProgress;
    String titulo;
    String linha;
    if (chegou) {
      titulo = 'O motorista chegou';
      linha = 'Está te esperando';
    } else if (emViagem) {
      final (min, km) = tempoAteVoce(m?.position ?? corrida.pickup.coords, corrida.dropoff.coords);
      titulo = 'Até o destino';
      linha = '$min min · ${_km(km)}';
    } else if (m == null || !m.posicaoReal) {
      titulo = 'Tempo até você';
      linha = 'calculando...';
    } else {
      final (min, km) = tempoAteVoce(m.position, corrida.pickup.coords);
      titulo = 'Tempo até você';
      linha = '$min min · ${_km(km)}';
    }
    return Material(
      elevation: 4,
      shadowColor: const Color(0x44000000),
      borderRadius: BorderRadius.circular(Radii.pill),
      color: AppColors.surface,
      child: Row(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Spacing.md),
            child: Icon(
              corrida.paymentMethod.toLowerCase().contains('pix') ? Icons.pix : Icons.payments_outlined,
              color: AppColors.textMuted,
            ),
          ),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.sm),
              decoration: BoxDecoration(
                color: chegou ? AppColors.success : AppColors.brand,
                borderRadius: BorderRadius.circular(Radii.pill),
              ),
              child: Column(
                children: [
                  Text(
                    titulo,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.bodyStrong.copyWith(color: Colors.white, fontSize: 16),
                  ),
                  // Diminui a letra em vez de cortar ("Ele está te es..."
                  // aparecia cortado na foto da tela de 360 de largura).
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(chegou ? Icons.place : Icons.schedule, color: Colors.white, size: 20),
                        const SizedBox(width: Spacing.xs),
                        Text(
                          linha,
                          maxLines: 1,
                          style: AppText.heading.copyWith(color: Colors.white, fontSize: 20),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Botao redondo "chat" com o numero de mensagens nao lidas.
class BotaoChat extends StatelessWidget {
  const BotaoChat({super.key, required this.corrida});

  final Ride corrida;

  void _abrir(BuildContext context) {
    final estado = context.read<RideState>();
    estado.mensagensLidas();
    final nome = (corrida.driver?.name ?? 'motorista').split(' ').first;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ChatScreen(
          api: estado.api,
          caminho: '/rides/${corrida.id}/messages',
          titulo: 'Conversa com $nome',
          atalhos: const [
            'Já estou indo',
            'Estou no local de embarque',
            'Pode me esperar um pouco?',
            'Estou em frente ao portão',
            'Não estou te encontrando',
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final n = corrida.mensagensNaoLidas;
    return Badge(
      isLabelVisible: n > 0,
      label: Text('$n'),
      largeSize: 22,
      child: Material(
        color: AppColors.brand,
        shape: const CircleBorder(),
        elevation: 4,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => _abrir(context),
          child: const SizedBox(
            width: 64,
            height: 64,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.forum, color: Colors.white, size: 26),
                Text('chat', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Fotos, nota, viagens, nome, Bloquear / Favoritar e o carro com a placa.
class PainelMotorista extends StatelessWidget {
  const PainelMotorista({super.key, required this.corrida});

  final Ride corrida;

  Future<void> _bloquear(BuildContext context, DriverInfo m) async {
    final estado = context.read<RideState>();
    if (corrida.bloqueado) {
      await estado.bloquearMotorista(sim: false);
      return;
    }
    final primeiro = m.name.split(' ').first;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('Bloquear $primeiro?', style: AppText.heading),
        content: Text(
          '$primeiro não vai mais receber as suas corridas. Esta corrida continua: '
          'se não quiser seguir com ele, toque em Cancelar depois.',
          style: AppText.body,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Voltar')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Bloquear', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (ok == true) await estado.bloquearMotorista(sim: true);
  }

  Future<void> _ligar(String telefone) async {
    final t = telefone.replaceAll(RegExp(r'[^\d+]'), '');
    if (t.isEmpty) return;
    if (!await PermissoesNativas.abrirLink('tel:$t')) avisar('Não foi possível abrir o telefone. Número: $t');
  }

  @override
  Widget build(BuildContext context) {
    final m = corrida.driver;
    if (m == null) return const SizedBox.shrink();
    final nota = m.rating.toStringAsFixed(1).replaceAll('.', ',');
    final viagens = m.totalRides == 1 ? '1 viagem' : '${m.totalRides} viagens';
    final telefone = m.telefone ?? '';

    // Iniciais um pouco para cima e para a esquerda: o circulo do carro
    // (embaixo, a direita) cobria metade das letras.
    final rosto = Container(
      width: 84,
      height: 84,
      alignment: const Alignment(-0.2, -0.15),
      decoration: const BoxDecoration(color: AppColors.brand, shape: BoxShape.circle),
      child: Text(m.initials, style: AppText.title.copyWith(color: Colors.white, fontSize: 24)),
    );
    final carro = Container(
      width: 48,
      height: 48,
      decoration: const BoxDecoration(color: AppColors.surfaceElevated, shape: BoxShape.circle),
      child: Icon(m.moto ? Icons.two_wheeler : Icons.directions_car, color: AppColors.textMuted, size: 26),
    );

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              children: [
                SizedBox(
                  width: 112,
                  height: 92,
                  child: Stack(
                    children: [
                      _Moldura(
                        child: m.fotoUrl == null
                            ? rosto
                            : FotoDoServidor(caminho: m.fotoUrl!, tamanho: 84, reserva: rosto),
                      ),
                      Positioned(
                        right: 0,
                        bottom: 0,
                        child: _Moldura(
                          child: m.fotoCarroUrl == null
                              ? carro
                              : FotoDoServidor(caminho: m.fotoCarroUrl!, tamanho: 48, reserva: carro),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: Spacing.xs),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.star, color: AppColors.gold, size: 22),
                    const SizedBox(width: 2),
                    Text(nota, style: AppText.heading.copyWith(color: AppColors.text)),
                  ],
                ),
                Text(viagens, style: AppText.caption.copyWith(color: AppColors.textMuted)),
              ],
            ),
            const SizedBox(width: Spacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    m.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.title.copyWith(fontSize: 22, color: AppColors.text),
                  ),
                  const SizedBox(height: Spacing.sm),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _Acao(
                        icone: corrida.bloqueado ? Icons.lock_open : Icons.block,
                        rotulo: corrida.bloqueado ? 'Desbloquear' : 'Bloquear',
                        cor: corrida.bloqueado ? AppColors.danger : AppColors.textMuted,
                        aoTocar: () => _bloquear(context, m),
                      ),
                      _Acao(
                        icone: corrida.favorito ? Icons.favorite : Icons.favorite_border,
                        rotulo: corrida.favorito ? 'Favorito' : 'Favoritar',
                        cor: corrida.favorito ? AppColors.danger : AppColors.textMuted,
                        aoTocar: () => context.read<RideState>().favoritarMotorista(sim: !corrida.favorito),
                      ),
                      if (telefone.isNotEmpty)
                        _Acao(
                          icone: Icons.call,
                          rotulo: 'Ligar',
                          cor: AppColors.textMuted,
                          aoTocar: () => _ligar(telefone),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: Spacing.md),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    m.vehicle.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.bodyStrong.copyWith(color: AppColors.text, letterSpacing: 0.5),
                  ),
                  Text(
                    m.color.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.body.copyWith(color: AppColors.textMuted, letterSpacing: 0.5),
                  ),
                ],
              ),
            ),
            const SizedBox(width: Spacing.md),
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  m.plate.toUpperCase(),
                  style: AppText.display.copyWith(color: AppColors.brand, fontSize: 34, letterSpacing: 1.5),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _Moldura extends StatelessWidget {
  const _Moldura({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: Color(0x33000000), blurRadius: 6)],
      ),
      child: child,
    );
  }
}

class _Acao extends StatelessWidget {
  const _Acao({required this.icone, required this.rotulo, required this.cor, required this.aoTocar});

  final IconData icone;
  final String rotulo;
  final Color cor;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      elevation: 2,
      shadowColor: const Color(0x33000000),
      borderRadius: BorderRadius.circular(Radii.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.md),
        onTap: aoTocar,
        // 62 de largura: os 3 botoes (Bloquear, Favoritar, Ligar) cabem
        // numa linha so no celular de 360 (antes o Ligar caia para baixo).
        child: SizedBox(
          width: 62,
          height: 58,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icone, color: cor, size: 24),
              const SizedBox(height: 2),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(rotulo, maxLines: 1, style: AppText.caption.copyWith(color: AppColors.textMuted, fontSize: 12)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Botao "Cancelar" em pilula, centralizado.
class BotaoCancelarPilula extends StatelessWidget {
  const BotaoCancelarPilula({super.key, required this.aoTocar, this.carregando = false});

  final VoidCallback? aoTocar;
  final bool carregando;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: FilledButton(
        onPressed: carregando ? null : aoTocar,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: Colors.white,
          minimumSize: const Size(180, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.pill)),
          textStyle: AppText.heading.copyWith(fontSize: 18),
        ),
        child: Text(carregando ? 'Cancelando...' : 'Cancelar'),
      ),
    );
  }
}
