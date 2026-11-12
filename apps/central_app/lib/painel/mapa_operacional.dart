import 'package:flutter/material.dart';

import '../core/theme/central_theme.dart';
import '../data/painel.dart';

/// Regras do mapa operacional da Central (um mapa so, na tela inicial).
///
/// - ICONE = tipo de veiculo (carro ou moto).
/// - COR = tipo de servico: passageiro mantem as cores de sempre (verde livre,
///   laranja em corrida, cinza offline, dourado esperando); entrega do Comercio e
///   azul-ciano (exclusivo); SOS e vermelho e vence qualquer servico.
/// - Nunca so a cor: o selo no canto do pino e o texto da legenda/detalhes
///   dizem o mesmo (caixa = Comercio, pessoa = passageiro, SOS = socorro).
/// - O tipo de servico vem do servidor (campo `servico`), nunca de palavra na descricao.

/// Cinza do carro offline (ultima posicao conhecida).
const Color cinzaOffline = Color(0xFF8E8E93);

/// Selo (canto do pino) de cada servico.
const IconData seloComercio = Icons.inventory_2;
const IconData seloPassageiro = Icons.person;
const IconData seloSos = Icons.sos;

enum EstadoNoMapa { livre, offline, passageiro, comercio, sos }

/// O estado visual do veiculo. SOS vence tudo (inclusive entrega); offline vence o servico
/// (o carro sumiu: fica cinza na ultima posicao, com o selo do que fazia).
EstadoNoMapa estadoDoVeiculo(MotoristaOnline m) {
  if (m.sos) return EstadoNoMapa.sos;
  if (!m.online) return EstadoNoMapa.offline;
  if (!m.ocupado) return EstadoNoMapa.livre;
  return m.servico == 'COMERCIO' ? EstadoNoMapa.comercio : EstadoNoMapa.passageiro;
}

Color corDoEstado(EstadoNoMapa e) => switch (e) {
      EstadoNoMapa.livre => AppColors.success,
      EstadoNoMapa.offline => cinzaOffline,
      EstadoNoMapa.passageiro => AppColors.warning,
      EstadoNoMapa.comercio => AppColors.comercio,
      EstadoNoMapa.sos => AppColors.danger,
    };

/// Icone do veiculo: moto ou carro (o tipo de servico nunca troca o icone).
IconData iconeDoVeiculo(MotoristaOnline m) => m.moto ? Icons.two_wheeler : Icons.local_taxi;

/// Selo no canto do pino (null = sem selo): SOS > Comercio > passageiro em corrida.
IconData? seloDoVeiculo(MotoristaOnline m) {
  if (m.sos) return seloSos;
  if (m.servico == 'COMERCIO') return seloComercio;
  if (m.ocupado && m.online) return seloPassageiro;
  return null;
}

/// Cor do selo (o selo do Comercio fica ciano mesmo com o carro offline cinza).
Color corDoSelo(MotoristaOnline m) {
  if (m.sos) return AppColors.danger;
  if (m.servico == 'COMERCIO') return AppColors.comercio;
  return AppColors.warning;
}

String rotuloDoVeiculo(MotoristaOnline m) => m.moto ? 'Moto' : 'Carro';

/// Servico em texto, para o detalhe do veiculo e das listas.
String rotuloDoServico(String? servico, {String? origem}) {
  switch (servico) {
    case 'COMERCIO':
      return origem == 'MOTORISTA' ? 'Entrega do Comércio (lançada pelo motorista)' : 'Entrega do Comércio';
    case 'ENTREGA':
      return 'Entrega (aplicativo do passageiro)';
    case 'PASSAGEIRO':
      return 'Transporte de passageiro';
    default:
      return 'Nenhum';
  }
}

String rotuloDaOrigem(String? origem) => switch (origem) {
      'MOTORISTA' => 'Lançada manualmente pelo motorista',
      'APP' => 'Pedida pelo aplicativo do estabelecimento',
      _ => '-',
    };

/// Estado em texto (o mesmo que a cor diz).
String rotuloDoEstado(MotoristaOnline m, {String vistoHa = ''}) => switch (estadoDoVeiculo(m)) {
      EstadoNoMapa.sos => 'SOS aberto',
      EstadoNoMapa.offline => 'Offline$vistoHa',
      EstadoNoMapa.livre => 'Livre',
      EstadoNoMapa.comercio => 'Em entrega do Comércio',
      EstadoNoMapa.passageiro => m.servico == 'ENTREGA' ? 'Em entrega' : 'Em corrida',
    };

// ---------------------------------------------------------------- filtros

/// Filtros discretos do mapa. Mudam so o que e DESENHADO: despacho, localizacao
/// e seguranca (SOS) nunca dependem deles.
enum FiltroDoMapa { todos, carros, motos, passageiros, comercio, livres, sos }

String rotuloDoFiltro(FiltroDoMapa f) => switch (f) {
      FiltroDoMapa.todos => 'Todos',
      FiltroDoMapa.carros => 'Carros',
      FiltroDoMapa.motos => 'Motocicletas',
      FiltroDoMapa.passageiros => 'Transporte de passageiros',
      FiltroDoMapa.comercio => 'Entregas do Comércio',
      FiltroDoMapa.livres => 'Veículos livres',
      FiltroDoMapa.sos => 'SOS',
    };

bool veiculoPassaNoFiltro(MotoristaOnline m, FiltroDoMapa f) => switch (f) {
      FiltroDoMapa.todos => true,
      FiltroDoMapa.carros => !m.moto,
      FiltroDoMapa.motos => m.moto,
      FiltroDoMapa.passageiros => m.ocupado && m.servico != 'COMERCIO' && m.servico != 'ENTREGA',
      FiltroDoMapa.comercio => m.servico == 'COMERCIO',
      FiltroDoMapa.livres => m.online && !m.ocupado && !m.sos,
      FiltroDoMapa.sos => m.sos,
    };

/// Corrida esperando motorista (pino dourado, ou ciano se for do Comercio).
bool corridaPassaNoFiltro(CorridaAtiva c, FiltroDoMapa f) => switch (f) {
      FiltroDoMapa.todos => true,
      FiltroDoMapa.carros => !c.categoria.toUpperCase().contains('MOTO'),
      FiltroDoMapa.motos => c.categoria.toUpperCase().contains('MOTO'),
      FiltroDoMapa.passageiros => c.servico == 'PASSAGEIRO',
      FiltroDoMapa.comercio => c.servico == 'COMERCIO',
      FiltroDoMapa.livres || FiltroDoMapa.sos => false,
    };

int contarNoFiltro(Iterable<MotoristaOnline> veiculos, FiltroDoMapa f) =>
    veiculos.where((m) => m.posicao != null && veiculoPassaNoFiltro(m, f)).length;

// ---------------------------------------------------------------- widgets

/// Barra de filtros discreta, em cima do mapa (desliza de lado no celular).
class BarraDeFiltrosDoMapa extends StatelessWidget {
  const BarraDeFiltrosDoMapa({super.key, required this.atual, required this.aoEscolher, required this.contagens});

  final FiltroDoMapa atual;
  final ValueChanged<FiltroDoMapa> aoEscolher;
  final Map<FiltroDoMapa, int> contagens;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          for (final f in FiltroDoMapa.values)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _Ficha(
                texto: f == FiltroDoMapa.todos ? rotuloDoFiltro(f) : '${rotuloDoFiltro(f)} (${contagens[f] ?? 0})',
                ativo: f == atual,
                cor: switch (f) {
                  FiltroDoMapa.comercio => AppColors.comercio,
                  FiltroDoMapa.sos => AppColors.danger,
                  _ => AppColors.primary,
                },
                // Sem icone de carro/moto/SOS aqui: esses ficam so no mapa (um pino = um icone).
                icone: switch (f) {
                  FiltroDoMapa.comercio => seloComercio,
                  FiltroDoMapa.sos => Icons.warning_amber_rounded,
                  _ => null,
                },
                aoToque: () => aoEscolher(f),
              ),
            ),
        ],
      ),
    );
  }
}

class _Ficha extends StatelessWidget {
  const _Ficha({required this.texto, required this.ativo, required this.cor, required this.aoToque, this.icone});

  final String texto;
  final bool ativo;
  final Color cor;
  final IconData? icone;
  final VoidCallback aoToque;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: ativo,
      label: 'Filtro $texto',
      child: GestureDetector(
        onTap: aoToque,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            color: ativo ? cor : AppColors.surface.withValues(alpha: 0.94),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: ativo ? cor : AppColors.border),
          ),
          alignment: Alignment.center,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icone != null) ...[
                Icon(icone, size: 14, color: ativo ? AppColors.onPrimary : cor),
                const SizedBox(width: 4),
              ],
              Text(
                texto,
                style: AppText.caption.copyWith(
                  color: ativo ? AppColors.onPrimary : AppColors.text,
                  fontWeight: ativo ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Pino de um veiculo no mapa: cor do estado + icone carro/moto + selo do servico.
class PinoDoVeiculo extends StatelessWidget {
  const PinoDoVeiculo({super.key, required this.veiculo});

  final MotoristaOnline veiculo;

  @override
  Widget build(BuildContext context) {
    final cor = corDoEstado(estadoDoVeiculo(veiculo));
    final selo = seloDoVeiculo(veiculo);
    return Semantics(
      label: '${rotuloDoVeiculo(veiculo)} ${veiculo.nome}: ${rotuloDoEstado(veiculo)}',
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                color: cor,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
                boxShadow: const [BoxShadow(color: Color(0x55000000), blurRadius: 6, offset: Offset(0, 2))],
              ),
              alignment: Alignment.center,
              child: Icon(iconeDoVeiculo(veiculo), color: Colors.white, size: 20),
            ),
          ),
          if (selo != null)
            Positioned(
              right: -3,
              top: -3,
              child: Container(
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  color: corDoSelo(veiculo),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 1.5),
                ),
                alignment: Alignment.center,
                child: Icon(selo, color: Colors.white, size: 11),
              ),
            ),
        ],
      ),
    );
  }
}

/// Item da legenda: bolinha de cor (+ icone do selo quando existe) e o texto.
class ItemDaLegenda extends StatelessWidget {
  const ItemDaLegenda({super.key, required this.cor, required this.texto, this.selo});

  final Color cor;
  final String texto;
  final IconData? selo;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: selo == null ? 10 : 14,
            height: selo == null ? 10 : 14,
            decoration: BoxDecoration(color: cor, shape: BoxShape.circle),
            alignment: Alignment.center,
            child: selo == null ? null : Icon(selo, size: 9, color: Colors.white),
          ),
          const SizedBox(width: Spacing.xs),
          Text(texto, style: AppText.caption),
        ],
      ),
    );
  }
}
