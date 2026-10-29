import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api/api_client.dart';
import '../core/config/app_config.dart';
import '../core/theme/central_theme.dart';
import '../painel/foto.dart';
import 'ui.dart';

/// Escolhe o logo na galeria (ja reduzido). Trocavel nos testes.
typedef EscolherLogo = Future<({String mime, Uint8List bytes})?> Function(BuildContext context);

Future<({String mime, Uint8List bytes})?> _logoDaGaleria(BuildContext context) async {
  final XFile? arquivo;
  try {
    arquivo = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 512, maxHeight: 512, imageQuality: 85);
  } catch (_) {
    return null;
  }
  if (arquivo == null) return null;
  final bytes = await arquivo.readAsBytes();
  final mime = mimeDaImagem(bytes);
  if (mime == null) return null;
  return (mime: mime, bytes: bytes);
}

/// Cores prontas (a primeira e o azul da marca).
const coresDaMarca = <String, String>{
  '#1E5BB8': 'Azul (padrão)',
  '#0070B8': 'Azul claro',
  '#143E80': 'Azul escuro',
  '#2E9E5B': 'Verde',
  '#D93A3A': 'Vermelho',
  '#E8710A': 'Laranja',
  '#7A1FA2': 'Roxo',
  '#14181F': 'Preto',
};

Color? corDoTexto(String? t) {
  final m = RegExp(r'^#([0-9A-Fa-f]{6})$').firstMatch((t ?? '').trim());
  return m == null ? null : Color(0xFF000000 | int.parse(m.group(1)!, radix: 16));
}

/// Etapa 6 (Evandro, 29/10/2026): aparencia do app do passageiro pela
/// Central — nome, cor, logo e faixa de aviso no Inicio. O app muda na
/// proxima vez que abrir (sem gerar app novo). So o dono grava.
class AparenciaDoApp extends StatefulWidget {
  const AparenciaDoApp({super.key, this.api, this.escolherLogo});

  final ApiClient? api;
  final EscolherLogo? escolherLogo;

  @override
  State<AparenciaDoApp> createState() => _AparenciaDoAppState();
}

class _AparenciaDoAppState extends State<AparenciaDoApp> {
  late final ApiClient _api = widget.api ?? ApiClient();
  Map<String, dynamic>? _a;
  bool _carregando = true;
  bool _gravando = false;
  bool _falhou = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _carregar());
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falhou = false;
    });
    try {
      _a = Map<String, dynamic>.from(await _api.request('GET', '/admin/aparencia') as Map);
    } catch (_) {
      _falhou = true;
    }
    if (mounted) setState(() => _carregando = false);
  }

  void _aviso(String texto) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(texto)));
  }

  Future<void> _enviar(String metodo, String caminho, [Map<String, dynamic>? corpo, String ok = 'Salvo. O app do passageiro muda na próxima vez que abrir.']) async {
    setState(() => _gravando = true);
    try {
      final r = await _api.request(metodo, caminho, body: corpo);
      if (!mounted) return;
      setState(() => _a = Map<String, dynamic>.from(r as Map));
      _aviso(ok);
    } on ApiException catch (e) {
      _aviso(e.message);
    } catch (_) {
      _aviso('Não foi possível salvar agora.');
    } finally {
      if (mounted) setState(() => _gravando = false);
    }
  }

  Future<void> _editar() async {
    final a = _a ?? const {};
    final nome = TextEditingController(text: a['nome']?.toString() ?? 'Fortaleza Mov');
    final faixa = TextEditingController(text: a['bannerTexto']?.toString() ?? '');
    var cor = a['cor']?.toString() ?? '#1E5BB8';
    var faixaLigada = a['bannerAtivo'] == true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, mudar) => AlertDialog(
          backgroundColor: AppColors.surface,
          title: Text('Aparência do app', style: AppText.heading),
          content: SizedBox(
            width: 440,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AppField(label: 'Nome do app', hint: 'Ex.: Fortaleza Mov', controller: nome, maxLength: 30),
                  const SizedBox(height: Spacing.sm),
                  Text('Cor do destaque', style: AppText.bodyStrong),
                  const SizedBox(height: Spacing.xs),
                  Wrap(
                    spacing: Spacing.sm,
                    runSpacing: Spacing.sm,
                    children: [
                      for (final c in coresDaMarca.entries)
                        ChoiceChip(
                          avatar: CircleAvatar(backgroundColor: corDoTexto(c.key)),
                          label: Text(c.value),
                          selected: cor.toUpperCase() == c.key,
                          onSelected: (_) => mudar(() => cor = c.key),
                        ),
                    ],
                  ),
                  const SizedBox(height: Spacing.md),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('Faixa de aviso no Início', style: AppText.bodyStrong),
                    subtitle: Text('Aparece em cima do mapa, embaixo do nome.', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                    value: faixaLigada,
                    onChanged: (v) => mudar(() => faixaLigada = v),
                  ),
                  if (faixaLigada)
                    TextField(
                      controller: faixa,
                      maxLength: 140,
                      minLines: 2,
                      maxLines: 3,
                      style: AppText.body,
                      decoration: InputDecoration(
                        hintText: 'Ex.: Feriado: corridas até as 2h da manhã',
                        filled: true,
                        fillColor: AppColors.surfaceElevated,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.sm)),
                      ),
                    ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
            TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Salvar')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    if (nome.text.trim().length < 2) return _aviso('O nome precisa de 2 ou mais letras.');
    if (faixaLigada && faixa.text.trim().isEmpty) return _aviso('Escreva o texto da faixa ou desligue a faixa.');
    await _enviar('PUT', '/admin/aparencia', {
      'nome': nome.text.trim(),
      'cor': cor.toUpperCase(),
      'bannerAtivo': faixaLigada,
      'bannerTexto': faixa.text.trim(),
    });
  }

  Future<void> _voltarAoPadrao() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('Voltar ao padrão?', style: AppText.heading),
        content: Text('O app do passageiro volta ao nome, à cor e ao logo de fábrica, e a faixa some.', style: AppText.body),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Voltar ao padrão')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _enviar('DELETE', '/admin/aparencia', null, 'Pronto: o app do passageiro volta ao padrão na próxima vez que abrir.');
  }

  Future<void> _trocarLogo() async {
    final logo = await (widget.escolherLogo ?? _logoDaGaleria)(context);
    if (!mounted) return;
    if (logo == null) return _aviso('Nenhuma imagem escolhida (use JPG, PNG ou WEBP).');
    if (logo.bytes.length > 1000000) return _aviso('Imagem muito grande: use uma de até 1 MB.');
    await _enviar('POST', '/admin/aparencia/logo', {'mime': logo.mime, 'dados': base64Encode(logo.bytes)}, 'Logo trocado. O app do passageiro mostra na próxima vez que abrir.');
  }

  @override
  Widget build(BuildContext context) {
    if (_carregando) return const AppCard(child: Center(child: CircularProgressIndicator()));
    if (_falhou || _a == null) {
      return AppCard(
        child: Row(
          children: [
            Expanded(child: Text('Não foi possível carregar a aparência do app.', style: AppText.body)),
            TextButton(onPressed: _carregar, child: const Text('Tentar de novo')),
          ],
        ),
      );
    }
    final a = _a!;
    final cor = corDoTexto(a['cor']?.toString()) ?? AppColors.brand;
    final logo = a['logoUrl'] is String ? '${AppConfig.apiUrl}/api${a['logoUrl']}' : null;
    final faixa = a['bannerAtivo'] == true ? a['bannerTexto']?.toString() : null;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('Aparência do app', style: AppText.heading)),
              TextButton(onPressed: _gravando ? null : _editar, child: const Text('Editar')),
            ],
          ),
          Text(
            'Nome, cor, logo e faixa de aviso do app do passageiro. Muda na próxima vez que o passageiro abrir o app.',
            style: AppText.caption.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: Spacing.md),
          // Previa da pilula do Inicio.
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              key: const ValueKey('previa-marca'),
              padding: EdgeInsets.fromLTRB(logo != null ? 6 : 18, 8, 18, 8),
              decoration: BoxDecoration(color: cor, borderRadius: BorderRadius.circular(999)),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (logo != null) ...[
                    ClipOval(
                      child: Image.network(logo, width: 32, height: 32, fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const SizedBox(width: 32, height: 32)),
                    ),
                    const SizedBox(width: 8),
                  ],
                  Text(a['nome']?.toString() ?? '', style: AppText.heading.copyWith(color: Colors.white, fontSize: 18)),
                ],
              ),
            ),
          ),
          if (faixa != null) ...[
            const SizedBox(height: Spacing.sm),
            Row(
              children: [
                Icon(Icons.campaign, color: cor, size: 20),
                const SizedBox(width: Spacing.xs),
                Expanded(child: Text(faixa, style: AppText.body)),
              ],
            ),
          ],
          const SizedBox(height: Spacing.sm),
          Wrap(
            spacing: Spacing.sm,
            children: [
              TextButton.icon(
                onPressed: _gravando ? null : _trocarLogo,
                icon: const Icon(Icons.image_outlined),
                label: Text(logo == null ? 'Pôr logo' : 'Trocar logo'),
              ),
              if (logo != null)
                TextButton.icon(
                  onPressed: _gravando ? null : () => _enviar('DELETE', '/admin/aparencia/logo', null, 'Logo tirado: o app volta ao logo padrão.'),
                  icon: const Icon(Icons.hide_image_outlined),
                  label: const Text('Tirar logo'),
                ),
              if (a['definida'] == true)
                TextButton.icon(
                  onPressed: _gravando ? null : _voltarAoPadrao,
                  icon: const Icon(Icons.restart_alt),
                  label: const Text('Voltar ao padrão'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
