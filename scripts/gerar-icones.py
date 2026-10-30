#!/usr/bin/env python3
"""Icones do app (etapa 6, Evandro 29/10/2026).

Uso:
  python3 scripts/gerar-icones.py SIMBOLO.png apps/mobile_passenger [--fundo "#0070B8"] [--escala 0.60]
  python3 scripts/gerar-icones.py SIMBOLO.png apps/mobile_driver    [--fundo "#0070B8"] [--escala 0.50]

Regras do pedido:
- icone adaptativo do Android: simbolo a ~60% sobre o fundo #0070B8;
- motorista: simbolo menor e centralizado (padrao 50%).

O SIMBOLO.png deve ter fundo transparente (so o desenho). As bordas
transparentes sao cortadas antes de medir, entao a escala vale para o
desenho em si. Gera, em android/app/src/main/res:
  mipmap-*/ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png
  values/ic_launcher_background.xml (cor do fundo)
e, ao lado do app:
  loja/icone-512.png (icone da Google Play);
  loja/ios/AppIcon.appiconset (iPhone e iPad: todos os tamanhos + 1024 da
  App Store, sem transparencia, como a Apple pede). A esteira do iPhone
  copia essa pasta para ios/Runner/Assets.xcassets.

Avisa (sem parar) quando a imagem foge do padrao: nao e PNG, pequena,
sem fundo transparente, desenho muito comprido ou com pouco contraste
com a cor do fundo.
"""
import argparse
import json
import pathlib
import re
import sys

from PIL import Image, ImageDraw

DENSIDADES = {'mdpi': 1.0, 'hdpi': 1.5, 'xhdpi': 2.0, 'xxhdpi': 3.0, 'xxxhdpi': 4.0}

# iPhone e iPad (Xcode): (aparelho, tamanho em pontos, escala).
IOS = [
    ('iphone', 20, 2), ('iphone', 20, 3), ('iphone', 29, 2), ('iphone', 29, 3),
    ('iphone', 40, 2), ('iphone', 40, 3), ('iphone', 60, 2), ('iphone', 60, 3),
    ('ipad', 20, 1), ('ipad', 20, 2), ('ipad', 29, 1), ('ipad', 29, 2),
    ('ipad', 40, 1), ('ipad', 40, 2), ('ipad', 76, 1), ('ipad', 76, 2), ('ipad', 83.5, 2),
    ('ios-marketing', 1024, 1),
]


def luminancia(rgb) -> float:
    def canal(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (canal(x) for x in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(a, b) -> float:
    la, lb = sorted((luminancia(a), luminancia(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def avisos_da_imagem(caminho: pathlib.Path, original: Image.Image, simbolo: Image.Image, fundo) -> list:
    """O que foge do padrao (nao para a geracao; so avisa)."""
    avisos = []
    if original.format != 'PNG':
        avisos.append(f'o arquivo e {original.format or "desconhecido"}, nao PNG (mande PNG com fundo transparente).')
    if original.width != original.height:
        avisos.append(f'a imagem nao e quadrada ({original.width}x{original.height}); o desenho foi centralizado.')
    if max(simbolo.size) < 512:
        avisos.append(f'desenho pequeno ({simbolo.width}x{simbolo.height}); o ideal e 1024 px (no minimo 512) para nao ficar borrado.')
    elif max(simbolo.size) < 1024:
        avisos.append(f'desenho de {simbolo.width}x{simbolo.height}: serve, mas o icone de 1024 da App Store fica menos nitido.')
    w, h = simbolo.size
    if max(w, h) > 3 * min(w, h):
        avisos.append(f'desenho muito comprido ({w}x{h}): no icone ele fica fino; prefira um simbolo mais quadrado.')
    alfa = simbolo.getchannel('A')
    if alfa.getextrema()[0] == 255:
        avisos.append('sem fundo transparente: o quadrado da imagem vai aparecer no icone.')
    # Cor media do desenho (so os pontos visiveis) contra o fundo.
    pequeno = simbolo.resize((64, 64))
    px = pequeno.load()
    pixels = [px[x, y] for x in range(64) for y in range(64) if px[x, y][3] > 128]
    if pixels:
        media = tuple(sum(p[i] for p in pixels) / len(pixels) for i in range(3))
        c = contraste(media, fundo)
        if c < 1.5:
            avisos.append(f'pouco contraste entre o desenho e o fundo {"#%02X%02X%02X" % fundo[:3]} ({c:.1f}:1); o simbolo some no celular.')
    return avisos


def cor(texto: str) -> tuple:
    if not re.fullmatch(r'#[0-9A-Fa-f]{6}', texto):
        raise SystemExit(f'Cor invalida: {texto} (use #RRGGBB)')
    return tuple(int(texto[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


def simbolo_no_quadro(simbolo: Image.Image, lado: int, escala: float, fundo=None, forma=None) -> Image.Image:
    quadro = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    if fundo is not None:
        mascara = Image.new('L', (lado, lado), 0)
        d = ImageDraw.Draw(mascara)
        if forma == 'redondo':
            d.ellipse((0, 0, lado - 1, lado - 1), fill=255)
        else:
            d.rounded_rectangle((0, 0, lado - 1, lado - 1), radius=round(lado * 0.18), fill=255)
        quadro.paste(Image.new('RGBA', (lado, lado), fundo), (0, 0), mascara)
    caixa = max(1, round(lado * escala))
    s = simbolo.copy()
    s.thumbnail((caixa, caixa), Image.LANCZOS)
    quadro.alpha_composite(s, ((lado - s.width) // 2, (lado - s.height) // 2))
    return quadro


def main() -> int:
    p = argparse.ArgumentParser(description='Gera os icones do app a partir do simbolo.')
    p.add_argument('simbolo')
    p.add_argument('app', help='pasta do app (ex.: apps/mobile_passenger)')
    p.add_argument('--fundo', default='#0070B8')
    p.add_argument('--escala', type=float, default=None, help='tamanho do simbolo (0.60 = 60%%)')
    a = p.parse_args()

    app = pathlib.Path(a.app)
    res = app / 'android/app/src/main/res'
    if not res.is_dir():
        raise SystemExit(f'Nao achei {res}')
    escala = a.escala if a.escala is not None else (0.50 if 'driver' in app.name else 0.60)
    if not 0.3 <= escala <= 0.8:
        raise SystemExit('Escala fora do normal (use entre 0.30 e 0.80).')
    fundo = cor(a.fundo)

    original = Image.open(a.simbolo)
    simbolo = original.convert('RGBA')
    caixa = simbolo.getchannel('A').getbbox()
    if not caixa:
        raise SystemExit('O simbolo esta vazio (todo transparente).')
    simbolo = simbolo.crop(caixa)
    avisos = avisos_da_imagem(pathlib.Path(a.simbolo), original, simbolo, fundo)
    for aviso in avisos:
        print(f'AVISO: {aviso}', file=sys.stderr)

    for nome, fator in DENSIDADES.items():
        pasta = res / f'mipmap-{nome}'
        pasta.mkdir(parents=True, exist_ok=True)
        lado = round(48 * fator)
        # Adaptativo: tela de 108 dp; o Android corta ate 66 dp do meio.
        simbolo_no_quadro(simbolo, round(108 * fator), escala).save(pasta / 'ic_launcher_foreground.png')
        # Android antigo (sem adaptativo): quadrado arredondado e redondo.
        simbolo_no_quadro(simbolo, lado, min(0.8, escala * 1.1), fundo).save(pasta / 'ic_launcher.png')
        simbolo_no_quadro(simbolo, lado, min(0.8, escala * 1.1), fundo, 'redondo').save(pasta / 'ic_launcher_round.png')

    (res / 'values').mkdir(exist_ok=True)
    (res / 'values/ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">{a.fundo.upper()}</color>\n</resources>\n',
        encoding='utf-8',
    )
    loja = app / 'loja'
    loja.mkdir(exist_ok=True)
    # Google Play: 512x512, quadrado cheio (a loja arredonda sozinha).
    quadrado = Image.new('RGBA', (512, 512), fundo)
    quadrado.alpha_composite(simbolo_no_quadro(simbolo, 512, escala))
    quadrado.convert('RGB').save(loja / 'icone-512.png')

    # iPhone/iPad: quadrado cheio e SEM transparencia (a Apple recusa o 1024
    # com transparencia); o iOS arredonda os cantos sozinho.
    ios = loja / 'ios/AppIcon.appiconset'
    ios.mkdir(parents=True, exist_ok=True)
    imagens = []
    for aparelho, pontos, vezes in IOS:
        px = round(pontos * vezes)
        nome = f'icone-{pontos:g}x{pontos:g}@{vezes}x.png'
        q = Image.new('RGBA', (px, px), fundo)
        q.alpha_composite(simbolo_no_quadro(simbolo, px, escala))
        q.convert('RGB').save(ios / nome)
        imagens.append({'idiom': aparelho, 'size': f'{pontos:g}x{pontos:g}', 'scale': f'{vezes}x', 'filename': nome})
    (ios / 'Contents.json').write_text(
        json.dumps({'images': imagens, 'info': {'version': 1, 'author': 'xcode'}}, indent=2) + '\n', encoding='utf-8'
    )
    print(f'Icones gerados em {res} (simbolo a {round(escala * 100)}% sobre {a.fundo.upper()}), '
          f'{loja / "icone-512.png"} e {len(IOS)} do iPhone/iPad em {ios}')
    if avisos:
        print(f'{len(avisos)} aviso(s) sobre a imagem: veja acima.', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
