#!/usr/bin/env python3
"""
Gera os icones dos aplicativos da plataforma Fortaleza Mov.

Design (identico ao das referencias do usuario):
  - fundo: quadrado arredondado com degrade azul-escuro (claro no topo,
    escuro na base)
  - emblema: circulo dourado com asas estilizadas apontando para os lados
  - simbolo interno:
      passageiro -> silhueta humana branca
      motorista  -> volante escuro dentro de um pino de localizacao
      central    -> monitor com grade (painel administrativo)

Uso:  python3 tools/generate_app_icons.py
Saida: apps/*/android/app/src/main/res/mipmap-*/ic_launcher*.png
       apps/*/android/app/src/main/res/values/ic_launcher_background.xml
       assets/icones/*.png (masters 1024x1024)
"""
from __future__ import annotations

import math
import pathlib

from PIL import Image, ImageDraw, ImageFilter

# ----------------------------------------------------------------------
# Paleta
# ----------------------------------------------------------------------
BG_TOP = (31, 78, 140)      # #1F4E8C
BG_BOTTOM = (8, 24, 46)     # #08182E
GOLD_LIGHT = (255, 216, 107)  # #FFD86B
GOLD = (247, 190, 62)         # #F7BE3E
GOLD_DARK = (214, 152, 32)    # #D69820
WHITE = (255, 255, 255)
DARK = (10, 26, 48)           # #0A1A30

SS = 4  # supersampling


def vertical_gradient(size: int, top: tuple, bottom: tuple) -> Image.Image:
    img = Image.new('RGB', (1, size))
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return img.resize((size, size), Image.BILINEAR)


def rounded_mask(size: int, radius_ratio: float = 0.235) -> Image.Image:
    """Mascara de quadrado arredondado (formato de icone Android)."""
    mask = Image.new('L', (size * SS, size * SS), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size * SS - 1, size * SS - 1],
        radius=int(size * SS * radius_ratio),
        fill=255,
    )
    return mask.resize((size, size), Image.LANCZOS)


def radial_highlight(size: int) -> Image.Image:
    """Brilho suave no canto superior esquerdo."""
    layer = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(layer)
    cx, cy = size * 0.30, size * 0.16
    steps = 60
    for i in range(steps, 0, -1):
        r = size * 0.72 * (i / steps)
        alpha = int(46 * (1 - i / steps) ** 1.6)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=alpha)
    return layer.filter(ImageFilter.GaussianBlur(size * 0.05))


def gold_ring(size: int, cx: float, cy: float, r: float, width: float, inner: tuple) -> Image.Image:
    """Anel dourado com degrade vertical."""
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=inner + (255,), outline=GOLD_LIGHT + (255,), width=int(width))
    return layer


def wing_points(cx: float, cy: float, r: float, direction: int) -> list[tuple[float, float]]:
    """Asa estilizada com tres pontas (penas)."""
    return [
        (cx + direction * r * 0.70, cy - r * 0.30),
        (cx + direction * r * 1.45, cy - r * 0.98),
        (cx + direction * r * 2.22, cy - r * 0.72),
        (cx + direction * r * 1.82, cy - r * 0.46),
        (cx + direction * r * 2.34, cy - r * 0.24),
        (cx + direction * r * 1.78, cy - r * 0.04),
        (cx + direction * r * 2.18, cy + r * 0.18),
        (cx + direction * r * 1.58, cy + r * 0.26),
        (cx + direction * r * 1.74, cy + r * 0.48),
        (cx + direction * r * 0.68, cy + r * 0.34),
    ]


def draw_person(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float, color: tuple) -> None:
    """Silhueta humana: cabeca + ombros."""
    head_r = r * 0.30
    d.ellipse(
        [cx - head_r, cy - r * 0.62, cx + head_r, cy - r * 0.62 + head_r * 2],
        fill=color + (255,),
    )
    body_w = r * 0.62
    body_h = r * 0.52
    d.rounded_rectangle(
        [cx - body_w / 2, cy - r * 0.02, cx + body_w / 2, cy + body_h],
        radius=int(body_w * 0.42),
        fill=color + (255,),
    )


def draw_steering_wheel(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float, color: tuple) -> None:
    """Volante: anel externo + cubo + tres raios."""
    outer = r * 0.66
    ring_w = r * 0.17
    d.ellipse(
        [cx - outer, cy - outer, cx + outer, cy + outer],
        outline=color + (255,),
        width=int(ring_w),
    )
    hub = r * 0.19
    d.ellipse([cx - hub, cy - hub, cx + hub, cy + hub], fill=color + (255,))
    spoke_w = r * 0.12
    # raio horizontal (esquerda/direita)
    d.rectangle([cx - outer, cy - spoke_w / 2, cx + outer, cy + spoke_w / 2], fill=color + (255,))
    # raio inferior
    d.polygon(
        [
            (cx - spoke_w * 0.6, cy + hub * 0.4),
            (cx + spoke_w * 0.6, cy + hub * 0.4),
            (cx + spoke_w * 0.6, cy + outer),
            (cx - spoke_w * 0.6, cy + outer),
        ],
        fill=color + (255,),
    )
    # recorta o centro do anel para o raio nao invadir o cubo
    d.ellipse([cx - hub, cy - hub, cx + hub, cy + hub], fill=color + (255,))


def draw_monitor(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float, color: tuple) -> None:
    """Monitor do painel: tela + grade de dados + base."""
    w = r * 0.92
    h = r * 0.64
    top = cy - r * 0.46
    d.rounded_rectangle(
        [cx - w / 2, top, cx + w / 2, top + h],
        radius=int(r * 0.10),
        fill=color + (255,),
    )
    # barras da grade (recorte na cor do emblema)
    bar = r * 0.10
    for i in range(3):
        y = top + h * (0.26 + i * 0.24)
        d.rectangle([cx - w / 2 + r * 0.12, y, cx + w / 2 - r * 0.12 - (i * r * 0.14), y + bar], fill=(0, 0, 0, 0))
    # haste e base
    d.rectangle([cx - r * 0.07, top + h, cx + r * 0.07, top + h + r * 0.16], fill=color + (255,))
    d.rounded_rectangle(
        [cx - r * 0.30, top + h + r * 0.14, cx + r * 0.30, top + h + r * 0.24],
        radius=int(r * 0.05),
        fill=color + (255,),
    )


def make_icon(kind: str, size: int = 1024, padding: float = 0.0) -> Image.Image:
    """Gera o icone. `padding` > 0 reduz o emblema (usado no foreground adaptativo)."""
    big = size * SS
    canvas = Image.new('RGBA', (big, big), (0, 0, 0, 0))

    # ---- fundo com degrade ----
    bg = vertical_gradient(big, BG_TOP, BG_BOTTOM).convert('RGBA')
    hl = radial_highlight(big)
    bg = Image.composite(Image.new('RGBA', (big, big), (255, 255, 255, 255)), bg, hl.point(lambda v: int(v * 1.15)))
    canvas.paste(bg, (0, 0))

    d = ImageDraw.Draw(canvas)

    # ---- emblema dourado ----
    scale = 1.0 - padding
    cx, cy = big / 2, big / 2 + big * 0.02
    r = big * 0.135 * scale

    if kind == 'driver':
        # Pino de localizacao (gota apontando para baixo) com asas
        pin_top = cy - r * 1.45
        pin_bottom = cy + r * 1.55
        pin_w = r * 1.30

        for direction in (-1, 1):
            d.polygon(wing_points(cx, cy - r * 0.30, r * 0.92, direction), fill=GOLD + (255,))

        # corpo do pino
        d.ellipse([cx - pin_w, pin_top, cx + pin_w, pin_top + pin_w * 2], fill=GOLD + (255,))
        d.polygon(
            [
                (cx - pin_w * 0.72, pin_top + pin_w * 1.35),
                (cx + pin_w * 0.72, pin_top + pin_w * 1.35),
                (cx, pin_bottom),
            ],
            fill=GOLD + (255,),
        )
        # contorno claro
        d.ellipse([cx - pin_w, pin_top, cx + pin_w, pin_top + pin_w * 2], outline=GOLD_LIGHT + (255,), width=int(big * 0.006))

        # circulo interno escuro + volante
        inner_r = pin_w * 0.74
        icx, icy = cx, pin_top + pin_w
        d.ellipse([icx - inner_r, icy - inner_r, icx + inner_r, icy + inner_r], fill=DARK + (255,))
        draw_steering_wheel(d, icx, icy, inner_r, GOLD_LIGHT)

    else:
        # Circulo dourado com asas
        for direction in (-1, 1):
            d.polygon(wing_points(cx, cy, r, direction), fill=GOLD + (255,))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD + (255,))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=GOLD_LIGHT + (255,), width=int(big * 0.007))
        d.ellipse(
            [cx - r * 0.80, cy - r * 0.80, cx + r * 0.80, cy + r * 0.80],
            outline=GOLD_DARK + (140,),
            width=int(big * 0.004),
        )

        if kind == 'passenger':
            draw_person(d, cx, cy, r * 0.86, WHITE)
        else:  # central
            draw_monitor(d, cx, cy, r * 0.86, WHITE)

    # ---- arredondamento do quadrado ----
    mask = rounded_mask(size, 0.235).resize((big, big), Image.LANCZOS)
    canvas.putalpha(Image.composite(canvas.getchannel('A'), Image.new('L', (big, big), 0), mask))

    return canvas.resize((size, size), Image.LANCZOS)


# ----------------------------------------------------------------------
# Android
# ----------------------------------------------------------------------
DENSITIES = {
    'mdpi': 48,
    'hdpi': 72,
    'xhdpi': 96,
    'xxhdpi': 144,
    'xxxhdpi': 192,
}

FOREGROUND_DENSITIES = {
    'mdpi': 108,
    'hdpi': 162,
    'xhdpi': 216,
    'xxhdpi': 324,
    'xxxhdpi': 432,
}

BACKGROUND_HEX = '#1F4E8C'

APPS = {
    'mobile_passenger': 'passenger',
    'mobile_driver': 'driver',
}


def main() -> None:
    root = pathlib.Path(__file__).resolve().parent.parent
    masters = root / 'assets' / 'icones'
    masters.mkdir(parents=True, exist_ok=True)

    print('Gerando icones mestres (1024x1024)...')
    for kind in ('passenger', 'driver', 'central'):
        icon = make_icon(kind, 1024)
        icon.save(masters / f'fortaleza-mov-{kind}.png')
        print(f'  assets/icones/fortaleza-mov-{kind}.png')

    for app, kind in APPS.items():
        res = root / 'apps' / app / 'android' / 'app' / 'src' / 'main' / 'res'
        if not res.exists():
            print(f'  [aviso] res nao encontrado para {app}, ignorando')
            continue

        print(f'Aplicando icones em {app}...')
        for density, px in DENSITIES.items():
            folder = res / f'mipmap-{density}'
            folder.mkdir(parents=True, exist_ok=True)
            make_icon(kind, px).save(folder / 'ic_launcher.png')
            make_icon(kind, px).save(folder / 'ic_launcher_round.png')

        for density, px in FOREGROUND_DENSITIES.items():
            folder = res / f'mipmap-{density}'
            folder.mkdir(parents=True, exist_ok=True)
            # foreground: emblema menor (zona segura de 66%)
            fg = Image.new('RGBA', (px, px), (0, 0, 0, 0))
            inner = make_icon(kind, int(px * 0.72))
            fg.paste(inner, ((px - inner.width) // 2, (px - inner.height) // 2), inner)
            fg.save(folder / 'ic_launcher_foreground.png')

        values = res / 'values'
        values.mkdir(parents=True, exist_ok=True)
        (values / 'ic_launcher_background.xml').write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<resources>\n'
            f'    <color name="ic_launcher_background">{BACKGROUND_HEX}</color>\n'
            '</resources>\n'
        )

        anydpi = res / 'mipmap-anydpi-v26'
        anydpi.mkdir(parents=True, exist_ok=True)
        (anydpi / 'ic_launcher.xml').write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@color/ic_launcher_background"/>\n'
            '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
            '</adaptive-icon>\n'
        )
        (anydpi / 'ic_launcher_round.xml').write_text(
            (anydpi / 'ic_launcher.xml').read_text()
        )

    print('Concluido.')


if __name__ == '__main__':
    main()
