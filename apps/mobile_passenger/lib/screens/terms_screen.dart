import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/config/app_config.dart';
import '../core/legal/legal_content.dart';
import '../core/theme/app_theme.dart';
import '../state/auth_state.dart';
import '../widgets/texto_legal.dart';
import '../widgets/ui.dart';

/// Aceite obrigatorio dos Termos de Uso e da Politica de Privacidade.
///
/// Fica entre o login e a tela inicial: enquanto `termsAccepted` for
/// falso, o portao em app.dart sempre traz a pessoa de volta para ca,
/// nao ha como contornar tocando em "voltar" ou fechando o aplicativo.
class TermsScreen extends StatefulWidget {
  const TermsScreen({super.key, this.cliente});

  /// So os testes mandam um cliente proprio.
  final ApiClient? cliente;

  @override
  State<TermsScreen> createState() => _TermsScreenState();
}

class _TermsScreenState extends State<TermsScreen> with SingleTickerProviderStateMixin {
  late final TabController _abas = TabController(length: 2, vsync: this);
  late final ApiClient _client = widget.cliente ?? ApiClient();

  String _termos = kTermsFallback;
  String _privacidade = kPrivacyFallback;
  bool _carregando = true;
  bool _aceitando = false;
  bool _marcou = false;

  /// So fica verdadeiro com os dois textos completos na tela.
  bool _textoCompleto = false;
  String? _versao;

  /// Sem servidor (demonstracao) vale o resumo; com servidor, ninguem aceita
  /// um texto que nao conseguiu ler.
  bool get _podeLer => _textoCompleto || !AppConfig.hasApi;

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

  /// Busca o texto vigente no servidor. Se nao houver rede, mostra o
  /// resumo local e o botao de tentar de novo; o aceite espera o texto.
  Future<void> _buscarTextoOficial() async {
    try {
      final results = await Future.wait([
        _client.request('GET', '/legal/terms'),
        _client.request('GET', '/legal/privacy'),
      ]);
      final termos = results[0] as Map<String, dynamic>;
      final privacidade = results[1] as Map<String, dynamic>;
      if (!mounted) return;
      final textoDosTermos = termos['content'] as String? ?? '';
      final textoDaPrivacidade = privacidade['content'] as String? ?? '';
      setState(() {
        _textoCompleto = textoDosTermos.isNotEmpty && textoDaPrivacidade.isNotEmpty;
        _termos = _textoCompleto ? textoDosTermos : kTermsFallback;
        _privacidade = _textoCompleto ? textoDaPrivacidade : kPrivacyFallback;
        _versao = termos['version'] as String?;
        _carregando = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _carregando = false);
    }
  }

  void _tentarDeNovo() {
    setState(() => _carregando = true);
    _buscarTextoOficial();
  }

  Future<void> _aceitar() async {
    if (_aceitando || !_marcou || !_podeLer) return;
    setState(() => _aceitando = true);
    await context.read<AuthState>().acceptTerms(versao: _versao ?? kTermsVersion);
    // Nao precisa desligar _aceitando: assim que o aceite entra no
    // estado, app.dart troca de tela e este widget sai da arvore.
  }

  void _naoAceitar() {
    context.read<AuthState>().logout();
  }

  @override
  Widget build(BuildContext context) {
    // Quem ja tinha aceitado esta aqui porque o texto mudou.
    final atualizacao = context.select<AuthState, bool>((s) => s.user?.termosDesatualizados ?? false);
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
          if (atualizacao)
            Padding(
              padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, 0),
              child: Text('Atualizamos os Termos de Uso e a Política de Privacidade. Leia e aceite para continuar.',
                  style: AppText.body),
            ),
          Expanded(
            child: _carregando
                ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                : TabBarView(
                    controller: _abas,
                    children: [
                      TextoLegal(texto: _termos),
                      TextoLegal(texto: _privacidade),
                    ],
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.sm, Spacing.lg, Spacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (!_carregando && !_podeLer) ...[
                    Text('Sem conexão: não deu para carregar o texto completo. Confira a internet para aceitar.',
                        style: AppText.body),
                    TextButton(onPressed: _tentarDeNovo, child: const Text('Tentar de novo')),
                  ] else
                    CheckboxListTile(
                      key: const ValueKey('aceite-termos'),
                      value: _marcou,
                      onChanged: _carregando || _aceitando ? null : (v) => setState(() => _marcou = v ?? false),
                      controlAffinity: ListTileControlAffinity.leading,
                      contentPadding: EdgeInsets.zero,
                      title: Text('Li e aceito os Termos de Uso e a Política de Privacidade', style: AppText.body),
                    ),
                  AppButton(
                    label: 'Aceito os Termos',
                    loading: _aceitando,
                    enabled: !_carregando && _podeLer && _marcou,
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
