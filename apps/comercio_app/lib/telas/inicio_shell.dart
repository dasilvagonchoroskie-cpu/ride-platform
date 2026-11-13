import 'package:flutter/material.dart';

import '../core/tema.dart';
import '../estado/escopo.dart';
import '../widgets/sino_de_avisos.dart';
import 'conta_aba.dart';
import 'gastos_aba.dart';
import 'historico_aba.dart';
import 'inicio_aba.dart';
import 'nova_entrega_tela.dart';

/// Casca do app depois de aprovado: Inicio, Historico, Gastos e Conta.
class InicioShell extends StatefulWidget {
  const InicioShell({super.key});

  @override
  State<InicioShell> createState() => _InicioShellState();
}

class _InicioShellState extends State<InicioShell> {
  int _aba = 0;

  /// Muda a cada volta de uma tela; as abas recarregam quando a chave muda.
  int _versao = 0;

  Future<void> _nova() async {
    final sessao = EscopoSessao.ler(context);
    // A Central pode ter liberado (ou suspendido) depois que o app abriu: confere no servidor
    // antes de dizer "ainda nao liberado". Sem rede, vale o que o app ja sabia.
    await sessao.atualizar();
    if (!mounted) return;
    final loja = sessao.estabelecimento;
    if (loja == null || !loja.aprovado) return; // a tela de situacao assume
    if (!loja.entregasLiberadas) {
      await showDialog<void>(
        context: context,
        builder: (d) => AlertDialog(
          title: const Text('Entregas ainda não liberadas'),
          content: const Text('Seu cadastro está aprovado, mas a Central ainda não liberou os pedidos de entrega pelo aplicativo. Assim que liberar, o botão "Nova entrega" passa a funcionar.'),
          actions: [TextButton(onPressed: () => Navigator.of(d).pop(), child: const Text('Entendi'))],
        ),
      );
      return;
    }
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NovaEntregaTela()));
    if (mounted) setState(() => _versao += 1);
  }

  @override
  Widget build(BuildContext context) {
    // Monta so a aba aberta: as outras nao ficam consultando o servidor escondidas.
    final aba = switch (_aba) {
      0 => InicioAba(key: ValueKey('inicio$_versao'), aoNovaEntrega: _nova),
      1 => HistoricoAba(key: ValueKey('hist$_versao')),
      2 => GastosAba(key: ValueKey('gastos$_versao')),
      _ => const ContaAba(),
    };
    return Scaffold(
      appBar: AppBar(
        title: const Text('Fortaleza Move Comércio', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
        actions: const [SinoDeAvisos()],
      ),
      body: SafeArea(child: aba),
      floatingActionButton: _aba <= 1
          ? FloatingActionButton.extended(
              onPressed: _nova,
              backgroundColor: Cores.ouro,
              foregroundColor: Cores.sobreOuro,
              icon: const Icon(Icons.add),
              label: const Text('Nova entrega', style: TextStyle(fontWeight: FontWeight.w700)),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _aba,
        onDestinationSelected: (i) => setState(() {
          _aba = i;
          if (i != 3) _versao += 1;
        }),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.local_shipping_outlined), selectedIcon: Icon(Icons.local_shipping), label: 'Entregas'),
          NavigationDestination(icon: Icon(Icons.history), label: 'Histórico'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Gastos'),
          NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: 'Conta'),
        ],
      ),
    );
  }
}
