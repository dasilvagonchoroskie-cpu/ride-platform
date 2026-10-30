#!/usr/bin/env python3
"""Previa dos icones gerados (Etapa 6): uma folha PNG para conferir no celular.

Uso:
  python3 scripts/previa-icones.py SAIDA.png apps/mobile_passenger apps/mobile_driver apps/central_app

Para cada app mostra, como o Android desenha a partir dos arquivos gerados:
  redondo, gota (squircle) e quadrado arredondado (icone adaptativo com o
  fundo + simbolo; cada marca de celular usa um formato), o monocromatico do
  Android 13+ (icones com tema), o legado e o redondo legado (Android 7 para
  tras), a Google Play (512) e uma guia com o circulo seguro de 66 dp.
Le so os PNG/XML do app; nao muda nada.
"""
import pathlib
import re
import sys

from PIL import Image, ImageDraw, ImageFont

LADO = 144  # px de cada icone na folha
FONTE = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def fonte(t):
    try:
        return ImageFont.truetype(FONTE, t)
    except OSError:
        return ImageFont.load_default()


def mascara(forma: str, lado: int) -> Image.Image:
    m = Image.new('L', (lado * 4, lado * 4), 0)
    d = ImageDraw.Draw(m)
    L = lado * 4 - 1
    if forma == 'redondo':
        d.ellipse((0, 0, L, L), fill=255)
    elif forma == 'gota':
        # "squircle" (superelipse n=4), como em varios Samsung/Pixel.
        pts = []
        import math
        for i in range(720):
            t = 2 * math.pi * i / 720
            c, s = math.cos(t), math.sin(t)
            x = abs(c) ** 0.5 * (1 if c >= 0 else -1)
            y = abs(s) ** 0.5 * (1 if s >= 0 else -1)
            pts.append((L / 2 + x * L / 2, L / 2 + y * L / 2))
        d.polygon(pts, fill=255)
    else:
        d.rounded_rectangle((0, 0, L, L), radius=round(L * 0.2), fill=255)
    return m.resize((lado, lado), Image.LANCZOS)


def adaptativo(res: pathlib.Path, forma: str, tema=False) -> Image.Image:
    """Fundo + simbolo (108 dp) cortado no miolo de 72 dp e na forma."""
    pasta = res / 'mipmap-xxxhdpi'
    cor = re.search(r'#([0-9A-Fa-f]{6})', (res / 'values/ic_launcher_background.xml').read_text())
    fundo = tuple(int(cor.group(1)[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
    camada = Image.open(pasta / ('ic_launcher_monochrome.png' if tema else 'ic_launcher_foreground.png')).convert('RGBA')
    t = camada.width
    if tema:
        # Tema claro do Android 13: fundo pastel e simbolo no tom escuro.
        base = Image.new('RGBA', (t, t), (214, 227, 255, 255))
        tinta = Image.new('RGBA', (t, t), (0, 49, 96, 255))
        base.paste(tinta, (0, 0), camada.getchannel('A'))
    else:
        base = Image.new('RGBA', (t, t), fundo)
        base.alpha_composite(camada)
    corte = round(t * 18 / 108)
    miolo = base.crop((corte, corte, t - corte, t - corte)).resize((LADO, LADO), Image.LANCZOS)
    saida = Image.new('RGBA', (LADO, LADO), (0, 0, 0, 0))
    saida.paste(miolo, (0, 0), mascara(forma, LADO))
    return saida


def guia(res: pathlib.Path) -> Image.Image:
    i = adaptativo(res, 'quadrado').copy()
    d = ImageDraw.Draw(i)
    r = LADO * (66 / 72) / 2
    c = LADO / 2
    d.ellipse((c - r, c - r, c + r, c + r), outline=(255, 64, 64, 255), width=2)
    return i


def plano(caminho: pathlib.Path) -> Image.Image:
    return Image.open(caminho).convert('RGBA').resize((LADO, LADO), Image.LANCZOS)


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    saida = pathlib.Path(sys.argv[1])
    apps = [pathlib.Path(a) for a in sys.argv[2:]]
    colunas = [
        ('Redondo', lambda r, a: adaptativo(r, 'redondo')),
        ('Gota', lambda r, a: adaptativo(r, 'gota')),
        ('Quadrado', lambda r, a: adaptativo(r, 'quadrado')),
        ('Tema (13+)', lambda r, a: adaptativo(r, 'redondo', tema=True)),
        ('Legado', lambda r, a: plano(r / 'mipmap-xxxhdpi/ic_launcher.png')),
        ('Legado red.', lambda r, a: plano(r / 'mipmap-xxxhdpi/ic_launcher_round.png')),
        ('Play 512', lambda r, a: plano(a / 'loja/icone-512.png')),
        ('Guia 66 dp', lambda r, a: guia(r)),
    ]
    m = 24
    topo = 40
    rotulo = 30
    W = m + len(colunas) * (LADO + m)
    H = topo + len(apps) * (LADO + rotulo + 44)
    folha = Image.new('RGBA', (W, H), (245, 245, 247, 255))
    d = ImageDraw.Draw(folha)
    for j, (nome, _) in enumerate(colunas):
        x = m + j * (LADO + m)
        d.text((x + LADO / 2, 20), nome, fill=(60, 60, 67, 255), font=fonte(15), anchor='mm')
    for i, app in enumerate(apps):
        res = app / 'android/app/src/main/res'
        y = topo + i * (LADO + rotulo + 44)
        d.text((m, y + 6), app.name, fill=(20, 20, 20, 255), font=fonte(17))
        for j, (_, fazer) in enumerate(colunas):
            x = m + j * (LADO + m)
            folha.alpha_composite(fazer(res, app), (x, y + rotulo))
    folha.convert('RGB').save(saida)
    print(f'Previa salva em {saida}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
