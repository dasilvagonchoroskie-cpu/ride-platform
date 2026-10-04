import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'config/app_config.dart';
import 'storage/app_storage.dart';
import 'theme/app_theme.dart';

/// Foto escolhida, pronta para mandar ao servidor.
class FotoEscolhida {
  const FotoEscolhida(this.mime, this.base64);

  final String mime;
  final String base64;
}

String? _mimeDe(Uint8List b) {
  if (b.length > 3 && b[0] == 0xff && b[1] == 0xd8 && b[2] == 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4e && b[3] == 0x47) return 'image/png';
  if (b.length > 12 && String.fromCharCodes(b.sublist(0, 4)) == 'RIFF' && String.fromCharCodes(b.sublist(8, 12)) == 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/// Pergunta Camera ou Galeria e devolve a foto ja reduzida (ate 1280 px).
Future<FotoEscolhida?> escolherFoto(BuildContext context, {String titulo = 'Foto'}) async {
  final origem = await showModalBottomSheet<ImageSource>(
    context: context,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.all(Spacing.lg),
            child: Text(titulo, style: AppText.heading),
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
          const SizedBox(height: Spacing.md),
        ],
      ),
    ),
  );
  if (origem == null) return null;
  final arquivo = await ImagePicker().pickImage(source: origem, maxWidth: 1280, maxHeight: 1280, imageQuality: 75);
  if (arquivo == null) return null;
  final bytes = await arquivo.readAsBytes();
  final mime = _mimeDe(bytes);
  if (mime == null) return null;
  return FotoEscolhida(mime, base64Encode(bytes));
}

/// Mostra uma foto guardada no servidor (precisa do login).
class FotoDoServidor extends StatelessWidget {
  const FotoDoServidor({super.key, required this.caminho, this.tamanho = 72, this.reserva});

  /// Ex.: /arquivos/123 (como o servidor devolve).
  final String caminho;
  final double tamanho;
  final Widget? reserva;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String?>(
      future: AppStorage.read(AppStorage.accessToken),
      builder: (context, token) {
        if (!token.hasData) return reserva ?? SizedBox(width: tamanho, height: tamanho);
        return ClipOval(
          child: Image.network(
            '${AppConfig.apiUrl}/api$caminho',
            width: tamanho,
            height: tamanho,
            fit: BoxFit.cover,
            headers: {'Authorization': 'Bearer ${token.data}'},
            errorBuilder: (context, error, stack) => reserva ?? SizedBox(width: tamanho, height: tamanho),
          ),
        );
      },
    );
  }
}
