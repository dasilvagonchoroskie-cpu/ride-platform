import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/aparencia.dart';
import '../state/taximetro_state.dart';
import '../widgets/ui.dart';

/// Escolha de tema e tamanho de fonte (tela de aparencia do original).
class AparenciaScreen extends StatelessWidget {
  const AparenciaScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<TaximetroState>();
    final t = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Aparencia')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Painel(
                titulo: 'TEMA',
                child: Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    for (final tema in temas)
                      GestureDetector(
                        onTap: () {
                          s.aparencia.tema = tema.nome;
                          s.gravarAparencia();
                        },
                        child: Column(
                          children: [
                            Container(
                              height: 56,
                              width: 56,
                              decoration: BoxDecoration(
                                color: tema.fundo,
                                border: Border.all(
                                  color: s.aparencia.tema == tema.nome ? t.colorScheme.primary : t.dividerColor,
                                  width: s.aparencia.tema == tema.nome ? 3 : 1,
                                ),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Center(
                                child: Container(
                                  height: 22,
                                  width: 22,
                                  decoration: BoxDecoration(
                                    color: tema.destaque,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              tema.rotulo,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: s.aparencia.tema == tema.nome ? FontWeight.w700 : FontWeight.w400,
                                color: s.aparencia.tema == tema.nome ? t.colorScheme.primary : t.colorScheme.onSurface.withValues(alpha: 0.7),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Painel(
                titulo: 'TAMANHO DA FONTE DO MEDIDOR',
                child: SeletorOpcoes<EscalaFonte>(
                  opcoes: fontes,
                  rotulo: (f) => f.rotulo,
                  selecionado: fontePorNome(s.aparencia.fonte),
                  onSelecionar: (f) {
                    s.aparencia.fonte = f.nome;
                    s.gravarAparencia();
                  },
                ),
              ),
              const SizedBox(height: 14),
              Painel(
                titulo: 'PREVIA',
                child: Column(
                  children: [
                    Text(
                      'R\$ 42,75',
                      style: TextStyle(
                        fontSize: 44 * fontePorNome(s.aparencia.fonte).fator,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -1.5,
                        color: t.colorScheme.primary,
                      ),
                    ),
                    Text(
                      '12,4 km - 00:24:18',
                      style: TextStyle(
                        fontSize: 14 * fontePorNome(s.aparencia.fonte).fator,
                        color: t.colorScheme.onSurface.withValues(alpha: 0.7),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}
