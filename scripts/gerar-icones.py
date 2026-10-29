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
e, ao lado do app, loja/icone-512.png (icone da Google Play).
"""
import argparse
import pathlib
import re
import sys

from PIL import Image, ImageDraw

DENSIDADES = {'mdpi': 1.0, 'hdpi': 1.5, 'xhdpi': 2.0, 'xxhdpi': 3.0, 'xxxhdpi': 4.0}


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

    simbolo = Image.open(a.simbolo).convert('RGBA')
    alfa = simbolo.getchannel('A')
    if alfa.getextrema()[0] == 255:
        print('AVISO: o simbolo nao tem fundo transparente; o quadrado dele vai aparecer no icone.', file=sys.stderr)
    caixa = alfa.getbbox()
    if not caixa:
        raise SystemExit('O simbolo esta vazio (todo transparente).')
    simbolo = simbolo.crop(caixa)
    if max(simbolo.size) < 256:
        print(f'AVISO: simbolo pequeno ({simbolo.width}x{simbolo.height}); o ideal e 512 px ou mais.', file=sys.stderr)

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
    print(f'Icones gerados em {res} (simbolo a {round(escala * 100)}% sobre {a.fundo.upper()}) e {loja / "icone-512.png"}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
