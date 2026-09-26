import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';

/// Logo redondo da Fortaleza Mov (icone do motorista).
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.size = 44});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: SweepGradient(colors: [AppColors.brand, AppColors.gold, AppColors.brandDark, AppColors.brand]),
      ),
      padding: const EdgeInsets.all(2.5),
      child: ClipOval(
        child: Image.asset(
          'assets/brand/logo_redondo.png',
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(
            color: AppColors.brandDark,
            alignment: Alignment.center,
            child: Icon(Icons.local_taxi, color: AppColors.gold, size: size * 0.5),
          ),
        ),
      ),
    );
  }
}

/// Estrela com a nota: "★ 5,0".
class RatingChip extends StatelessWidget {
  const RatingChip({super.key, required this.rating});

  final double rating;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(Radii.pill),
        boxShadow: const [BoxShadow(color: Color(0x22000000), blurRadius: 4, offset: Offset(0, 1))],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.star_rounded, size: 18, color: AppColors.text),
          const SizedBox(width: 4),
          Text(
            rating.toStringAsFixed(1).replaceAll('.', ','),
            style: AppText.bodyStrong.copyWith(fontSize: 15),
          ),
        ],
      ),
    );
  }
}

/// Foto (iniciais) com a nota embaixo, nome e "Fortaleza Mov".
class DriverHeader extends StatelessWidget {
  const DriverHeader({super.key, required this.name, required this.initials, required this.rating});

  final String name;
  final String initials;
  final double rating;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 84,
          height: 96,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 80,
                height: 80,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [AppColors.brand, AppColors.brandDark],
                  ),
                ),
                child: Text(
                  initials.isEmpty ? '?' : initials,
                  style: AppText.title.copyWith(color: Colors.white, fontSize: 28),
                ),
              ),
              Positioned(left: 2, bottom: 0, child: RatingChip(rating: rating)),
            ],
          ),
        ),
        const SizedBox(width: Spacing.lg),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.title.copyWith(fontSize: 22),
              ),
              const SizedBox(height: 2),
              Text('Fortaleza Mov', style: AppText.body.copyWith(color: AppColors.textMuted, fontSize: 17)),
            ],
          ),
        ),
      ],
    );
  }
}

/// Linha de menu: texto grande, seta a direita.
class MenuLinha extends StatelessWidget {
  const MenuLinha({
    super.key,
    required this.titulo,
    required this.onTap,
    this.icone,
    this.corIcone,
    this.valor,
    this.selo,
    this.cor,
    this.mostrarSeta = true,
  });

  final String titulo;
  final VoidCallback onTap;
  final IconData? icone;
  final Color? corIcone;
  final String? valor;
  final String? selo;
  final Color? cor;
  final bool mostrarSeta;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Spacing.xl, vertical: 17),
        child: Row(
          children: [
            if (icone != null) ...[
              Icon(icone, size: 24, color: corIcone ?? AppColors.textMuted),
              const SizedBox(width: Spacing.md),
            ],
            Expanded(
              child: Text(
                titulo,
                style: AppText.body.copyWith(fontSize: 18, color: cor ?? AppColors.text, fontWeight: FontWeight.w500),
              ),
            ),
            if (selo != null)
              Container(
                margin: const EdgeInsets.only(right: Spacing.sm),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                decoration: BoxDecoration(color: AppColors.brand, borderRadius: BorderRadius.circular(Radii.pill)),
                child: Text(selo!, style: AppText.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w600)),
              ),
            if (valor != null)
              Padding(
                padding: const EdgeInsets.only(right: Spacing.sm),
                child: Text(valor!, style: AppText.bodyStrong.copyWith(fontSize: 18)),
              ),
            if (mostrarSeta) const Icon(Icons.chevron_right, color: AppColors.text, size: 26),
          ],
        ),
      ),
    );
  }
}

/// Campo so de leitura, com o rotulo em cima da borda (igual formulario).
class CampoLeitura extends StatelessWidget {
  const CampoLeitura({super.key, required this.rotulo, required this.valor});

  final String rotulo;
  final String valor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.lg),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: rotulo,
          labelStyle: AppText.body.copyWith(color: AppColors.textFaint),
          floatingLabelBehavior: FloatingLabelBehavior.always,
          contentPadding: const EdgeInsets.symmetric(horizontal: Spacing.lg, vertical: 18),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: AppColors.border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: AppColors.border),
          ),
          filled: true,
          fillColor: AppColors.surface,
        ),
        child: Text(valor.isEmpty ? '—' : valor, style: AppText.body.copyWith(fontSize: 17)),
      ),
    );
  }
}

/// Botao redondo branco flutuando sobre o mapa (sino, etc.).
class BotaoRedondo extends StatelessWidget {
  const BotaoRedondo({super.key, required this.icone, required this.onTap, this.marcado = false});

  final IconData icone;
  final VoidCallback onTap;
  final bool marcado;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      shape: const CircleBorder(),
      elevation: 3,
      shadowColor: const Color(0x55000000),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 52,
          height: 52,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Icon(icone, color: AppColors.text, size: 26),
              if (marcado)
                Positioned(
                  top: 12,
                  right: 13,
                  child: Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: AppColors.danger,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.surface, width: 1.5),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
