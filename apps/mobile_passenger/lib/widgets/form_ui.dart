import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme/app_theme.dart';

// Pecas das telas de entrada, cidade, cadastro e Meus dados, no padrao
// do modelo: fundo branco, rotulo em cima do campo, campo com borda
// cinza, botao cheio na cor da marca e cinza quando desativado.

/// Tela de formulario: barra branca com seta de voltar e titulo no meio.
class TelaFormulario extends StatelessWidget {
  const TelaFormulario({
    super.key,
    required this.titulo,
    required this.child,
    this.aoVoltar,
    this.rodape,
    this.mostrarVoltar = true,
    this.linha = true,
  });

  final String titulo;
  final Widget child;

  /// O que a seta faz. Sem isto, volta para a tela anterior.
  final VoidCallback? aoVoltar;

  /// Botao fixo embaixo (ex.: Continuar da tela Cidade).
  final Widget? rodape;
  final bool mostrarVoltar;

  /// Linha fina embaixo da barra.
  final bool linha;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        automaticallyImplyLeading: false,
        leading: mostrarVoltar
            ? IconButton(
                icon: const Icon(Icons.arrow_back, size: 28, color: AppColors.text),
                tooltip: 'Voltar',
                onPressed: aoVoltar ?? () => Navigator.of(context).maybePop(),
              )
            : null,
        title: Text(
          titulo,
          style: AppText.heading.copyWith(fontSize: 21, fontWeight: FontWeight.w600, color: AppColors.text),
        ),
        bottom: linha
            ? const PreferredSize(
                preferredSize: Size.fromHeight(1),
                child: Divider(height: 1, thickness: 1, color: AppColors.border),
              )
            : null,
      ),
      body: SafeArea(top: false, bottom: rodape == null, child: child),
      bottomNavigationBar: rodape == null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.sm, Spacing.xl, Spacing.lg),
                child: rodape,
              ),
            ),
    );
  }
}

/// Rotulo em cima do campo ("Nome e sobrenome", "E-mail"...).
class RotuloCampo extends StatelessWidget {
  const RotuloCampo(this.texto, {super.key});

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.sm),
      child: Text(texto, style: AppText.bodyStrong.copyWith(fontSize: 17, color: AppColors.text)),
    );
  }
}

OutlineInputBorder _borda(Color cor, [double largura = 1]) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(Radii.sm),
      borderSide: BorderSide(color: cor, width: largura),
    );

InputDecoration _decoracao({String? dica, String? erro, Widget? prefixo, Widget? sufixo, bool leitura = false}) {
  return InputDecoration(
    hintText: dica,
    hintStyle: AppText.body.copyWith(fontSize: 17, color: AppColors.textFaint),
    errorText: erro,
    errorMaxLines: 3,
    filled: true,
    fillColor: leitura ? AppColors.surfaceElevated : AppColors.surface,
    contentPadding: const EdgeInsets.symmetric(horizontal: Spacing.lg, vertical: 18),
    prefixIcon: prefixo,
    suffixIcon: sufixo,
    border: _borda(AppColors.campoBorda),
    enabledBorder: _borda(AppColors.campoBorda),
    disabledBorder: _borda(AppColors.border),
    focusedBorder: _borda(AppColors.brand, 1.6),
    errorBorder: _borda(AppColors.danger),
    focusedErrorBorder: _borda(AppColors.danger, 1.6),
  );
}

/// Campo de texto com rotulo em cima, ajuda embaixo e olho para senha.
class CampoForm extends StatefulWidget {
  const CampoForm({
    super.key,
    this.rotulo,
    this.dica,
    this.ajuda,
    this.erro,
    this.controller,
    this.teclado,
    this.senha = false,
    this.formatadores,
    this.aoMudar,
    this.acao,
    this.aoEnviar,
    this.somenteLeitura = false,
    this.capitalizar = TextCapitalization.none,
    this.autofocus = false,
    this.prefixo,
    this.preenchimento,
    this.tamanhoMaximo,
  });

  final String? rotulo;
  final String? dica;
  final String? ajuda;
  final String? erro;
  final TextEditingController? controller;
  final TextInputType? teclado;
  final bool senha;
  final List<TextInputFormatter>? formatadores;
  final ValueChanged<String>? aoMudar;
  final TextInputAction? acao;
  final ValueChanged<String>? aoEnviar;
  final bool somenteLeitura;
  final TextCapitalization capitalizar;
  final bool autofocus;
  final Widget? prefixo;
  final Iterable<String>? preenchimento;
  final int? tamanhoMaximo;

  @override
  State<CampoForm> createState() => _CampoFormState();
}

class _CampoFormState extends State<CampoForm> {
  bool _oculto = true;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.rotulo != null) RotuloCampo(widget.rotulo!),
        TextField(
          controller: widget.controller,
          keyboardType: widget.teclado,
          obscureText: widget.senha && _oculto,
          enableSuggestions: !widget.senha,
          autocorrect: !widget.senha,
          inputFormatters: widget.formatadores,
          onChanged: widget.aoMudar,
          textInputAction: widget.acao,
          onSubmitted: widget.aoEnviar,
          readOnly: widget.somenteLeitura,
          textCapitalization: widget.capitalizar,
          autofocus: widget.autofocus,
          autofillHints: widget.preenchimento,
          maxLength: widget.tamanhoMaximo,
          style: AppText.body.copyWith(
            fontSize: 17,
            color: widget.somenteLeitura ? AppColors.textMuted : AppColors.text,
          ),
          decoration: _decoracao(
            dica: widget.dica,
            erro: widget.erro,
            prefixo: widget.prefixo,
            leitura: widget.somenteLeitura,
            sufixo: widget.senha
                ? IconButton(
                    tooltip: _oculto ? 'Mostrar senha' : 'Esconder senha',
                    icon: Icon(_oculto ? Icons.visibility_off : Icons.visibility, color: AppColors.text),
                    onPressed: () => setState(() => _oculto = !_oculto),
                  )
                : null,
          ).copyWith(counterText: ''),
        ),
        if (widget.ajuda != null && widget.erro == null) ...[
          const SizedBox(height: 6),
          Text(widget.ajuda!, style: AppText.body.copyWith(color: AppColors.textMuted, fontSize: 15)),
        ],
      ],
    );
  }
}

/// Campo que abre uma lista para escolher (ex.: Genero: "Selecione").
class CampoSelecao extends StatelessWidget {
  const CampoSelecao({
    super.key,
    required this.valor,
    required this.aoTocar,
    this.rotulo,
    this.erro,
  });

  final String? rotulo;
  final String valor;
  final VoidCallback aoTocar;
  final String? erro;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (rotulo != null) RotuloCampo(rotulo!),
        InkWell(
          borderRadius: BorderRadius.circular(Radii.sm),
          onTap: aoTocar,
          child: InputDecorator(
            decoration: _decoracao(
              erro: erro,
              sufixo: const Icon(Icons.keyboard_arrow_down, color: AppColors.text, size: 28),
            ),
            child: Text(valor, style: AppText.body.copyWith(fontSize: 17, color: AppColors.text)),
          ),
        ),
      ],
    );
  }
}

/// Botao cheio na cor da marca. Desativado fica cinza.
class BotaoPrincipal extends StatelessWidget {
  const BotaoPrincipal({
    super.key,
    required this.texto,
    required this.aoTocar,
    this.ativo = true,
    this.carregando = false,
  });

  final String texto;
  final VoidCallback? aoTocar;
  final bool ativo;
  final bool carregando;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 54,
      width: double.infinity,
      child: FilledButton(
        onPressed: ativo && !carregando ? aoTocar : null,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: Colors.white,
          disabledBackgroundColor: carregando ? AppColors.brand : AppColors.desativado,
          disabledForegroundColor: carregando ? Colors.white : AppColors.desativadoTexto,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.sm)),
        ),
        child: carregando
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
              )
            : Text(texto, style: AppText.button.copyWith(fontSize: 18)),
      ),
    );
  }
}

/// Botao branco com borda ("Continuar com e-mail").
class BotaoContorno extends StatelessWidget {
  const BotaoContorno({super.key, required this.texto, required this.aoTocar, this.icone});

  final String texto;
  final VoidCallback? aoTocar;
  final Widget? icone;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 54,
      width: double.infinity,
      child: OutlinedButton(
        onPressed: aoTocar,
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.text,
          side: const BorderSide(color: AppColors.textMuted, width: 1.2),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.sm)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icone != null) ...[icone!, const SizedBox(width: Spacing.md)],
            Flexible(
              child: Text(
                texto,
                overflow: TextOverflow.ellipsis,
                style: AppText.bodyStrong.copyWith(fontSize: 18, color: AppColors.text),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Linha com "ou" no meio.
class DivisorOu extends StatelessWidget {
  const DivisorOu({super.key});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(child: Divider(color: AppColors.campoBorda)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Spacing.lg),
          child: Text('ou', style: AppText.body.copyWith(fontSize: 17, color: AppColors.textMuted)),
        ),
        const Expanded(child: Divider(color: AppColors.campoBorda)),
      ],
    );
  }
}

/// Circulo de escolha unica (como na lista de cidades do modelo).
class MarcaEscolha extends StatelessWidget {
  const MarcaEscolha({super.key, required this.marcado});

  final bool marcado;

  @override
  Widget build(BuildContext context) {
    return Icon(
      marcado ? Icons.radio_button_checked : Icons.radio_button_unchecked,
      size: 28,
      color: marcado ? AppColors.brand : AppColors.textMuted,
    );
  }
}

/// Lista de opcoes que sobe de baixo. Devolve o valor escolhido.
Future<String?> escolherOpcao(
  BuildContext context, {
  required String titulo,
  required List<(String, String)> opcoes,
  String? atual,
}) {
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: AppColors.surface,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (ctx) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.7),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.sm),
              child: Text(titulo, style: AppText.heading.copyWith(fontSize: 20)),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final o in opcoes)
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: Spacing.xl),
                      title: Text(o.$2, style: AppText.body.copyWith(fontSize: 17)),
                      trailing: MarcaEscolha(marcado: o.$1 == atual),
                      onTap: () => Navigator.of(ctx).pop(o.$1),
                    ),
                ],
              ),
            ),
            const SizedBox(height: Spacing.md),
          ],
        ),
      ),
    ),
  );
}
