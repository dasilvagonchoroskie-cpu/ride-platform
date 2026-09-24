import 'package:flutter/material.dart';

import '../models/aparencia.dart';

/// Botao de acao principal (largura total).
class BotaoApp extends StatelessWidget {
  const BotaoApp({
    super.key,
    required this.label,
    required this.onPressed,
    this.cor,
    this.corTexto,
    this.loading = false,
    this.enabled = true,
    this.icon,
  });

  final String label;
  final VoidCallback onPressed;
  final Color? cor;
  final Color? corTexto;
  final bool loading;
  final bool enabled;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final fundo = cor ?? t.colorScheme.primary;
    final texto = corTexto ?? t.colorScheme.onPrimary;

    return SizedBox(
      height: 54,
      width: double.infinity,
      child: FilledButton(
        onPressed: (!enabled || loading) ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: fundo,
          foregroundColor: texto,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        child: loading
            ? SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(strokeWidth: 2.2, color: texto),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 20, color: texto),
                    const SizedBox(width: 8),
                  ],
                  Text(
                    label,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: texto),
                  ),
                ],
              ),
      ),
    );
  }
}

/// Campo de texto com rotulo.
class CampoApp extends StatelessWidget {
  const CampoApp({
    super.key,
    this.label,
    this.hint,
    this.controller,
    this.keyboardType,
    this.onChanged,
    this.ajuda,
    this.error,
    this.maxLength,
    this.prefixIcon,
    this.suffix,
  });

  final String? label;
  final String? hint;
  final TextEditingController? controller;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;
  final String? ajuda;
  final String? error;
  final int? maxLength;
  final IconData? prefixIcon;
  final Widget? suffix;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) ...[
          Text(
            label!.toUpperCase(),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
              color: t.colorScheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
          const SizedBox(height: 6),
        ],
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          onChanged: onChanged,
          maxLength: maxLength,
          style: TextStyle(fontSize: 16, color: t.colorScheme.onSurface),
          decoration: InputDecoration(
            hintText: hint,
            counterText: '',
            errorText: error,
            helperText: ajuda,
            helperMaxLines: 3,
            helperStyle: TextStyle(fontSize: 12, color: t.colorScheme.onSurface.withValues(alpha: 0.55)),
            filled: true,
            fillColor: t.colorScheme.surfaceContainerHighest,
            prefixIcon: prefixIcon == null ? null : Icon(prefixIcon, size: 20),
            suffixIcon: suffix,
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: t.dividerColor),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: t.dividerColor),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: t.colorScheme.primary, width: 1.6),
            ),
          ),
        ),
      ],
    );
  }
}

/// Cartao de secao.
class Painel extends StatelessWidget {
  const Painel({super.key, required this.child, this.titulo, this.padding});

  final Widget child;
  final String? titulo;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: t.colorScheme.surface,
        border: Border.all(color: t.dividerColor),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (titulo != null) ...[
            Text(
              titulo!,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6,
                color: t.colorScheme.primary,
              ),
            ),
            const SizedBox(height: 12),
          ],
          child,
        ],
      ),
    );
  }
}

/// Etiqueta de status.
class Selo extends StatelessWidget {
  const Selo({super.key, required this.texto, this.cor});

  final String texto;
  final Color? cor;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final c = cor ?? t.colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        texto,
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: c),
      ),
    );
  }
}

/// Seletor segmentado de opcoes.
class SeletorOpcoes<T> extends StatelessWidget {
  const SeletorOpcoes({
    super.key,
    required this.opcoes,
    required this.rotulo,
    required this.selecionado,
    required this.onSelecionar,
  });

  final List<T> opcoes;
  final String Function(T) rotulo;
  final T selecionado;
  final ValueChanged<T> onSelecionar;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final opcao in opcoes)
          GestureDetector(
            onTap: () => onSelecionar(opcao),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: opcao == selecionado
                    ? t.colorScheme.primary.withValues(alpha: 0.18)
                    : t.colorScheme.surfaceContainerHighest,
                border: Border.all(
                  color: opcao == selecionado ? t.colorScheme.primary : t.dividerColor,
                ),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                rotulo(opcao),
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: opcao == selecionado ? t.colorScheme.primary : t.colorScheme.onSurface,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Estado vazio.
class Vazio extends StatelessWidget {
  const Vazio({super.key, required this.texto, this.icon});

  final String texto;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 40, color: t.colorScheme.onSurface.withValues(alpha: 0.3)),
            const SizedBox(height: 12),
          ],
          Text(
            texto,
            textAlign: TextAlign.center,
            style: TextStyle(color: t.colorScheme.onSurface.withValues(alpha: 0.6)),
          ),
        ],
      ),
    );
  }
}

/// Construtor de tema a partir da aparencia escolhida.
ThemeData temaDoApp(Aparencia aparencia) {
  final visual = temaPorNome(aparencia.tema);
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: visual.fundo,
    colorScheme: ColorScheme.dark(
      primary: visual.destaque,
      secondary: visual.destaque,
      surface: visual.painel,
      onSurface: visual.texto,
      onPrimary: visual.fundo,
      surfaceContainerHighest: Color.lerp(visual.painel, visual.fundo, 0.45)!,
      error: const Color(0xFFEF4444),
    ),
    dividerColor: visual.texto.withValues(alpha: 0.12),
    appBarTheme: AppBarTheme(
      backgroundColor: visual.fundo,
      elevation: 0,
      centerTitle: false,
      foregroundColor: visual.texto,
      titleTextStyle: TextStyle(
        color: visual.texto,
        fontSize: 18,
        fontWeight: FontWeight.w600,
      ),
    ),
  );
  return base;
}
