import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/theme/central_theme.dart';
import 'comuns.dart';

/// Foto escolhida na Central, pronta para mandar ao servidor.
class FotoEscolhida {
  const FotoEscolhida(this.mime, this.base64, this.bytes);

  final String mime;
  final String base64;
  final Uint8List bytes;
}

String? _mimeDe(Uint8List b) {
  if (b.length > 3 && b[0] == 0xff && b[1] == 0xd8 && b[2] == 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4e && b[3] == 0x47) return 'image/png';
  if (b.length > 12 && String.fromCharCodes(b.sublist(0, 4)) == 'RIFF' && String.fromCharCodes(b.sublist(8, 12)) == 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/// Camera (o motorista na frente da Central) ou galeria (foto que ele mandou
/// pelo WhatsApp). Devolve a foto ja reduzida (ate 1280 px).
Future<FotoEscolhida?> escolherFoto(BuildContext context, {String titulo = 'Foto do motorista'}) async {
  final origem = await showModalBottomSheet<ImageSource>(
    context: context,
    backgroundColor: AppColors.surface,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Spacing.lg, 0, Spacing.lg, Spacing.sm),
            child: Text(titulo, style: AppText.heading),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Spacing.lg),
            child: Text(
              'O passageiro vê esta foto para reconhecer o motorista: rosto de frente, sem óculos escuros e com boa luz.',
              style: AppText.caption.copyWith(color: AppColors.textMuted),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Tirar foto agora'),
            onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Escolher da galeria'),
            onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
          ),
          const SizedBox(height: Spacing.sm),
        ],
      ),
    ),
  );
  if (origem == null) return null;
  final XFile? arquivo;
  try {
    arquivo = await ImagePicker().pickImage(
      source: origem,
      maxWidth: 1280,
      maxHeight: 1280,
      imageQuality: 75,
      preferredCameraDevice: CameraDevice.front,
    );
  } catch (_) {
    if (context.mounted) avisar(context, 'Não foi possível abrir a câmera ou a galeria. Confira a permissão do aplicativo.', erro: true);
    return null;
  }
  if (arquivo == null) return null;
  final bytes = await arquivo.readAsBytes();
  final mime = _mimeDe(bytes);
  if (mime == null) {
    if (context.mounted) avisar(context, 'Escolha uma foto em JPG, PNG ou WEBP.', erro: true);
    return null;
  }
  return FotoEscolhida(mime, base64Encode(bytes), bytes);
}

/// Foto redonda do motorista com o selo da camera. Toque na foto: abre
/// grande; toque no selo: poe ou troca.
class FotoDoMotorista extends StatelessWidget {
  const FotoDoMotorista({
    super.key,
    required this.caminho,
    required this.iniciais,
    required this.aoTrocar,
    this.local,
    this.tamanho = 72,
    this.enviando = false,
  });

  /// Foto guardada no servidor (/arquivos/...).
  final String? caminho;

  /// Foto escolhida e ainda nao enviada (cadastro novo).
  final Uint8List? local;
  final String iniciais;
  final VoidCallback aoTrocar;
  final double tamanho;
  final bool enviando;

  @override
  Widget build(BuildContext context) {
    final letras = Container(
      width: tamanho,
      height: tamanho,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.brand, AppColors.brandDark],
        ),
      ),
      child: Text(iniciais.isEmpty ? '?' : iniciais, style: AppText.title.copyWith(color: AppColors.onPrimary)),
    );
    final Widget foto;
    if (local != null) {
      foto = ClipOval(child: Image.memory(local!, width: tamanho, height: tamanho, fit: BoxFit.cover));
    } else if (caminho != null && caminho!.isNotEmpty) {
      foto = FotoDoServidor(caminho: caminho!, largura: tamanho, altura: tamanho, redonda: true);
    } else {
      foto = GestureDetector(onTap: aoTrocar, child: letras);
    }
    return SizedBox(
      width: tamanho + 6,
      height: tamanho + 6,
      child: Stack(
        children: [
          foto,
          Positioned(
            right: 0,
            bottom: 0,
            child: Material(
              color: AppColors.primary,
              shape: const CircleBorder(side: BorderSide(color: AppColors.surface, width: 3)),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: enviando ? null : aoTrocar,
                child: SizedBox(
                  width: 32,
                  height: 32,
                  child: Center(
                    child: enviando
                        ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Icon(
                            caminho == null && local == null ? Icons.add_a_photo_outlined : Icons.photo_camera,
                            size: 16,
                            color: Colors.white,
                            semanticLabel: caminho == null && local == null ? 'Pôr foto' : 'Trocar foto',
                          ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String iniciaisDe(String nome) {
  final partes = nome.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).take(2);
  return partes.map((p) => p[0].toUpperCase()).join();
}
