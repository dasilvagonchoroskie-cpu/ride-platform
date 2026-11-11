import 'package:flutter/material.dart';

import '../core/ajustes_aparelho.dart';
import '../core/permissoes_nativas.dart';
import '../core/storage/app_storage.dart';

class ItemPermissao {
  const ItemPermissao(this.chave, this.titulo, this.porque, {this.obrigatoria = true});
  final String chave;
  final String titulo;
  final String porque;
  final bool obrigatoria;
}

/// Autorizacoes do Android que o passageiro precisa (as do fabricante vem a
/// parte, de acordo com o celular).
const itensDoPassageiro = [
  ItemPermissao('localizacao', 'Localização',
      'Para achar você no mapa e o motorista saber onde buscar. Usada só com o aplicativo aberto; '
      'durante a corrida, o motorista vê o ponto de embarque, não a sua localização ao vivo.'),
  ItemPermissao('gps', 'GPS do celular ligado', 'Sem o GPS ligado o celular não sabe onde você está.'),
  ItemPermissao('notificacao', 'Notificações', 'Para avisar quando o motorista aceitar e quando ele chegar.',
      obrigatoria: false),
  ItemPermissao('bateria', 'Bateria sem restrição',
      'Para o aviso "motorista chegou" tocar mesmo com o aplicativo minimizado. Na tela que abrir, toque em Bateria '
      'e escolha "Sem restrições".',
      obrigatoria: false),
];

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
  Map<String, dynamic> _perfil = const {};
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
    _perfil = await PermissoesNativas.aparelho();
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

    return Scaffold(
      appBar: AppBar(title: const Text('Autorizações'), automaticallyImplyLeading: false),
      body: ConteudoAutorizacoes(
        itens: widget.itens,
        estado: e,
        perfil: _perfil,
        aoMudar: (chave, sim) => setState(() => _estado = {...e, 'x_$chave': sim}),
        rodape: [
          FilledButton(
            onPressed: ok ? _continuar : null,
            child: Text(ok ? 'Continuar' : 'Libere as obrigatórias para continuar'),
          ),
        ],
      ),
    );
  }
}

/// Pelo menu (Conta → Autorizações do celular): confere e refaz quando quiser.
class AutorizacoesScreen extends StatefulWidget {
  const AutorizacoesScreen({super.key, this.estadoDeTeste, this.perfilDeTeste});

  /// Testes: estado e celular sem passar pelo Android.
  final Map<String, bool>? estadoDeTeste;
  final Map<String, dynamic>? perfilDeTeste;

  @override
  State<AutorizacoesScreen> createState() => _AutorizacoesScreenState();
}

class _AutorizacoesScreenState extends State<AutorizacoesScreen> with WidgetsBindingObserver {
  Map<String, bool>? _estado;
  Map<String, dynamic> _perfil = const {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _estado = widget.estadoDeTeste;
    _perfil = widget.perfilDeTeste ?? const {};
    if (widget.estadoDeTeste == null) _carregar();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && widget.estadoDeTeste == null) _carregar();
  }

  Future<void> _carregar() async {
    final perfil = _perfil.isEmpty ? await PermissoesNativas.aparelho() : _perfil;
    final e = await PermissoesNativas.estado();
    if (!mounted) return;
    setState(() {
      _perfil = perfil;
      _estado = e;
    });
  }

  @override
  Widget build(BuildContext context) {
    final e = _estado;
    return Scaffold(
      appBar: AppBar(title: const Text('Autorizações do celular')),
      body: e == null
          ? const Center(child: CircularProgressIndicator())
          : ConteudoAutorizacoes(
              itens: itensDoPassageiro,
              estado: e,
              perfil: _perfil,
              aoMudar: (chave, sim) => setState(() => _estado = {...e, 'x_$chave': sim}),
            ),
    );
  }
}

/// Lista das autorizacoes do Android + os ajustes do fabricante do celular.
class ConteudoAutorizacoes extends StatelessWidget {
  const ConteudoAutorizacoes({
    super.key,
    required this.itens,
    required this.estado,
    required this.perfil,
    required this.aoMudar,
    this.rodape = const [],
  });

  final List<ItemPermissao> itens;
  final Map<String, bool> estado;
  final Map<String, dynamic> perfil;
  final void Function(String chave, bool sim) aoMudar;
  final List<Widget> rodape;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final familia = (perfil['familia'] ?? '').toString();
    final extras = ((perfil['extras'] as List?) ?? const []).map((e) => e.toString()).toList();
    final ajustes = ajustesDoAparelho(familia, extras);
    final nome = nomeDoAparelho(perfil);
    // Xiaomi: a bateria do Android e coberta pelo ajuste da Xiaomi.
    final lista = [for (final i in itens) if (!(familia == 'xiaomi' && i.chave == 'bateria')) i];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'Para o aplicativo funcionar direito, ele precisa das autorizações '
          'abaixo. Toque em cada uma para liberar.',
          style: tema.textTheme.bodyMedium,
        ),
        if (nome.isNotEmpty) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.smartphone, size: 18),
              const SizedBox(width: 6),
              Expanded(child: Text('Seu celular: $nome', key: const ValueKey('nome-aparelho'), style: tema.textTheme.bodySmall)),
            ],
          ),
        ],
        const SizedBox(height: 16),
        for (final item in lista) ...[
          _Linha(item: item, liberada: estado[item.chave] == true),
          const SizedBox(height: 12),
        ],
        if (ajustes.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text('Ajustes do seu ${marcaDaFamilia(familia)}', style: tema.textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            'Recomendados: este celular tem ajustes próprios que fecham o aplicativo minimizado e o aviso do motorista '
            'pode não tocar. Abra cada um, deixe como está explicado e toque em "Já fiz".',
            style: tema.textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          for (final a in ajustes) ...[
            _LinhaFabricante(ajuste: a, feito: estado['x_${a.chave}'] == true, aoMudar: aoMudar),
            const SizedBox(height: 12),
          ],
        ],
        const SizedBox(height: 8),
        ...rodape,
        const SizedBox(height: 8),
        TextButton(
          onPressed: () => PermissoesNativas.pedir('ajustes'),
          child: const Text('Abrir ajustes do aplicativo'),
        ),
      ],
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

/// Ajuste do fabricante: abre a tela certa e a pessoa confirma.
class _LinhaFabricante extends StatelessWidget {
  const _LinhaFabricante({required this.ajuste, required this.feito, required this.aoMudar});

  final AjusteAparelho ajuste;
  final bool feito;
  final void Function(String chave, bool sim) aoMudar;

  Future<void> _marcar(bool sim) async {
    await PermissoesNativas.confirmarAjuste(ajuste.chave, sim);
    aoMudar(ajuste.chave, sim);
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final cor = feito ? Colors.green : Colors.orange;
    return Card(
      key: ValueKey('ajuste-${ajuste.chave}'),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(feito ? Icons.check_circle : Icons.error_outline, color: cor),
                const SizedBox(width: 8),
                Expanded(child: Text(ajuste.titulo, style: tema.textTheme.titleMedium)),
                Text(feito ? 'feito' : 'recomendado', style: TextStyle(color: cor)),
              ],
            ),
            const SizedBox(height: 4),
            Text(ajuste.passos, style: tema.textTheme.bodySmall),
            const SizedBox(height: 12),
            if (!feito) ...[
              OutlinedButton(
                key: ValueKey('abrir-${ajuste.chave}'),
                onPressed: () => PermissoesNativas.abrirAjuste(ajuste.chave),
                child: const Text('Abrir ajuste'),
              ),
              const SizedBox(height: 8),
              TextButton(
                key: ValueKey('feito-${ajuste.chave}'),
                onPressed: () => _marcar(true),
                child: const Text('Já fiz'),
              ),
            ] else
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  key: ValueKey('refazer-${ajuste.chave}'),
                  onPressed: () async {
                    await _marcar(false);
                    await PermissoesNativas.abrirAjuste(ajuste.chave);
                  },
                  child: const Text('Conferir de novo'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
