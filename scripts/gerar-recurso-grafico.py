"""Recurso grafico da Google Play (1024 x 500), marinho e dourado.

Requisicao 1 (11/11/2026), item 10. Gera apps/<app>/loja/recurso-grafico.png
para o passageiro e o motorista, a partir do icone da loja (icone-512.png).
Uso: python3 scripts/gerar-recurso-grafico.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
FONTES = RAIZ / 'apps/mobile_passenger/assets/fonts'
MARINHO, MARINHO2, OURO, TEXTO, APAGADO = (7, 18, 43), (22, 42, 85), (233, 181, 61), (243, 245, 250), (167, 178, 203)

APPS = {
    'mobile_passenger': ('Fortaleza Move', 'Sua corrida na cidade, com o valor antes de confirmar.'),
    'mobile_driver': ('Fortaleza Move Motorista', 'Receba corridas na sua cidade e saque via Pix.'),
}


def fonte(peso: str, tam: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTES / f'Inter-{peso}.ttf'), tam)


def quebrar(d: ImageDraw.ImageDraw, texto: str, f, largura: int) -> list[str]:
    linhas, atual = [], ''
    for p in texto.split():
        teste = f'{atual} {p}'.strip()
        if d.textlength(teste, font=f) <= largura:
            atual = teste
        else:
            linhas.append(atual)
            atual = p
    return linhas + [atual]


def gerar(app: str, nome: str, frase: str) -> Path:
    w, h = 1024, 500
    img = Image.new('RGB', (w, h), MARINHO)
    # degrade marinho da esquerda para a direita
    px = img.load()
    for x in range(w):
        t = x / (w - 1)
        cor = tuple(int(MARINHO[i] + (MARINHO2[i] - MARINHO[i]) * t) for i in range(3))
        for y in range(h):
            px[x, y] = cor
    # brilho dourado atras do icone
    brilho = Image.new('L', (w, h), 0)
    ImageDraw.Draw(brilho).ellipse((40, 60, 420, 440), fill=90)
    brilho = brilho.filter(ImageFilter.GaussianBlur(70))
    img = Image.composite(Image.new('RGB', (w, h), (40, 95, 210)), img, brilho)  # azul: dourado sobre marinho vira cinza
    icone = Image.open(RAIZ / f'apps/{app}/loja/icone-512.png').convert('RGBA').resize((260, 260), Image.LANCZOS)
    mascara = Image.new('L', (260, 260), 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, 259, 259), 58, fill=255)
    img.paste(icone, (100, 120), mascara)
    d = ImageDraw.Draw(img)
    x = 420
    titulo = fonte('Bold', 54 if len(nome) < 20 else 44)
    y = 150
    for linha in quebrar(d, nome, titulo, 560):
        d.text((x, y), linha, font=titulo, fill=TEXTO)
        y += titulo.size + 8
    d.rounded_rectangle((x, y + 8, x + 70, y + 14), 3, fill=OURO)
    y += 34
    sub = fonte('Medium', 26)
    for linha in quebrar(d, frase, sub, 570):
        d.text((x, y), linha, font=sub, fill=APAGADO)
        y += sub.size + 10
    saida = RAIZ / f'apps/{app}/loja/recurso-grafico.png'
    img.save(saida)
    return saida


if __name__ == '__main__':
    for app, (nome, frase) in APPS.items():
        print(gerar(app, nome, frase))
