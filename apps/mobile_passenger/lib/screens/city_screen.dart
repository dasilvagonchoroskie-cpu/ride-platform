import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/app_theme.dart';
import '../state/auth_state.dart';
import '../state/config_state.dart';
import '../widgets/form_ui.dart';

/// "goiatúba" acha "Goiatuba - GO".
String semAcento(String texto) {
  const de = 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
  const para = 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC';
  final b = StringBuffer();
  for (final ch in texto.split('')) {
    final i = de.indexOf(ch);
    b.write(i >= 0 ? para[i] : ch);
  }
  return b.toString().toLowerCase();
}

/// Em qual cidade a pessoa vai usar o aplicativo. A lista vem da Central.
class CityScreen extends StatefulWidget {
  const CityScreen({super.key});

  @override
  State<CityScreen> createState() => _CityScreenState();
}

class _CityScreenState extends State<CityScreen> {
  final TextEditingController _busca = TextEditingController();
  String? _escolhida;

  @override
  void dispose() {
    _busca.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final config = context.watch<ConfigState>();
    final auth = context.read<AuthState>();
    final cidades = config.cidades;
    final selecionada = _escolhida ?? (cidades.length == 1 ? cidades.first : null);
    final filtro = semAcento(_busca.text.trim());
    final lista = filtro.isEmpty ? cidades : cidades.where((c) => semAcento(c).contains(filtro)).toList();

    return TelaFormulario(
      titulo: 'Cidade',
      aoVoltar: () => auth.logout(),
      rodape: BotaoPrincipal(
        texto: 'Continuar',
        ativo: selecionada != null,
        aoTocar: () => auth.escolherCidade(selecionada),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.lg),
            child: Text(
              'Em qual cidade vai utilizar o app?',
              style: AppText.title.copyWith(fontSize: 27, fontWeight: FontWeight.w400, color: AppColors.text),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Spacing.xl),
            child: CampoForm(
              dica: 'Pesquisar',
              controller: _busca,
              prefixo: const Icon(Icons.search, color: AppColors.textFaint, size: 28),
              aoMudar: (_) => setState(() {}),
            ),
          ),
          const SizedBox(height: Spacing.lg),
          const Divider(height: 1, color: AppColors.border),
          Expanded(child: _conteudo(config, lista, selecionada)),
        ],
      ),
    );
  }

  Widget _conteudo(ConfigState config, List<String> lista, String? selecionada) {
    if (!config.carregado) {
      if (config.carregando || !config.falhou) {
        return const Center(child: CircularProgressIndicator(color: AppColors.brand));
      }
      return _Mensagem(
        texto: 'Não foi possível carregar as cidades. Confira a internet.',
        botao: 'Tentar de novo',
        aoTocar: config.carregar,
      );
    }
    if (lista.isEmpty) {
      return const _Mensagem(
        texto: 'Nenhuma cidade com esse nome. A Fortaleza Mov ainda não atende essa cidade.',
      );
    }
    return ListView.separated(
      padding: EdgeInsets.zero,
      itemCount: lista.length,
      separatorBuilder: (context, index) => const Divider(height: 1, color: AppColors.border),
      itemBuilder: (context, index) {
        final cidade = lista[index];
        return InkWell(
          onTap: () => setState(() => _escolhida = cidade),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Spacing.xl, vertical: 22),
            child: Row(
              children: [
                Expanded(
                  child: Text(cidade, style: AppText.bodyStrong.copyWith(fontSize: 19, color: AppColors.text)),
                ),
                MarcaEscolha(marcado: cidade == selecionada),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _Mensagem extends StatelessWidget {
  const _Mensagem({required this.texto, this.botao, this.aoTocar});

  final String texto;
  final String? botao;
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(Spacing.xl),
      child: Column(
        children: [
          Text(texto, textAlign: TextAlign.center, style: AppText.body.copyWith(fontSize: 17, color: AppColors.textMuted)),
          if (botao != null) ...[
            const SizedBox(height: Spacing.md),
            TextButton(onPressed: aoTocar, child: Text(botao!, style: AppText.bodyStrong.copyWith(color: AppColors.brand))),
          ],
        ],
      ),
    );
  }
}
