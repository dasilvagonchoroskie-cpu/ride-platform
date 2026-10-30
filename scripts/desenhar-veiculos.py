#!/usr/bin/env python3
"""Desenha o carro e a moto do mapa (vistos de cima, frente para CIMA).

Evandro, 30/10/2026: "o carro tem que acompanhar o sentido da rua" e "mudar
de cor conforme a disponibilidade". O app gira a figura pelo rumo do GPS
(0 = norte), entao a frente fica no alto da imagem.

Cores (as mesmas da Central): livre = verde, ocupado (em corrida) =
laranja, offline = cinza.

Uso: python3 scripts/desenhar-veiculos.py apps/mobile_driver/assets/markers apps/mobile_passenger/assets/markers
Gera carro_livre.png, carro_ocupado.png, carro_offline.png e moto_*.png
(192 x 192, transparentes; o app mostra com ~44 px).
"""
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFilter

CORES = {
    'livre': (30, 158, 90),
    'ocupado': (232, 113, 10),
    'offline': (142, 142, 147),
}
LADO = 192
K = 4  # desenha 4x maior e reduz (bordas lisas)


def tom(rgb, f):
    """f > 0 clareia, f < 0 escurece."""
    if f >= 0:
        return tuple(round(c + (255 - c) * f) for c in rgb)
    return tuple(round(c * (1 + f)) for c in rgb)


def sombra(L, caixa, raio):
    s = Image.new('RGBA', (L, L), (0, 0, 0, 0))
    ImageDraw.Draw(s).rounded_rectangle(caixa, radius=raio, fill=(0, 0, 0, 110))
    return s.filter(ImageFilter.GaussianBlur(5 * K))


def carro(cor) -> Image.Image:
    L = LADO * K
    im = Image.new('RGBA', (L, L), (0, 0, 0, 0))
    cx = L / 2
    w, h = 82 * K, 172 * K          # largura e comprimento da carroceria
    x0, y0 = cx - w / 2, (L - h) / 2
    x1, y1 = x0 + w, y0 + h
    im.alpha_composite(sombra(L, (x0 + 3 * K, y0 + 6 * K, x1 + 3 * K, y1 + 6 * K), 26 * K))
    d = ImageDraw.Draw(im)
    # Retrovisores (antes da carroceria, para ficarem por baixo).
    for lado in (-1, 1):
        mx = cx + lado * (w / 2 + 5 * K)
        d.ellipse((mx - 9 * K, y0 + 50 * K, mx + 9 * K, y0 + 64 * K), fill=tom(cor, -0.25) + (255,), outline=(255, 255, 255, 255), width=3 * K)
    # Contorno branco (aparece em qualquer mapa) e carroceria.
    d.rounded_rectangle((x0 - 5 * K, y0 - 5 * K, x1 + 5 * K, y1 + 5 * K), radius=32 * K, fill=(255, 255, 255, 255))
    d.rounded_rectangle((x0, y0, x1, y1), radius=28 * K, fill=tom(cor, -0.18) + (255,))
    d.rounded_rectangle((x0 + 4 * K, y0 + 4 * K, x1 - 4 * K, y1 - 4 * K), radius=25 * K, fill=cor + (255,))
    # Capo com brilho leve.
    d.rounded_rectangle((x0 + 14 * K, y0 + 10 * K, x1 - 14 * K, y0 + 40 * K), radius=12 * K, fill=tom(cor, 0.12) + (255,))
    vidro = (24, 34, 46, 255)
    # Para-brisa (frente, em cima) e vidro de tras.
    d.polygon([(x0 + 8 * K, y0 + 62 * K), (x1 - 8 * K, y0 + 62 * K), (x1 - 14 * K, y0 + 44 * K), (x0 + 14 * K, y0 + 44 * K)], fill=vidro)
    d.polygon([(x0 + 12 * K, y1 - 36 * K), (x1 - 12 * K, y1 - 36 * K), (x1 - 16 * K, y1 - 22 * K), (x0 + 16 * K, y1 - 22 * K)], fill=vidro)
    # Teto.
    d.rounded_rectangle((x0 + 10 * K, y0 + 66 * K, x1 - 10 * K, y1 - 40 * K), radius=10 * K, fill=tom(cor, 0.2) + (255,))
    # Vidros laterais (faixas finas).
    for lado in (0, 1):
        xa = x0 + 6 * K if lado == 0 else x1 - 10 * K
        d.rounded_rectangle((xa, y0 + 68 * K, xa + 4 * K, y1 - 42 * K), radius=2 * K, fill=vidro)
    # Farois (frente) e lanternas (tras).
    for lado in (-1, 1):
        fx = cx + lado * (w / 2 - 15 * K)
        d.ellipse((fx - 9 * K, y0 + 2 * K, fx + 9 * K, y0 + 12 * K), fill=(255, 244, 196, 255))
        d.rounded_rectangle((fx - 10 * K, y1 - 10 * K, fx + 10 * K, y1 - 3 * K), radius=3 * K, fill=(214, 40, 40, 255))
    return im.resize((LADO, LADO), Image.LANCZOS)


def moto(cor) -> Image.Image:
    L = LADO * K
    im = Image.new('RGBA', (L, L), (0, 0, 0, 0))
    cx = L / 2
    y0, y1 = 18 * K, L - 18 * K
    im.alpha_composite(sombra(L, (cx - 20 * K, y0 + 6 * K, cx + 26 * K, y1 + 6 * K), 22 * K))
    d = ImageDraw.Draw(im)
    pneu = (30, 30, 34, 255)
    branco = (255, 255, 255, 255)
    # Rodas (frente em cima) com contorno branco.
    for ya in (y0, y1 - 46 * K):
        d.rounded_rectangle((cx - 13 * K, ya - 4 * K, cx + 13 * K, ya + 50 * K), radius=13 * K, fill=branco)
        d.rounded_rectangle((cx - 9 * K, ya, cx + 9 * K, ya + 46 * K), radius=9 * K, fill=pneu)
    # Guidao.
    d.rounded_rectangle((cx - 46 * K, y0 + 50 * K, cx + 46 * K, y0 + 62 * K), radius=6 * K, fill=branco)
    d.rounded_rectangle((cx - 42 * K, y0 + 53 * K, cx + 42 * K, y0 + 59 * K), radius=3 * K, fill=pneu)
    # Tanque e banco na cor da situacao.
    d.rounded_rectangle((cx - 32 * K, y0 + 40 * K, cx + 32 * K, y1 - 40 * K), radius=28 * K, fill=branco)
    d.rounded_rectangle((cx - 27 * K, y0 + 45 * K, cx + 27 * K, y1 - 45 * K), radius=24 * K, fill=cor + (255,))
    d.rounded_rectangle((cx - 13 * K, cx - 6 * K, cx + 13 * K, y1 - 52 * K), radius=10 * K, fill=tom(cor, -0.3) + (255,))
    # Capacete do piloto (na cor da situacao: e o que mais aparece de longe).
    d.ellipse((cx - 26 * K, cx - 44 * K, cx + 26 * K, cx + 8 * K), fill=branco)
    d.ellipse((cx - 22 * K, cx - 40 * K, cx + 22 * K, cx + 4 * K), fill=tom(cor, -0.1) + (255,))
    d.ellipse((cx - 13 * K, cx - 36 * K, cx + 13 * K, cx - 24 * K), fill=(40, 44, 52, 255))
    # Farol.
    d.ellipse((cx - 7 * K, y0 - 2 * K, cx + 7 * K, y0 + 8 * K), fill=(255, 244, 196, 255))
    return im.resize((LADO, LADO), Image.LANCZOS)


def main() -> int:
    pastas = [pathlib.Path(p) for p in sys.argv[1:]]
    if not pastas:
        print(__doc__)
        return 2
    for pasta in pastas:
        pasta.mkdir(parents=True, exist_ok=True)
        for nome, cor in CORES.items():
            carro(cor).save(pasta / f'carro_{nome}.png', optimize=True)
            moto(cor).save(pasta / f'moto_{nome}.png', optimize=True)
        print(f'{pasta}: carro e moto em {", ".join(CORES)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
