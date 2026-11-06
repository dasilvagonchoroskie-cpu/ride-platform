#!/usr/bin/env python3
"""Icones a partir de uma ARTE PRONTA (Evandro, 06/11/2026).

Uso:
  python3 scripts/gerar-icones-arte.py ARTE.png apps/mobile_driver [--tamanho 66]

Diferente de gerar-icones.py (simbolo transparente sobre fundo azul), aqui
a imagem ja e o icone inteiro, com o proprio fundo (as artes 3D azul e
dourado). Ela aparece como foi desenhada:

- Icone adaptativo (Android 8+; vale para o APK e para o AAB da Google
  Play, que usam a mesma pasta res): a camada da frente tem 108 dp e o
  celular mostra o miolo de 72 dp, recortado em circulo, gota ou quadrado
  arredondado conforme o aparelho. A arte fica com --tamanho dp (66 = cabe
  inteira no circulo seguro) e a sobra ate 108 dp e a borda da propria arte
  espelhada e desfocada, para nao aparecer emenda em nenhum formato nem no
  efeito de movimento.
- Monocromatico (Android 13+, "icones com tema"): so as partes douradas da
  arte, em branco; o celular pinta com a cor do tema.
- Legado (Android 7 para tras): a arte inteira em quadrado arredondado e
  em circulo.
- Loja: loja/icone-512.png (Google Play) e loja/ios/AppIcon.appiconset
  (iPhone e iPad), a arte inteira, sem transparencia.
- loja/arte-original.png: copia da arte usada.
"""
import argparse
import json
import pathlib
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

DENSIDADES = {'mdpi': 1.0, 'hdpi': 1.5, 'xhdpi': 2.0, 'xxhdpi': 3.0, 'xxxhdpi': 4.0}
ADAPTATIVO_DP = 108
VISIVEL_DP = 72
SEGURO_DP = 66

IOS = [
    ('iphone', 20, 2), ('iphone', 20, 3), ('iphone', 29, 2), ('iphone', 29, 3),
    ('iphone', 40, 2), ('iphone', 40, 3), ('iphone', 60, 2), ('iphone', 60, 3),
    ('ipad', 20, 1), ('ipad', 20, 2), ('ipad', 29, 1), ('ipad', 29, 2),
    ('ipad', 40, 1), ('ipad', 40, 2), ('ipad', 76, 1), ('ipad', 76, 2), ('ipad', 83.5, 2),
    ('ios-marketing', 1024, 1),
]

ADAPTATIVO_XML = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
    '    <background android:drawable="@color/ic_launcher_background"/>\n'
    '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
    '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n'
    '</adaptive-icon>\n'
)


def quadrada(img: Image.Image) -> Image.Image:
    """Recorta o centro quadrado (a arte deve ser quadrada; se nao for, corta as sobras)."""
    img = img.convert('RGB')
    lado = min(img.size)
    x, y = (img.width - lado) // 2, (img.height - lado) // 2
    return img.crop((x, y, x + lado, y + lado))


def tela_adaptativa(arte: Image.Image, px: int, tamanho_dp: float) -> Image.Image:
    """Camada de 108 dp (px pixels) com a arte no meio e a borda espelhada e desfocada em volta."""
    lado_arte = round(px * tamanho_dp / ADAPTATIVO_DP)
    a = np.asarray(arte.resize((lado_arte, lado_arte), Image.LANCZOS))
    antes = (px - lado_arte) // 2
    depois = px - lado_arte - antes
    cheia = np.pad(a, ((antes, depois), (antes, depois), (0, 0)), mode='symmetric')
    base = Image.fromarray(cheia)
    borrada = base.filter(ImageFilter.GaussianBlur(max(1, px / 40)))
    # Arte nitida no meio; desfoque so na sobra, com uma transicao curta.
    mascara = Image.new('L', (px, px), 0)
    ImageDraw.Draw(mascara).rectangle((antes, antes, antes + lado_arte - 1, antes + lado_arte - 1), fill=255)
    mascara = mascara.filter(ImageFilter.GaussianBlur(max(1, px / 200)))
    borrada.paste(base, (0, 0), mascara)
    return borrada.convert('RGBA')


def monocromatico(camada: Image.Image) -> Image.Image:
    """So o dourado/amarelo da arte, em branco com transparencia."""
    a = np.asarray(camada.convert('RGB')).astype(np.float64)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    amarelo = (np.minimum(r, g * 1.15) - b - 35) / 55
    alfa = amarelo.clip(0, 1)
    saida = np.zeros(a.shape[:2] + (4,), np.uint8)
    saida[..., :3] = 255
    saida[..., 3] = (alfa * 255).round().astype(np.uint8)
    return Image.fromarray(saida, 'RGBA')


def recortada(img: Image.Image, forma: str) -> Image.Image:
    lado = img.width
    mascara = Image.new('L', (lado * 4, lado * 4), 0)
    d = ImageDraw.Draw(mascara)
    if forma == 'redondo':
        d.ellipse((0, 0, lado * 4 - 1, lado * 4 - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, lado * 4 - 1, lado * 4 - 1), radius=round(lado * 4 * 0.18), fill=255)
    saida = Image.new('RGBA', img.size, (0, 0, 0, 0))
    saida.paste(img.convert('RGBA'), (0, 0), mascara.resize(img.size, Image.LANCZOS))
    return saida


def cor_da_borda(arte: Image.Image) -> str:
    a = np.asarray(arte.convert('RGB')).astype(np.float64)
    borda = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    r, g, b = borda.mean(0).round().astype(int)
    return f'#{r:02X}{g:02X}{b:02X}'


def por_round_icon(manifesto: pathlib.Path) -> bool:
    if not manifesto.is_file():
        return False
    texto = manifesto.read_text(encoding='utf-8')
    if 'android:roundIcon' in texto:
        return False
    novo, n = re.subn(r'(\n(\s*)android:icon="@mipmap/ic_launcher")',
                      r'\1\n\2android:roundIcon="@mipmap/ic_launcher_round"', texto, count=1)
    if n:
        manifesto.write_text(novo, encoding='utf-8')
    return bool(n)


def main() -> int:
    p = argparse.ArgumentParser(description='Gera os icones do app a partir de uma arte pronta (com fundo).')
    p.add_argument('arte')
    p.add_argument('app')
    p.add_argument('--tamanho', type=float, default=66, help='tamanho da arte no icone adaptativo, em dp (padrao 66)')
    a = p.parse_args()
    app = pathlib.Path(a.app)
    res = app / 'android/app/src/main/res'
    if not res.is_dir():
        raise SystemExit(f'Nao achei {res}')
    if not 60 <= a.tamanho <= VISIVEL_DP:
        raise SystemExit('Tamanho fora do normal (use entre 60 e 72 dp).')
    original = Image.open(a.arte)
    original.load()
    if original.width != original.height:
        print('AVISO: a arte nao e quadrada; usei o centro quadrado.', file=sys.stderr)
    if min(original.size) < 1024:
        print(f'AVISO: arte pequena ({original.width}x{original.height}); o ideal e 1024x1024 ou mais.', file=sys.stderr)
    arte = quadrada(original)
    fundo = cor_da_borda(arte)

    for nome, fator in DENSIDADES.items():
        pasta = res / f'mipmap-{nome}'
        pasta.mkdir(parents=True, exist_ok=True)
        tela = round(ADAPTATIVO_DP * fator)
        camada = tela_adaptativa(arte, tela, a.tamanho)
        camada.save(pasta / 'ic_launcher_foreground.png')
        monocromatico(camada).save(pasta / 'ic_launcher_monochrome.png')
        lado = round(48 * fator)
        recortada(arte.resize((lado, lado), Image.LANCZOS), 'quadrado').save(pasta / 'ic_launcher.png')
        # Redondo antigo: o mesmo miolo do adaptativo (a arte cabe no circulo).
        miolo = tela_adaptativa(arte, tela * 4, a.tamanho)
        corte = round(tela * 4 * (ADAPTATIVO_DP - VISIVEL_DP) / 2 / ADAPTATIVO_DP)
        miolo = miolo.crop((corte, corte, tela * 4 - corte, tela * 4 - corte)).resize((lado, lado), Image.LANCZOS)
        recortada(miolo, 'redondo').save(pasta / 'ic_launcher_round.png')

    v26 = res / 'mipmap-anydpi-v26'
    v26.mkdir(exist_ok=True)
    (v26 / 'ic_launcher.xml').write_text(ADAPTATIVO_XML, encoding='utf-8')
    (v26 / 'ic_launcher_round.xml').write_text(ADAPTATIVO_XML, encoding='utf-8')
    (res / 'values').mkdir(exist_ok=True)
    (res / 'values/ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">{fundo}</color>\n</resources>\n',
        encoding='utf-8',
    )
    if por_round_icon(app / 'android/app/src/main/AndroidManifest.xml'):
        print('AndroidManifest.xml: android:roundIcon adicionado.')

    loja = app / 'loja'
    loja.mkdir(exist_ok=True)
    for velho in ('simbolo-original.png', 'simbolo-limpo.png'):
        (loja / velho).unlink(missing_ok=True)
    arte.save(loja / 'arte-original.png')
    arte.resize((512, 512), Image.LANCZOS).save(loja / 'icone-512.png')
    ios = loja / 'ios/AppIcon.appiconset'
    ios.mkdir(parents=True, exist_ok=True)
    imagens = []
    for aparelho, pontos, vezes in IOS:
        px = round(pontos * vezes)
        nome = f'icone-{pontos:g}x{pontos:g}@{vezes}x.png'
        arte.resize((px, px), Image.LANCZOS).save(ios / nome)
        imagens.append({'idiom': aparelho, 'size': f'{pontos:g}x{pontos:g}', 'scale': f'{vezes}x', 'filename': nome})
    (ios / 'Contents.json').write_text(
        json.dumps({'images': imagens, 'info': {'version': 1, 'author': 'xcode'}}, indent=2) + '\n', encoding='utf-8'
    )
    print(f'Icones gerados em {res} (arte com {a.tamanho:g} dp no adaptativo, fundo {fundo}), loja/icone-512.png e {len(IOS)} do iPhone/iPad.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
