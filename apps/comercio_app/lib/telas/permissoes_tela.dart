import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;

import 'package:flutter/material.dart';

import '../core/ajustes_aparelho.dart';
import '../core/armazenamento.dart';
import '../core/permissoes_nativas.dart';
import '../core/tema.dart';

class ItemPermissao {
  const ItemPermissao(this.chave, this.titulo, this.porque);
  final String chave;
  final String titulo;
  final String porque;
}

/// Autorizacoes do Android do Comercio: todas recomendadas, nenhuma trava o
/// aplicativo (a loja nunca fica sem poder pedir entrega por causa delas).
const itensDoComercio = [
  ItemPermissao('notificacao', 'Notificações', 'Para os avisos da entrega (motorista aceitou, chegou, entregou) aparecerem no celular.'),
  ItemPermissao('localizacao', 'Localização',
      'Só para o mapa abrir onde a loja está quando você marcar um endereço. Usada só com o aplicativo aberto; o motorista não vê a localização do seu celular.'),
  ItemPermissao('gps', 'GPS do celular ligado', 'Sem o GPS ligado o celular não sabe onde a loja está.'),
  ItemPermissao('bateria', 'Bateria sem restrição',
      'Para o alarme "motorista chegou" tocar sem o celular fechar o aplicativo. Na tela que abrir, toque em Bateria e escolha "Sem restrições".'),
];

/// Primeira abertura (depois dos termos): mostra as autorizacoes uma vez e
/// deixa seguir. So no Android; no computador e nos testes passa direto.
class PortaoPermissoes extends StatefulWidget {
  const PortaoPermissoes({super.key, required this.child, this.forcarAndroid = false});

  final Widget child;

  /// Testes.
  final bool forcarAndroid;

  @override
  State<PortaoPermissoes> createState() => _PortaoPermissoesState();
}

class _PortaoPermissoesState extends State<PortaoPermissoes> {
  static const _chaveVista = 'comercio.permissoes_vistas';
  bool? _jaVista;

  bool get _ativo => widget.forcarAndroid || (!kIsWeb && Platform.isAndroid);

  @override
  void initState() {
    super.initState();
    if (_ativo) {
      Armazenamento.atual.ler(_chaveVista).then((v) {
        if (mounted) setState(() => _jaVista = v == '1');
      });
    }
  }

  Future<void> _continuar() async {
    await Armazenamento.atual.gravar(_chaveVista, '1');
    if (mounted) setState(() => _jaVista = true);
  }

  @override
  Widget build(BuildContext context) {
    if (!_ativo) return widget.child;
    final vista = _jaVista;
    if (vista == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (vista) return widget.child;
    return Scaffold(
      appBar: AppBar(title: const Text('Autorizações do celular'), automaticallyImplyLeading: false),
      body: ConteudoAutorizacoes(
        rodape: [
          FilledButton(key: const ValueKey('continuar-permissoes'), onPressed: _continuar, child: const Text('Continuar')),
          const SizedBox(height: 4),
          const Text('Nada aqui impede de usar o aplicativo. Você pode mudar depois em Conta → Autorizações do celular.',
              textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Cores.textoSuave)),
        ],
      ),
    );
  }
}

/// Pelo menu (Conta → Autorizações do celular): confere e refaz quando quiser.
class AutorizacoesTela extends StatelessWidget {
  const AutorizacoesTela({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Autorizações do celular')),
      body: const ConteudoAutorizacoes(),
    );
  }
}

/// Lista das autorizacoes do Android + os ajustes do fabricante do celular.
class ConteudoAutorizacoes extends StatefulWidget {
  const ConteudoAutorizacoes({super.key, this.rodape = const [], this.estadoDeTeste, this.perfilDeTeste});

  final List<Widget> rodape;

  /// Testes: estado e celular sem passar pelo Android.
  final Map<String, bool>? estadoDeTeste;
  final Map<String, dynamic>? perfilDeTeste;

  @override
  State<ConteudoAutorizacoes> createState() => _ConteudoAutorizacoesState();
}

class _ConteudoAutorizacoesState extends State<ConteudoAutorizacoes> with WidgetsBindingObserver {
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
    // Voltou dos ajustes do Android: confere o que mudou.
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
    if (e == null) return const Center(child: CircularProgressIndicator());
    final familia = (_perfil['familia'] ?? '').toString();
    final extras = ((_perfil['extras'] as List?) ?? const []).map((x) => x.toString()).toList();
    final ajustes = ajustesDoAparelho(familia, extras);
    final nome = nomeDoAparelho(_perfil);
    // Xiaomi: a bateria do Android e coberta pelo ajuste da Xiaomi.
    final lista = [for (final i in itensDoComercio) if (!(familia == 'xiaomi' && i.chave == 'bateria')) i];
    final tema = Theme.of(context);
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewPaddingOf(context).bottom),
      children: [
        Text('Para o aplicativo funcionar direito, ele pede as autorizações abaixo. Toque em cada uma para liberar.', style: tema.textTheme.bodyMedium),
        if (nome.isNotEmpty) ...[
          const SizedBox(height: 8),
          Row(children: [
            const Icon(Icons.smartphone, size: 18),
            const SizedBox(width: 6),
            Expanded(child: Text('Seu celular: $nome', key: const ValueKey('nome-aparelho'), style: tema.textTheme.bodySmall)),
          ]),
        ],
        const SizedBox(height: 16),
        for (final item in lista) ...[
          _Linha(item: item, liberada: e[item.chave] == true),
          const SizedBox(height: 12),
        ],
        if (ajustes.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text('Ajustes do seu ${marcaDaFamilia(familia)}', style: tema.textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            'Recomendados: este celular tem ajustes próprios que fecham o aplicativo minimizado e o alarme do motorista pode não tocar. Abra cada um, deixe como está explicado e toque em "Já fiz".',
            style: tema.textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          for (final a in ajustes) ...[
            _LinhaFabricante(ajuste: a, feito: e['x_${a.chave}'] == true, aoMudar: (chave, sim) => setState(() => _estado = {...e, 'x_$chave': sim})),
            const SizedBox(height: 12),
          ],
        ],
        const SizedBox(height: 8),
        ...widget.rodape,
        const SizedBox(height: 8),
        TextButton(onPressed: () => PermissoesNativas.pedir('ajustes'), child: const Text('Abrir ajustes do aplicativo')),
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
    final cor = liberada ? Colors.green : Colors.orange;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Icon(liberada ? Icons.check_circle : Icons.error_outline, color: cor),
            const SizedBox(width: 8),
            Expanded(child: Text(item.titulo, style: tema.textTheme.titleMedium)),
            Text(liberada ? 'liberada' : 'recomendada', style: TextStyle(color: cor)),
          ]),
          const SizedBox(height: 4),
          Text(item.porque, style: tema.textTheme.bodySmall),
          if (!liberada) ...[
            const SizedBox(height: 12),
            OutlinedButton(key: ValueKey('liberar-${item.chave}'), onPressed: () => PermissoesNativas.pedir(item.chave), child: const Text('Liberar')),
          ],
        ]),
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
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Icon(feito ? Icons.check_circle : Icons.error_outline, color: cor),
            const SizedBox(width: 8),
            Expanded(child: Text(ajuste.titulo, style: tema.textTheme.titleMedium)),
            Text(feito ? 'feito' : 'recomendado', style: TextStyle(color: cor)),
          ]),
          const SizedBox(height: 4),
          Text(ajuste.passos, style: tema.textTheme.bodySmall),
          const SizedBox(height: 12),
          if (!feito) ...[
            OutlinedButton(key: ValueKey('abrir-${ajuste.chave}'), onPressed: () => PermissoesNativas.abrirAjuste(ajuste.chave), child: const Text('Abrir ajuste')),
            const SizedBox(height: 8),
            TextButton(key: ValueKey('feito-${ajuste.chave}'), onPressed: () => _marcar(true), child: const Text('Já fiz')),
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
        ]),
      ),
    );
  }
}
