import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/legal/legal_content.dart';
import '../core/theme/app_theme.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';

/// Aceite obrigatorio dos Termos de Uso e da Politica de Privacidade.
///
/// Fica entre o login e o cadastro do veiculo: enquanto `termsAccepted`
/// for falso, o portao em app.dart sempre traz o motorista de volta para
/// ca — antes ate do onboarding, porque nao faz sentido cadastrar CNH e
/// veiculo sem ter aceitado como os dados vao ser usados.
class TermsScreen extends StatefulWidget {
  const TermsScreen({super.key});

  @override
  State<TermsScreen> createState() => _TermsScreenState();
}

class _TermsScreenState extends State<TermsScreen> with SingleTickerProviderStateMixin {
  late final TabController _abas = TabController(length: 2, vsync: this);
  final _client = ApiClient();

  String _termos = kTermsFallback;
  String _privacidade = kPrivacyFallback;
  bool _carregando = true;
  bool _aceitando = false;
  bool _leuAteOFim = false;

  @override
  void initState() {
    super.initState();
    _buscarTextoOficial();
  }

  @override
  void dispose() {
    _abas.dispose();
    super.dispose();
  }

  /// Busca o texto vigente no servidor. Se nao houver rede, fica com o
  /// resumo local — melhor mostrar algo do que travar a pessoa numa
  /// tela em branco antes mesmo de ela poder recusar.
  Future<void> _buscarTextoOficial() async {
    try {
      final results = await Future.wait([
        _client.request('GET', '/legal/terms'),
        _client.request('GET', '/legal/privacy'),
      ]);
      final termos = results[0] as Map<String, dynamic>;
      final privacidade = results[1] as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _termos = termos['content'] as String? ?? kTermsFallback;
        _privacidade = privacidade['content'] as String? ?? kPrivacyFallback;
        _carregando = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _carregando = false);
    }
  }

  Future<void> _aceitar() async {
    setState(() => _aceitando = true);
    await context.read<DriverState>().acceptTerms();
    // Nao precisa desligar _aceitando: assim que o aceite entra no
    // estado, app.dart troca de tela e este widget sai da arvore.
  }

  void _naoAceitar() {
    context.read<DriverState>().logout();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        automaticallyImplyLeading: false,
        title: Text('Termos e Privacidade', style: AppText.title),
        bottom: TabBar(
          controller: _abas,
          labelColor: AppColors.text,
          unselectedLabelColor: AppColors.textMuted,
          indicatorColor: AppColors.primary,
          tabs: const [Tab(text: 'Termos de Uso'), Tab(text: 'Privacidade')],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _carregando
                ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                : NotificationListener<ScrollNotification>(
                    onNotification: (n) {
                      // So libera o botao depois que a pessoa chegou perto do
                      // fim do texto — aceite exige ao menos rolar ate ele.
                      if (n.metrics.pixels >= n.metrics.maxScrollExtent - 40 && !_leuAteOFim) {
                        setState(() => _leuAteOFim = true);
                      }
                      return false;
                    },
                    child: TabBarView(
                      controller: _abas,
                      children: [
                        _TextoLegal(texto: _termos),
                        _TextoLegal(texto: _privacidade),
                      ],
                    ),
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, Spacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AppButton(
                    label: 'Aceito os Termos',
                    loading: _aceitando,
                    enabled: _leuAteOFim || _carregando == false,
                    onPressed: _aceitar,
                  ),
                  const SizedBox(height: Spacing.sm),
                  TextButton(
                    onPressed: _aceitando ? null : _naoAceitar,
                    child: Text('Não aceito', style: AppText.body.copyWith(color: AppColors.textMuted)),
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

/// Renderizacao simples do texto legal: sem depender de pacote de
/// markdown, so distinguindo titulos (linhas com #) do corpo.
class _TextoLegal extends StatelessWidget {
  const _TextoLegal({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final linhas = texto.split('\n');

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, Spacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final linha in linhas) _linha(linha),
        ],
      ),
    );
  }

  Widget _linha(String bruta) {
    final s = bruta.trim();
    if (s.isEmpty) return const SizedBox(height: Spacing.sm);
    if (s.startsWith('# ')) {
      return Padding(
        padding: const EdgeInsets.only(top: Spacing.md, bottom: Spacing.xs),
        child: Text(s.substring(2), style: AppText.title),
      );
    }
    if (s.startsWith('## ')) {
      return Padding(
        padding: const EdgeInsets.only(top: Spacing.md, bottom: Spacing.xs),
        child: Text(s.substring(3), style: AppText.heading),
      );
    }
    if (s == '---') {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: Spacing.sm),
        child: Divider(color: AppColors.border, height: 1),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.xs),
      child: Text(s, style: AppText.body.copyWith(color: AppColors.textMuted, height: 1.5)),
    );
  }
}
