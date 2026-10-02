import 'package:flutter/material.dart';

import '../core/api/api_client.dart';
import '../core/theme/central_theme.dart';
import 'ui.dart';

/// Cidades atendidas (lista do cadastro do passageiro) e avisos que
/// aparecem no sino do aplicativo do passageiro.
class OperacaoPassageiros extends StatefulWidget {
  const OperacaoPassageiros({super.key});

  @override
  State<OperacaoPassageiros> createState() => _OperacaoPassageirosState();
}

class _OperacaoPassageirosState extends State<OperacaoPassageiros> {
  final ApiClient _api = ApiClient();
  List<String> _cidades = const [];
  List<Map<String, dynamic>> _avisos = const [];
  bool _carregando = true;
  bool _falhou = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _carregar());
  }

  void _aplicar(dynamic r) {
    final m = (r as Map?) ?? const {};
    _cidades = [for (final c in (m['cidades'] as List? ?? const [])) c.toString()];
    _avisos = [
      for (final a in (m['avisos'] as List? ?? const []))
        if (a is Map) Map<String, dynamic>.from(a),
    ];
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falhou = false;
    });
    try {
      _aplicar(await _api.request('GET', '/admin/operacao'));
    } catch (_) {
      _falhou = true;
    }
    if (mounted) setState(() => _carregando = false);
  }

  void _aviso(String texto) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(texto)));
  }

  Future<void> _editarCidades() async {
    final campo = TextEditingController(text: _cidades.join('\n'));
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('Cidades atendidas', style: AppText.heading),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Uma cidade por linha, do jeito que o passageiro vai ver. Ex.: Goiatuba - GO',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.md),
              TextField(
                controller: campo,
                minLines: 4,
                maxLines: 10,
                style: AppText.body,
                decoration: InputDecoration(
                  filled: true,
                  fillColor: AppColors.surfaceElevated,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.sm)),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Salvar')),
        ],
      ),
    );
    final linhas = campo.text.split('\n').map((l) => l.trim()).where((l) => l.isNotEmpty).toList();
    if (ok != true || !mounted) return;
    try {
      final r = await _api.request('PUT', '/admin/operacao/cidades', body: {'cidades': linhas});
      if (!mounted) return;
      setState(() => _aplicar(r));
      _aviso('Cidades salvas.');
    } on ApiException catch (e) {
      _aviso(e.message);
    } catch (_) {
      _aviso('Não foi possível salvar agora.');
    }
  }

  Future<void> _publicarAviso() async {
    final titulo = TextEditingController();
    final texto = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('Publicar aviso', style: AppText.heading),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppField(label: 'Título', hint: 'Ex.: Novos motoristas no horário da noite', controller: titulo),
              const SizedBox(height: Spacing.md),
              TextField(
                controller: texto,
                minLines: 3,
                maxLines: 6,
                maxLength: 500,
                style: AppText.body,
                decoration: InputDecoration(
                  hintText: 'O que o passageiro vai ler no sino do aplicativo',
                  filled: true,
                  fillColor: AppColors.surfaceElevated,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.sm)),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Publicar')),
        ],
      ),
    );
    final t = titulo.text.trim();
    final c = texto.text.trim();
    if (ok != true || !mounted) return;
    try {
      final r = await _api.request('POST', '/admin/operacao/avisos', body: {'titulo': t, 'texto': c});
      if (!mounted) return;
      setState(() => _aplicar(r));
      _aviso('Aviso publicado para os passageiros.');
    } on ApiException catch (e) {
      _aviso(e.message);
    } catch (_) {
      _aviso('Não foi possível publicar agora.');
    }
  }

  Future<void> _apagar(Map<String, dynamic> a) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('Apagar aviso?', style: AppText.heading),
        content: Text('"${a['titulo']}" some do aplicativo dos passageiros.', style: AppText.body),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Apagar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final r = await _api.request('DELETE', '/admin/operacao/avisos/${a['id']}');
      if (!mounted) return;
      setState(() => _aplicar(r));
    } on ApiException catch (e) {
      _aviso(e.message);
    } catch (_) {
      _aviso('Não foi possível apagar agora.');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_carregando) {
      return const AppCard(child: Center(child: CircularProgressIndicator()));
    }
    if (_falhou) {
      return AppCard(
        child: Row(
          children: [
            Expanded(child: Text('Não foi possível carregar cidades e avisos.', style: AppText.body)),
            TextButton(onPressed: _carregar, child: const Text('Tentar de novo')),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text('Cidades atendidas', style: AppText.heading)),
                  TextButton(onPressed: _editarCidades, child: const Text('Editar')),
                ],
              ),
              Text(
                'Aparecem na tela Cidade do cadastro do passageiro.',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.sm),
              if (_cidades.isEmpty)
                Text('Nenhuma cidade: o passageiro pula a escolha da cidade.', style: AppText.body)
              else
                Wrap(
                  spacing: Spacing.sm,
                  runSpacing: Spacing.sm,
                  children: [for (final c in _cidades) AppBadge(text: c, tone: AppBadgeTone.info)],
                ),
            ],
          ),
        ),
        const SizedBox(height: Spacing.md),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text('Avisos para passageiros', style: AppText.heading)),
                  TextButton(onPressed: _publicarAviso, child: const Text('Publicar')),
                ],
              ),
              Text(
                'Aparecem no sino da tela inicial do passageiro.',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.sm),
              if (_avisos.isEmpty)
                Text('Nenhum aviso publicado.', style: AppText.body)
              else
                for (final a in _avisos)
                  Padding(
                    padding: const EdgeInsets.only(top: Spacing.sm),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${a['titulo'] ?? ''}', style: AppText.bodyStrong),
                              Text(
                                '${a['texto'] ?? ''}',
                                style: AppText.caption.copyWith(color: AppColors.textMuted),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: 'Apagar',
                          icon: const Icon(Icons.delete_outline, color: AppColors.danger),
                          onPressed: () => _apagar(a),
                        ),
                      ],
                    ),
                  ),
            ],
          ),
        ),
      ],
    );
  }
}
