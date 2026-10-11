import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';

/// Renderizacao simples do texto legal (Termos e Privacidade), sem pacote
/// de markdown.
///
/// O texto do servidor vem quebrado em linhas de ~70 letras. Antes cada
/// linha virava um paragrafo, e no celular o texto ficava "picotado"
/// (linha cheia, linha pela metade...). Agora as linhas seguidas viram um
/// paragrafo so; "- " vira item de lista; "**negrito**" sai em negrito;
/// "#" e "##" sao titulos e "---" e uma linha divisoria.
class TextoLegal extends StatelessWidget {
  const TextoLegal({super.key, required this.texto, this.padding});

  final String texto;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final blocos = blocosDoTextoLegal(texto);
    return SingleChildScrollView(
      padding: padding ?? const EdgeInsets.fromLTRB(Spacing.lg, Spacing.md, Spacing.lg, Spacing.xl),
      child: SelectionArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [for (final b in blocos) _bloco(b)],
        ),
      ),
    );
  }

  Widget _bloco(BlocoLegal b) {
    final corpo = AppText.body.copyWith(color: AppColors.textMuted, height: 1.5);
    switch (b.tipo) {
      case TipoBloco.titulo:
        return Padding(
          padding: const EdgeInsets.only(top: Spacing.md, bottom: Spacing.sm),
          child: Text(b.texto, style: AppText.title),
        );
      case TipoBloco.subtitulo:
        return Padding(
          padding: const EdgeInsets.only(top: Spacing.lg, bottom: Spacing.xs),
          child: Text(b.texto, style: AppText.heading),
        );
      case TipoBloco.divisoria:
        return const Padding(
          padding: EdgeInsets.symmetric(vertical: Spacing.md),
          child: Divider(color: AppColors.border, height: 1),
        );
      case TipoBloco.item:
        return Padding(
          padding: const EdgeInsets.only(left: Spacing.sm, bottom: Spacing.xs),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('•  ', style: corpo.copyWith(color: AppColors.text)),
              Expanded(child: Text.rich(_comNegrito(b.texto, corpo))),
            ],
          ),
        );
      case TipoBloco.paragrafo:
        return Padding(
          padding: const EdgeInsets.only(bottom: Spacing.md),
          child: Text.rich(_comNegrito(b.texto, corpo)),
        );
    }
  }

  static TextSpan _comNegrito(String s, TextStyle base) {
    final partes = s.split('**');
    return TextSpan(
      style: base,
      children: [
        for (var i = 0; i < partes.length; i++)
          TextSpan(
            text: partes[i],
            style: i.isOdd ? const TextStyle(fontWeight: FontWeight.w700, color: AppColors.text) : null,
          ),
      ],
    );
  }
}

enum TipoBloco { titulo, subtitulo, divisoria, item, paragrafo }

class BlocoLegal {
  const BlocoLegal(this.tipo, [this.texto = '']);
  final TipoBloco tipo;
  final String texto;
}

/// Junta as linhas do texto em blocos (paragrafos, itens e titulos).
List<BlocoLegal> blocosDoTextoLegal(String texto) {
  final saida = <BlocoLegal>[];
  final buffer = <String>[];
  TipoBloco? tipoBuffer;

  void fechar() {
    if (buffer.isNotEmpty && tipoBuffer != null) {
      saida.add(BlocoLegal(tipoBuffer!, buffer.join(' ')));
    }
    buffer.clear();
    tipoBuffer = null;
  }

  for (final bruta in texto.split('\n')) {
    final s = bruta.trim();
    if (s.isEmpty) {
      fechar();
    } else if (s.startsWith('## ')) {
      fechar();
      saida.add(BlocoLegal(TipoBloco.subtitulo, s.substring(3).trim()));
    } else if (s.startsWith('# ')) {
      fechar();
      saida.add(BlocoLegal(TipoBloco.titulo, s.substring(2).trim()));
    } else if (s == '---') {
      fechar();
      saida.add(const BlocoLegal(TipoBloco.divisoria));
    } else if (s.startsWith('- ') || s.startsWith('* ')) {
      fechar();
      tipoBuffer = TipoBloco.item;
      buffer.add(s.substring(2).trim());
    } else {
      tipoBuffer ??= TipoBloco.paragrafo;
      buffer.add(s);
    }
  }
  fechar();
  return saida;
}
