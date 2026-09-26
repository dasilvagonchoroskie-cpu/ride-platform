import 'package:flutter/material.dart';

import '../core/permissoes_nativas.dart';
import '../core/storage/app_storage.dart';

class ItemPermissao {
  const ItemPermissao(this.chave, this.titulo, this.porque, {this.obrigatoria = true});
  final String chave;
  final String titulo;
  final String porque;
  final bool obrigatoria;
}

/// Primeira tela ao instalar: pede as autorizacoes do Android explicando o
/// porque de cada uma. Some quando as obrigatorias estao liberadas e a
/// pessoa ja passou por aqui uma vez — e volta se alguma obrigatoria for
/// retirada depois nos ajustes do celular.
class PortaoPermissoes extends StatefulWidget {
  const PortaoPermissoes({
    super.key,
    required this.itens,
    required this.child,
    this.aoLiberar,
  });

  final List<ItemPermissao> itens;
  final Widget child;

  /// Chamado sempre que as obrigatorias estao liberadas.
  final VoidCallback? aoLiberar;

  @override
  State<PortaoPermissoes> createState() => _PortaoPermissoesState();
}

class _PortaoPermissoesState extends State<PortaoPermissoes> with WidgetsBindingObserver {
  static const _chaveVista = 'autorizacoes.vistas';
  Map<String, bool>? _estado;
  bool _jaVista = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _iniciar();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Voltou dos ajustes do Android: confere o que mudou.
    if (state == AppLifecycleState.resumed) _conferir();
  }

  Future<void> _iniciar() async {
    _jaVista = await AppStorage.read(_chaveVista) == '1';
    await _conferir();
  }

  Future<void> _conferir() async {
    final e = await PermissoesNativas.estado();
    if (!mounted) return;
    setState(() => _estado = e);
    if (_obrigatoriasOk(e)) widget.aoLiberar?.call();
  }

  bool _obrigatoriasOk(Map<String, bool> e) =>
      widget.itens.where((i) => i.obrigatoria).every((i) => e[i.chave] == true);

  Future<void> _continuar() async {
    await AppStorage.write(_chaveVista, '1');
    setState(() => _jaVista = true);
  }

  @override
  Widget build(BuildContext context) {
    final e = _estado;
    if (e == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final ok = _obrigatoriasOk(e);
    if (ok && _jaVista) return widget.child;

    final tema = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Autorizações'), automaticallyImplyLeading: false),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Para o aplicativo funcionar direito, ele precisa das autorizações '
            'abaixo. Toque em cada uma para liberar.',
            style: tema.textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          for (final item in widget.itens) ...[
            _Linha(item: item, liberada: e[item.chave] == true),
            const SizedBox(height: 12),
          ],
          const SizedBox(height: 8),
          FilledButton(
            onPressed: ok ? _continuar : null,
            child: Text(ok ? 'Continuar' : 'Libere as obrigatórias para continuar'),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => PermissoesNativas.pedir('ajustes'),
            child: const Text('Abrir ajustes do aplicativo'),
          ),
        ],
      ),
    );
  }
}

class _Linha extends StatelessWidget {
  const _Linha({required this.item, required this.liberada});

  final ItemPermissao item;
  final bool liberada;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final cor = liberada
        ? Colors.green
        : (item.obrigatoria ? tema.colorScheme.error : Colors.orange);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(liberada ? Icons.check_circle : Icons.error_outline, color: cor),
                const SizedBox(width: 8),
                Expanded(child: Text(item.titulo, style: tema.textTheme.titleMedium)),
                Text(
                  liberada ? 'liberada' : (item.obrigatoria ? 'obrigatória' : 'recomendada'),
                  style: TextStyle(color: cor),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(item.porque, style: tema.textTheme.bodySmall),
            if (!liberada) ...[
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => PermissoesNativas.pedir(item.chave),
                child: const Text('Liberar'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
