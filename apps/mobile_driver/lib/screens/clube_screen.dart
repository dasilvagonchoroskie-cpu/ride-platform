import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/config/app_config.dart';
import '../core/fotos.dart';
import '../core/mapa/map_provider.dart';
import '../core/marca.dart';
import '../core/storage/app_storage.dart';
import '../core/theme/app_theme.dart';
import '../state/driver_state.dart';

/// Clube de Vantagens Fortaleza Move (Evandro, 05/11/2026): os
/// estabelecimentos parceiros que a Central cadastrou e a identificacao
/// digital do motorista. O motorista so consulta; tudo vem do servidor.

String _txt(Object? v) => v == null ? '' : '$v';

class BeneficioClube {
  const BeneficioClube({required this.titulo, this.descricao = '', this.condicoes = ''});

  final String titulo;
  final String descricao;
  final String condicoes;

  factory BeneficioClube.fromJson(Map<String, dynamic> j) =>
      BeneficioClube(titulo: _txt(j['titulo']), descricao: _txt(j['descricao']), condicoes: _txt(j['condicoes']));
}

class ParceiroClube {
  const ParceiroClube({
    required this.id,
    required this.nome,
    required this.categoria,
    this.descricao = '',
    this.endereco = '',
    this.latitude,
    this.longitude,
    this.telefone,
    this.whatsapp,
    this.horario = '',
    this.vantagens = '',
    this.condicoes = '',
    this.logoUrl,
    this.beneficios = const [],
  });

  final String id;
  final String nome;
  final String categoria;
  final String descricao;
  final String endereco;
  final double? latitude;
  final double? longitude;
  final String? telefone;
  final String? whatsapp;
  final String horario;
  final String vantagens;
  final String condicoes;
  final String? logoUrl;
  final List<BeneficioClube> beneficios;

  factory ParceiroClube.fromJson(Map<String, dynamic> j) => ParceiroClube(
        id: _txt(j['id']),
        nome: _txt(j['nome']),
        categoria: _txt(j['categoria']),
        descricao: _txt(j['descricao']),
        endereco: _txt(j['endereco']),
        latitude: (j['latitude'] as num?)?.toDouble(),
        longitude: (j['longitude'] as num?)?.toDouble(),
        telefone: (j['telefone'] as String?)?.isEmpty == true ? null : j['telefone'] as String?,
        whatsapp: (j['whatsapp'] as String?)?.isEmpty == true ? null : j['whatsapp'] as String?,
        horario: _txt(j['horario']),
        vantagens: _txt(j['vantagens']),
        condicoes: _txt(j['condicoes']),
        logoUrl: j['logoUrl'] as String?,
        beneficios: [
          for (final b in (j['beneficios'] as List<dynamic>? ?? const [])) BeneficioClube.fromJson(b as Map<String, dynamic>),
        ],
      );
}

class Carteirinha {
  const Carteirinha({
    required this.nome,
    this.fotoUrl,
    required this.codigo,
    required this.situacao,
    required this.situacaoTexto,
    required this.motivo,
    this.atualizadoEm,
    this.validoAte,
    required this.conferidoEm,
  });

  final String nome;

  /// Foto do perfil do motorista (a mesma do cadastro).
  final String? fotoUrl;
  final String codigo;

  /// APTO ou NAO_APTO (calculado no servidor).
  final String situacao;
  final String situacaoTexto;
  final String motivo;

  /// Quando a situacao mudou pela ultima vez (null = nunca teve recarga valida).
  final DateTime? atualizadoEm;
  final DateTime? validoAte;
  final DateTime conferidoEm;

  bool get apto => situacao == 'APTO';

  static DateTime? _data(Object? v) => DateTime.tryParse(_txt(v))?.toLocal();

  factory Carteirinha.fromJson(Map<String, dynamic> j) => Carteirinha(
        nome: _txt(j['nome']),
        fotoUrl: (j['fotoUrl'] as String?)?.isEmpty == true ? null : j['fotoUrl'] as String?,
        codigo: _txt(j['codigo']),
        situacao: _txt(j['situacao']),
        situacaoTexto: _txt(j['situacaoTexto']),
        motivo: _txt(j['motivo']),
        atualizadoEm: _data(j['atualizadoEm']),
        validoAte: _data(j['validoAte']),
        conferidoEm: _data(j['conferidoEm']) ?? DateTime.now(),
      );
}

class ClubeApi {
  const ClubeApi(this._c);

  final ApiClient _c;

  Future<List<ParceiroClube>> parceiros() async {
    final d = await _c.request('GET', '/clube/parceiros');
    return [for (final j in (d is List ? d : const [])) if (j is Map<String, dynamic>) ParceiroClube.fromJson(j)];
  }

  Future<ParceiroClube> parceiro(String id) async => ParceiroClube.fromJson(await _c.request('GET', '/clube/parceiros/$id') as Map<String, dynamic>);

  Future<Carteirinha> carteirinha() async => Carteirinha.fromJson(await _c.request('GET', '/clube/carteirinha') as Map<String, dynamic>);
}

String _mensagem(Object e) {
  if (e is ApiException) return e.message;
  return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
}

/// "5585999990000" -> "(85) 99999-0000".
String telefoneDoClube(String t) {
  final d = t.replaceAll(RegExp(r'\D'), '');
  final n = d.startsWith('55') && d.length > 11 ? d.substring(2) : d;
  if (n.length == 11) return '(${n.substring(0, 2)}) ${n.substring(2, 7)}-${n.substring(7)}';
  if (n.length == 10) return '(${n.substring(0, 2)}) ${n.substring(2, 6)}-${n.substring(6)}';
  return t;
}

Future<void> _abrir(String url, String falhou) async {
  final ok = await abrirLink(url);
  if (!ok) avisar(falhou);
}

Future<void> abrirMapaDoParceiro(ParceiroClube p) async {
  final ok = await abrirNoGoogleMaps(latitude: p.latitude, longitude: p.longitude, endereco: p.endereco);
  if (!ok) avisar('Não foi possível abrir o mapa.');
}

Future<void> abrirWhatsAppDoParceiro(ParceiroClube p) => _abrir(
      'https://wa.me/${p.whatsapp!.replaceAll(RegExp(r'\D'), '')}?text=${Uri.encodeComponent('Olá! Sou motorista parceiro da ${Marca.nome} e vi a vantagem de vocês no Clube de Vantagens.')}',
      'Não foi possível abrir o WhatsApp.',
    );

Future<void> ligarParaParceiro(ParceiroClube p) =>
    _abrir('tel:+${p.telefone!.replaceAll(RegExp(r'\D'), '')}', 'Não foi possível abrir o telefone.');

class _Logo extends StatelessWidget {
  const _Logo({required this.url, this.tamanho = 56});

  final String? url;
  final double tamanho;

  @override
  Widget build(BuildContext context) {
    final reserva = Container(
      width: tamanho,
      height: tamanho,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: AppColors.brandSoft, borderRadius: BorderRadius.circular(Radii.md)),
      child: Icon(Icons.storefront_outlined, color: AppColors.brand, size: tamanho * 0.5),
    );
    if (url == null || url!.isEmpty) return reserva;
    return FutureBuilder<String?>(
      future: AppStorage.read(AppStorage.accessToken),
      builder: (context, t) => ClipRRect(
        borderRadius: BorderRadius.circular(Radii.md),
        child: Image.network(
          url!.startsWith('http') ? url! : '${AppConfig.apiUrl}/api$url',
          width: tamanho,
          height: tamanho,
          fit: BoxFit.cover,
          headers: t.data == null ? null : {'Authorization': 'Bearer ${t.data}'},
          errorBuilder: (context, error, stack) => reserva,
        ),
      ),
    );
  }
}

class _Erro extends StatelessWidget {
  const _Erro({required this.texto, required this.tentarDeNovo});

  final String texto;
  final VoidCallback tentarDeNovo;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(Spacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off, size: 44, color: AppColors.textFaint),
              const SizedBox(height: Spacing.md),
              Text(texto, textAlign: TextAlign.center, style: AppText.body.copyWith(color: AppColors.textMuted)),
              const SizedBox(height: Spacing.md),
              OutlinedButton(onPressed: tentarDeNovo, child: const Text('Tentar de novo')),
            ],
          ),
        ),
      );
}

/// Lista dos parceiros ativos (menu "Clube de Vantagens").
class ClubeScreen extends StatefulWidget {
  const ClubeScreen({super.key});

  @override
  State<ClubeScreen> createState() => _ClubeScreenState();
}

class _ClubeScreenState extends State<ClubeScreen> {
  late final ClubeApi _api = ClubeApi(context.read<DriverState>().api);
  late Future<List<ParceiroClube>> _lista = _api.parceiros();
  String? _categoria;

  void _recarregar() => setState(() {
        _lista = _api.parceiros();
      });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Clube de Vantagens')),
      body: FutureBuilder<List<ParceiroClube>>(
        future: _lista,
        builder: (context, s) {
          if (s.hasError) return _Erro(texto: 'Não foi possível carregar o clube. ${_mensagem(s.error!)}', tentarDeNovo: _recarregar);
          if (!s.hasData) return const Center(child: CircularProgressIndicator());
          final todos = s.data!;
          final categorias = {for (final p in todos) p.categoria}.toList()..sort();
          final lista = _categoria == null ? todos : todos.where((p) => p.categoria == _categoria).toList();
          return RefreshIndicator(
            onRefresh: () async {
              _recarregar();
              await _lista.catchError((Object _) => <ParceiroClube>[]);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, Spacing.xxl),
              children: [
                _BotaoCarteirinha(onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const CarteirinhaScreen()))),
                const SizedBox(height: Spacing.lg),
                if (todos.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: Spacing.xl),
                    child: Column(
                      children: [
                        const Icon(Icons.storefront_outlined, size: 48, color: AppColors.textFaint),
                        const SizedBox(height: Spacing.md),
                        Text('Ainda não há parceiros no clube', style: AppText.heading),
                        const SizedBox(height: Spacing.xs),
                        Text(
                          'Quando a Central cadastrar os primeiros estabelecimentos, eles aparecem aqui.',
                          textAlign: TextAlign.center,
                          style: AppText.body.copyWith(color: AppColors.textMuted),
                        ),
                      ],
                    ),
                  )
                else ...[
                  Text('Parceiros', style: AppText.heading),
                  const SizedBox(height: Spacing.sm),
                  if (categorias.length > 1)
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          for (final c in [null, ...categorias])
                            Padding(
                              padding: const EdgeInsets.only(right: Spacing.xs),
                              child: ChoiceChip(
                                label: Text(c ?? 'Todos'),
                                selected: _categoria == c,
                                onSelected: (_) => setState(() => _categoria = c),
                              ),
                            ),
                        ],
                      ),
                    ),
                  const SizedBox(height: Spacing.sm),
                  for (final p in lista) _CartaoParceiro(parceiro: p),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _BotaoCarteirinha extends StatelessWidget {
  const _BotaoCarteirinha({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        borderRadius: BorderRadius.circular(Radii.lg),
        clipBehavior: Clip.antiAlias,
        child: Ink(
          decoration: const BoxDecoration(gradient: LinearGradient(colors: [AppColors.brand, AppColors.brandDark])),
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(Spacing.lg),
              child: Row(
                children: [
                  const Icon(Icons.badge_outlined, color: Colors.white, size: 32),
                  const SizedBox(width: Spacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Minha identificação', style: AppText.bodyStrong.copyWith(color: Colors.white)),
                        Text('Mostre no parceiro para usar a vantagem', style: AppText.caption.copyWith(color: Colors.white70)),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: Colors.white, size: 32),
                ],
              ),
            ),
          ),
        ),
      );
}

class _CartaoParceiro extends StatelessWidget {
  const _CartaoParceiro({required this.parceiro});

  final ParceiroClube parceiro;

  @override
  Widget build(BuildContext context) {
    final p = parceiro;
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.md),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(Radii.lg),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: ValueKey('parceiro-${p.id}'),
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ParceiroScreen(parceiro: p))),
          child: Padding(
            padding: const EdgeInsets.all(Spacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Logo(url: p.logoUrl),
                    const SizedBox(width: Spacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p.nome, style: AppText.bodyStrong, maxLines: 2, overflow: TextOverflow.ellipsis),
                          Text(p.categoria, style: AppText.caption.copyWith(color: AppColors.brand, fontWeight: FontWeight.w600)),
                          const SizedBox(height: Spacing.xs),
                          Text(p.vantagens, style: AppText.body, maxLines: 3, overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: Spacing.sm),
                Row(
                  children: [
                    const Icon(Icons.place_outlined, size: 16, color: AppColors.textMuted),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(p.endereco, style: AppText.caption.copyWith(color: AppColors.textMuted), maxLines: 2, overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
                if (p.condicoes.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text('Condições: ${p.condicoes}', style: AppText.caption.copyWith(color: AppColors.textMuted), maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
                const SizedBox(height: Spacing.sm),
                Wrap(
                  spacing: Spacing.sm,
                  runSpacing: Spacing.xs,
                  children: [
                    OutlinedButton.icon(onPressed: () => abrirMapaDoParceiro(p), icon: const Icon(Icons.map_outlined, size: 18), label: const Text('Ver no mapa')),
                    if (p.whatsapp != null)
                      FilledButton.icon(
                        style: FilledButton.styleFrom(backgroundColor: const Color(0xFF25D366)),
                        onPressed: () => abrirWhatsAppDoParceiro(p),
                        icon: const Icon(Icons.chat_outlined, size: 18),
                        label: const Text('WhatsApp'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Detalhes de um parceiro (busca de novo no servidor: mostra o que a Central
/// mudou e avisa se ele saiu do clube).
class ParceiroScreen extends StatefulWidget {
  const ParceiroScreen({super.key, required this.parceiro});

  final ParceiroClube parceiro;

  @override
  State<ParceiroScreen> createState() => _ParceiroScreenState();
}

class _ParceiroScreenState extends State<ParceiroScreen> {
  late final ClubeApi _api = ClubeApi(context.read<DriverState>().api);
  late Future<ParceiroClube> _dados = _api.parceiro(widget.parceiro.id);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: Text(widget.parceiro.nome)),
      body: FutureBuilder<ParceiroClube>(
        future: _dados,
        builder: (context, s) {
          if (s.hasError) {
            return _Erro(
              texto: _mensagem(s.error!),
              tentarDeNovo: () => setState(() => _dados = _api.parceiro(widget.parceiro.id)),
            );
          }
          final p = s.data ?? widget.parceiro;
          return ListView(
            padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.lg, Spacing.lg, Spacing.xxl),
            children: [
              if (!s.hasData) const LinearProgressIndicator(minHeight: 2),
              Row(
                children: [
                  _Logo(url: p.logoUrl, tamanho: 80),
                  const SizedBox(width: Spacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p.nome, style: AppText.title),
                        Text(p.categoria, style: AppText.body.copyWith(color: AppColors.brand, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ],
              ),
              if (p.descricao.isNotEmpty) ...[
                const SizedBox(height: Spacing.md),
                Text(p.descricao, style: AppText.body.copyWith(color: AppColors.textMuted)),
              ],
              const SizedBox(height: Spacing.lg),
              _Bloco(titulo: 'Vantagens para você', icone: Icons.local_offer_outlined, texto: p.vantagens),
              for (final b in p.beneficios)
                _Bloco(
                  titulo: b.titulo,
                  icone: Icons.check_circle_outline,
                  texto: [if (b.descricao.isNotEmpty) b.descricao, if (b.condicoes.isNotEmpty) 'Condições: ${b.condicoes}'].join('\n'),
                ),
              if (p.condicoes.isNotEmpty) _Bloco(titulo: 'Condições para usar', icone: Icons.rule_outlined, texto: p.condicoes),
              _Bloco(titulo: 'Endereço', icone: Icons.place_outlined, texto: p.endereco),
              if (p.horario.isNotEmpty) _Bloco(titulo: 'Horário de funcionamento', icone: Icons.schedule, texto: p.horario),
              if (p.telefone != null) _Bloco(titulo: 'Telefone', icone: Icons.phone_outlined, texto: telefoneDoClube(p.telefone!)),
              const SizedBox(height: Spacing.md),
              FilledButton.icon(onPressed: () => abrirMapaDoParceiro(p), icon: const Icon(Icons.map_outlined), label: const Text('Abrir no mapa')),
              if (p.whatsapp != null) ...[
                const SizedBox(height: Spacing.sm),
                FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: const Color(0xFF25D366)),
                  onPressed: () => abrirWhatsAppDoParceiro(p),
                  icon: const Icon(Icons.chat_outlined),
                  label: const Text('Chamar no WhatsApp'),
                ),
              ],
              if (p.telefone != null) ...[
                const SizedBox(height: Spacing.sm),
                OutlinedButton.icon(onPressed: () => ligarParaParceiro(p), icon: const Icon(Icons.phone_outlined), label: const Text('Ligar')),
              ],
              const SizedBox(height: Spacing.sm),
              OutlinedButton.icon(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const CarteirinhaScreen())),
                icon: const Icon(Icons.badge_outlined),
                label: const Text('Mostrar minha identificação'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Bloco extends StatelessWidget {
  const _Bloco({required this.titulo, required this.icone, required this.texto});

  final String titulo;
  final IconData icone;
  final String texto;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: Spacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icone, size: 20, color: AppColors.brand),
            const SizedBox(width: Spacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(titulo, style: AppText.bodyStrong),
                  if (texto.isNotEmpty) Text(texto, style: AppText.body.copyWith(color: AppColors.textMuted)),
                ],
              ),
            ),
          ],
        ),
      );
}

/// Iniciais no lugar da foto (motorista ainda sem foto de perfil).
class _SemFoto extends StatelessWidget {
  const _SemFoto({required this.nome});

  final String nome;

  @override
  Widget build(BuildContext context) {
    final iniciais = nome.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).take(2).map((p) => p[0].toUpperCase()).join();
    return Container(
      width: 112,
      height: 112,
      alignment: Alignment.center,
      decoration: const BoxDecoration(color: AppColors.brandSoft, shape: BoxShape.circle),
      child: Text(iniciais.isEmpty ? '?' : iniciais, style: AppText.display.copyWith(color: AppColors.brand)),
    );
  }
}

String _dataHora(DateTime d) => DateFormat('dd/MM/yyyy HH:mm').format(d);

/// Carteirinha digital do motorista parceiro. Os dados vem da conta logada
/// (o motorista nao edita) e a situacao APTO / NAO APTO e calculada no
/// servidor: verde APTO, vermelho NAO APTO.
class CarteirinhaScreen extends StatefulWidget {
  const CarteirinhaScreen({super.key});

  @override
  State<CarteirinhaScreen> createState() => _CarteirinhaScreenState();
}

class _CarteirinhaScreenState extends State<CarteirinhaScreen> {
  late final ClubeApi _api = ClubeApi(context.read<DriverState>().api);
  late Future<Carteirinha> _dados = _api.carteirinha();

  void _atualizar() => setState(() {
        _dados = _api.carteirinha();
      });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Minha identificação'),
        actions: [IconButton(tooltip: 'Atualizar', icon: const Icon(Icons.refresh), onPressed: _atualizar)],
      ),
      body: FutureBuilder<Carteirinha>(
        future: _dados,
        builder: (context, s) {
          if (s.hasError) {
            return _Erro(texto: 'Não foi possível carregar a identificação. ${_mensagem(s.error!)}', tentarDeNovo: _atualizar);
          }
          if (!s.hasData) return const Center(child: CircularProgressIndicator());
          final c = s.data!;
          final cor = c.apto ? const Color(0xFF1E9E5A) : AppColors.danger;
          return RefreshIndicator(
            onRefresh: () async {
              _atualizar();
              await _dados.catchError((Object _) => c);
            },
            child: ListView(
              padding: const EdgeInsets.all(Spacing.lg),
              children: [
                Container(
                  key: const ValueKey('carteirinha'),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(Radii.xl),
                    gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [AppColors.brand, AppColors.brandDark]),
                    boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 16, offset: Offset(0, 6))],
                  ),
                  padding: const EdgeInsets.all(Spacing.lg),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          ClipOval(
                            child: Image.asset('assets/brand/logo_redondo.png', width: 48, height: 48,
                                errorBuilder: (context, error, stack) => const SizedBox(width: 48, height: 48)),
                          ),
                          const SizedBox(width: Spacing.sm),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(Marca.nome, style: AppText.heading.copyWith(color: Colors.white)),
                                Text('Clube de Vantagens', style: AppText.caption.copyWith(color: AppColors.gold, fontWeight: FontWeight.w700)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: Spacing.lg),
                      // Foto do perfil (Evandro, 05/11/2026), com borda branca.
                      Container(
                        key: const ValueKey('foto-carteirinha'),
                        padding: const EdgeInsets.all(3),
                        decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                        child: c.fotoUrl == null
                            ? _SemFoto(nome: c.nome)
                            : FotoDoServidor(caminho: c.fotoUrl!, tamanho: 112, reserva: _SemFoto(nome: c.nome)),
                      ),
                      const SizedBox(height: Spacing.md),
                      Text(c.nome, textAlign: TextAlign.center, style: AppText.title.copyWith(color: Colors.white)),
                      const SizedBox(height: 2),
                      Text('MOTORISTA PARCEIRO', style: AppText.caption.copyWith(color: Colors.white70, letterSpacing: 2, fontWeight: FontWeight.w700)),
                      const SizedBox(height: Spacing.lg),
                      Text('Número de identificação', style: AppText.caption.copyWith(color: Colors.white70)),
                      SelectableText(
                        c.codigo,
                        key: const ValueKey('codigo-carteirinha'),
                        textAlign: TextAlign.center,
                        style: AppText.display.copyWith(color: Colors.white, letterSpacing: 2),
                      ),
                      const SizedBox(height: Spacing.lg),
                      // Verde = APTO, vermelho = NAO APTO (Evandro, 05/11/2026).
                      Container(
                        key: const ValueKey('selo-carteirinha'),
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.lg),
                        decoration: BoxDecoration(
                          color: cor,
                          borderRadius: BorderRadius.circular(Radii.lg),
                          border: Border.all(color: Colors.white, width: 3),
                        ),
                        child: Column(
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(c.apto ? Icons.check_circle : Icons.cancel, color: Colors.white, size: 36),
                                const SizedBox(width: Spacing.sm),
                                Flexible(
                                  child: Text(
                                    c.situacaoTexto,
                                    key: const ValueKey('situacao-carteirinha'),
                                    style: AppText.display.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(c.motivo, textAlign: TextAlign.center, style: AppText.caption.copyWith(color: Colors.white)),
                            if (c.apto && c.validoAte != null)
                              Text('Vale até ${_dataHora(c.validoAte!)}', textAlign: TextAlign.center, style: AppText.bodyStrong.copyWith(color: Colors.white)),
                          ],
                        ),
                      ),
                      const SizedBox(height: Spacing.md),
                      Text(
                        c.atualizadoEm == null
                            ? 'Situação conferida em ${_dataHora(c.conferidoEm)}'
                            : 'Situação atualizada em ${_dataHora(c.atualizadoEm!)}',
                        textAlign: TextAlign.center,
                        style: AppText.caption.copyWith(color: Colors.white70),
                      ),
                    ],
                  ),
                ),
                if (!c.apto) ...[
                  const SizedBox(height: Spacing.sm),
                  Text(
                    'Para ficar APTO: uma recarga de R\$ 100,00 ou mais na carteira, confirmada pela Central. Vale por 30 dias. '
                    'Sem isso você continua rodando normalmente; só as vantagens do clube ficam suspensas.',
                    textAlign: TextAlign.center,
                    style: AppText.caption.copyWith(color: AppColors.danger),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
