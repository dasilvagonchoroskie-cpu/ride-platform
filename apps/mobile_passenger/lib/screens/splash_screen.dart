import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Ride',
              style: TextStyle(
                color: AppColors.primary,
                fontSize: 44,
                fontWeight: FontWeight.w700,
                letterSpacing: -1,
              ),
            ),
            SizedBox(height: Spacing.xs),
            Text(
              'Seu transporte sob demanda',
              style: TextStyle(color: AppColors.textMuted, fontSize: 15),
            ),
            SizedBox(height: Spacing.xl),
            SizedBox(
              height: 22,
              width: 22,
              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
            ),
          ],
        ),
      ),
    );
  }
}
