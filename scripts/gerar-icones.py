#!/usr/bin/env python3
"""Icones do app (Etapa 6, Evandro 30/10/2026).

Uso:
  python3 scripts/gerar-icones.py SIMBOLO.png apps/mobile_passenger [--fundo "#0070B8"] [--escala 0.60]

Regras do pedido (30/10/2026):
- fundo do icone adaptativo azul #0070B8 nos 3 apps;
- simbolo a ~60% do tamanho do icone que a pessoa VE. No icone adaptativo
  do Android o desenho tem 108 dp, mas o celular so mostra o miolo de
  72 dp (o resto e sobra para o efeito de movimento). Entao 60% = 60% de
  72 dp, e o desenho sempre cabe no circulo seguro de 66 dp (icone redondo);
- icone redondo, legado (Android 7 para tras) e monocromatico (Android 13+,
  "icones com tema") conferidos;
- PNG com fundo branco (ou xadrez desenhado, a "transparencia falsa"): o
  fundo e removido antes. Fundo de outra cor: avisa e nao mexe.

O SIMBOLO.png deve ser so o desenho, com fundo transparente. As bordas
transparentes sao cortadas antes de medir, entao a escala vale para o
desenho em si. Gera, em android/app/src/main/res:
  mipmap-*/ic_launcher.png e ic_launcher_round.png (legado),
  mipmap-*/ic_launcher_foreground.png e ic_launcher_monochrome.png,
  mipmap-anydpi-v26/ic_launcher.xml e ic_launcher_round.xml (adaptativo,
  com a camada monocromatica), values/ic_launcher_background.xml (cor);
e poe android:roundIcon no AndroidManifest.xml se faltar. Ao lado do app:
  loja/icone-512.png (Google Play);
  loja/ios/AppIcon.appiconset (iPhone e iPad: todos os tamanhos + 1024 da
  App Store, sem transparencia, como a Apple pede). A esteira do iPhone
  copia essa pasta para ios/Runner/Assets.xcassets.
  loja/simbolo-limpo.png (o simbolo ja sem fundo, para conferir).

Avisa (sem parar) quando a imagem foge do padrao: nao e PNG, pequena,
sem fundo transparente, fundo de cor, desenho muito comprido, pouco
contraste com a cor do fundo ou monocromatico que perde detalhes.
"""
import argparse
import json
import pathlib
import re
import sys

import numpy as np
from PIL import Image, ImageDraw

DENSIDADES = {'mdpi': 1.0, 'hdpi': 1.5, 'xhdpi': 2.0, 'xxhdpi': 3.0, 'xxxhdpi': 4.0}

# Icone adaptativo (dp): tela inteira, miolo visivel e circulo seguro.
ADAPTATIVO_DP = 108
VISIVEL_DP = 72
SEGURO_DP = 66

# iPhone e iPad (Xcode): (aparelho, tamanho em pontos, escala).
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


# ---------------------------------------------------------------- cores

def luminancia(rgb) -> float:
    def canal(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (canal(x) for x in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(a, b) -> float:
    la, lb = sorted((luminancia(a), luminancia(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def cor(texto: str) -> tuple:
    if not re.fullmatch(r'#[0-9A-Fa-f]{6}', texto):
        raise SystemExit(f'Cor invalida: {texto} (use #RRGGBB)')
    return tuple(int(texto[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


def hexa(rgb) -> str:
    return '#%02X%02X%02X' % tuple(int(round(x)) for x in rgb[:3])


# ------------------------------------------------- fundo branco / xadrez

def _vizinhos(m: np.ndarray) -> np.ndarray:
    """Dilata uma mascara em 1 pixel (4 vizinhos)."""
    d = m.copy()
    d[1:, :] |= m[:-1, :]
    d[:-1, :] |= m[1:, :]
    d[:, 1:] |= m[:, :-1]
    d[:, :-1] |= m[:, 1:]
    return d


def _soma_janela(a: np.ndarray, r: int) -> np.ndarray:
    """Soma de cada janela (2r+1)x(2r+1), com as bordas cortadas."""
    p = np.pad(a, ((r + 1, r), (r + 1, r)) + ((0, 0),) * (a.ndim - 2))
    c = p.cumsum(0).cumsum(1)
    n = 2 * r + 1
    return c[n:, n:] - c[:-n, n:] - c[n:, :-n] + c[:-n, :-n]


def tipo_do_fundo(img: Image.Image):
    """'transparente', 'branco', 'xadrez' ou ('cor', '#RRGGBB')."""
    a = np.asarray(img.convert('RGBA')).astype(np.int16)
    borda = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    if (borda[:, 3] <= 10).mean() >= 0.5:
        return 'transparente'
    rgb = borda[:, :3]
    claro = (rgb.min(1) >= 180) & ((rgb.max(1) - rgb.min(1)) <= 30)
    if claro.mean() >= 0.85:
        tons = rgb[claro].mean(1)
        # Xadrez: dois tons claros bem diferentes (ex.: 255 e 204) se alternando.
        if (tons < 240).mean() > 0.2 and (tons >= 245).mean() > 0.2:
            return 'xadrez'
        return 'branco'
    media = rgb.mean(0)
    return ('cor', hexa(media))


def tirar_fundo_claro(img: Image.Image) -> Image.Image:
    """Tira o fundo branco/xadrez ligado a borda e limpa a franja clara do contorno.

    So sai o claro (e cinza claro) que TOCA a borda da imagem; branco dentro
    do desenho fica. Na franja (2 px do contorno) a cor vira a do desenho
    vizinho e a transparencia e calculada pelo quanto o pixel clareou.
    """
    a = np.asarray(img.convert('RGBA')).astype(np.float64)
    rgb = a[..., :3]
    claro = (rgb.min(2) >= 180) & ((rgb.max(2) - rgb.min(2)) <= 30)
    fundo = np.zeros(claro.shape, bool)
    fundo[0, :], fundo[-1, :], fundo[:, 0], fundo[:, -1] = claro[0, :], claro[-1, :], claro[:, 0], claro[:, -1]
    while True:  # espalha pelo claro ligado a borda (reconstrucao geodesica)
        novo = _vizinhos(fundo) & claro
        if (novo == fundo).all():
            break
        fundo = novo
    franja = _vizinhos(_vizinhos(_vizinhos(fundo))) & ~fundo
    solido = ~fundo & ~franja
    # Cor do desenho perto de cada pixel da franja (media do solido numa janela 9x9).
    peso = _soma_janela(solido.astype(np.float64), 4)
    soma = _soma_janela(rgb * solido[..., None], 4)
    tom = np.where(peso[..., None] > 0, soma / np.maximum(peso, 1)[..., None], rgb)
    # Cor do fundo ali perto (branco ou o cinza do xadrez daquele quadradinho).
    peso_f = _soma_janela(fundo.astype(np.float64), 2)
    soma_f = _soma_janela(rgb * fundo[..., None], 2)
    claro_perto = np.where(peso_f[..., None] > 0, soma_f / np.maximum(peso_f, 1)[..., None], 255.0)
    # Quanto do pixel e desenho (0..1): projecao de (pixel - fundo) em (desenho - fundo).
    dif = tom - claro_perto
    den = (dif * dif).sum(2)
    alfa_f = np.where(den > 1, ((rgb - claro_perto) * dif).sum(2) / np.maximum(den, 1), 1.0).clip(0, 1)
    saida = a.copy()
    saida[..., 3] = np.where(fundo, 0, np.where(franja, a[..., 3] * alfa_f, a[..., 3]))
    saida[..., :3] = np.where(franja[..., None], tom, rgb)
    return Image.fromarray(saida.round().clip(0, 255).astype(np.uint8), 'RGBA')


def limpar_transparencia(img: Image.Image):
    """PNG transparente de verdade, mas com sujeira comum de exportacao.

    - Nevoa quase invisivel (alfa ate 8 de 255) espalhada pelo fundo: some.
      Sem isso o corte pelas bordas pega a imagem inteira e o desenho fica
      pequeno e fora do centro.
    - Miolo quase opaco (alfa 245 a 254): vira opaco (senao o azul vaza).
    - Contorno com cor escura ou clara por baixo da transparencia: ganha a
      cor do desenho vizinho (senao aparece uma borda suja no azul).
    Devolve (imagem, lista de avisos).
    """
    a = np.asarray(img.convert('RGBA')).astype(np.float64)
    alfa = a[..., 3]
    avisos = []
    nevoa = (alfa > 0) & (alfa <= 8)
    if nevoa.sum() > 200:
        avisos.append(f'havia uma nevoa quase invisivel em volta do desenho ({int(nevoa.sum())} pontos): removida.')
    alfa = np.where(alfa <= 8, 0, alfa)
    alfa = np.where(alfa >= 245, 255, alfa)
    cheio = alfa >= 255
    meio = (alfa > 0) & ~cheio
    rgb = a[..., :3]
    peso = _soma_janela(cheio.astype(np.float64), 4)
    soma = _soma_janela(rgb * cheio[..., None], 4)
    perto = np.where(peso[..., None] > 0, soma / np.maximum(peso, 1)[..., None], rgb)
    if cheio.any() and meio.any():
        lum = lambda c: (0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2])
        sujo = meio & (peso > 0) & (np.abs(lum(rgb) - lum(perto)) > 60)
        if sujo.sum() > 50:
            avisos.append(f'o contorno tinha cor suja por baixo da transparencia ({int(sujo.sum())} pontos): corrigido com a cor do desenho.')
    rgb = np.where((meio & (peso > 0))[..., None], perto, rgb)
    rgb = np.where((alfa == 0)[..., None], 0, rgb)
    saida = np.dstack([rgb, alfa])
    return Image.fromarray(saida.round().clip(0, 255).astype(np.uint8), 'RGBA'), avisos


# ------------------------------------------------------- monocromatico

def monocromatico(simbolo: Image.Image):
    """Camada do Android 13+: so a forma (branca); o celular pinta com o tema.

    Desenho de uma cor so: a forma inteira. Desenho com partes escuras por
    dentro (ex.: volante azul-escuro dentro do circulo amarelo): as partes
    escuras viram vazado, senao o detalhe some numa mancha so.
    Devolve (imagem, aviso ou None).
    """
    a = np.asarray(simbolo).astype(np.float64)
    alfa = a[..., 3] / 255
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) / 255
    visivel = alfa > 0.5
    aviso = None
    if visivel.any():
        claros = (lum[visivel] >= 0.45).mean()
        escuros = (lum[visivel] <= 0.25).mean()
        if escuros > 0.03 and claros > 0.3:
            # Rampa suave entre 0.25 e 0.40 de brilho: escuro some, claro fica.
            fator = ((lum - 0.25) / 0.15).clip(0, 1)
            alfa = alfa * fator
            aviso = None
        elif escuros > 0.5:
            aviso = 'desenho escuro: no icone monocromatico (Android 13+) ele vira so a silhueta.'
    saida = np.zeros_like(a)
    saida[..., :3] = 255
    saida[..., 3] = (alfa * 255).round()
    return Image.fromarray(saida.clip(0, 255).astype(np.uint8), 'RGBA'), aviso


# ------------------------------------------------------------- medidas

def raio_relativo(simbolo: Image.Image) -> float:
    """Ponto visivel mais longe do centro, em fracao do lado maior do desenho."""
    alfa = np.asarray(simbolo.getchannel('A'))
    ys, xs = np.nonzero(alfa > 40)
    if not len(xs):
        return 0.0
    cx, cy = (simbolo.width - 1) / 2, (simbolo.height - 1) / 2
    return float(np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max()) / max(simbolo.size)


def avisos_da_imagem(original: Image.Image, simbolo: Image.Image, fundo, tipo, escala: float = 0.60) -> list:
    """O que foge do padrao (nao para a geracao; so avisa)."""
    avisos = []
    if original.format != 'PNG':
        avisos.append(f'o arquivo e {original.format or "desconhecido"}, nao PNG (mande PNG com fundo transparente).')
    if tipo == 'branco':
        avisos.append('a imagem tinha fundo BRANCO (sem transparencia): o fundo foi removido automaticamente; confira o contorno.')
    elif tipo == 'xadrez':
        avisos.append('a imagem tinha o xadrez DESENHADO (transparencia falsa): o xadrez foi removido; confira o contorno.')
    elif isinstance(tipo, tuple):
        avisos.append(f'a imagem tem fundo de cor {tipo[1]} (nao e transparente nem branco): NAO removi. Mande o simbolo com fundo transparente.')
    if original.width != original.height:
        avisos.append(f'a imagem nao e quadrada ({original.width}x{original.height}); o desenho foi centralizado.')
    # O maior uso e o icone de 1024 da App Store, com o desenho a [escala].
    precisa = round(1024 * escala)
    if max(simbolo.size) < 512:
        avisos.append(f'desenho pequeno ({simbolo.width}x{simbolo.height}); o ideal e 1024 px (no minimo 512) para nao ficar borrado.')
    elif max(simbolo.size) < precisa:
        avisos.append(f'desenho de {simbolo.width}x{simbolo.height}: serve, mas o icone de 1024 da App Store pede {precisa} px e fica menos nitido.')
    w, h = simbolo.size
    if max(w, h) > 3 * min(w, h):
        avisos.append(f'desenho muito comprido ({w}x{h}): no icone ele fica fino; prefira um simbolo mais quadrado.')
    # Cor media do desenho (so os pontos visiveis) contra o fundo.
    pequeno = simbolo.resize((64, 64))
    px = pequeno.load()
    pixels = [px[x, y] for x in range(64) for y in range(64) if px[x, y][3] > 128]
    if pixels:
        media = tuple(sum(p[i] for p in pixels) / len(pixels) for i in range(3))
        c = contraste(media, fundo)
        if c < 1.5:
            avisos.append(f'pouco contraste entre o desenho e o fundo {hexa(fundo)} ({c:.1f}:1); o simbolo some no celular.')
    return avisos


# ------------------------------------------------------------- desenho

def simbolo_no_quadro(simbolo: Image.Image, lado: int, caixa_px: float, fundo=None, forma=None) -> Image.Image:
    """Quadro lado x lado com o simbolo centralizado cabendo em caixa_px."""
    quadro = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    if fundo is not None:
        mascara = Image.new('L', (lado, lado), 0)
        d = ImageDraw.Draw(mascara)
        if forma == 'redondo':
            d.ellipse((0, 0, lado - 1, lado - 1), fill=255)
        else:
            d.rounded_rectangle((0, 0, lado - 1, lado - 1), radius=round(lado * 0.18), fill=255)
        quadro.paste(Image.new('RGBA', (lado, lado), fundo), (0, 0), mascara)
    caixa = max(1, round(caixa_px))
    s = simbolo.copy()
    s.thumbnail((caixa, caixa), Image.LANCZOS)
    if s.width < caixa and s.height < caixa:  # desenho menor que a caixa: amplia
        f = caixa / max(s.size)
        s = simbolo.resize((max(1, round(simbolo.width * f)), max(1, round(simbolo.height * f))), Image.LANCZOS)
    quadro.alpha_composite(s, ((lado - s.width) // 2, (lado - s.height) // 2))
    return quadro


def cheio(simbolo: Image.Image, lado: int, escala: float, fundo) -> Image.Image:
    """Quadrado cheio, sem transparencia (Google Play e iPhone)."""
    q = Image.new('RGBA', (lado, lado), fundo)
    q.alpha_composite(simbolo_no_quadro(simbolo, lado, lado * escala))
    return q


def por_round_icon(manifesto: pathlib.Path) -> bool:
    """Poe android:roundIcon ao lado do android:icon, se faltar."""
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
    p = argparse.ArgumentParser(description='Gera os icones do app a partir do simbolo.')
    p.add_argument('simbolo')
    p.add_argument('app', help='pasta do app (ex.: apps/mobile_passenger)')
    p.add_argument('--fundo', default='#0070B8')
    p.add_argument('--escala', type=float, default=0.60,
                   help='tamanho do simbolo no icone que se ve (0.60 = 60%%)')
    a = p.parse_args()

    app = pathlib.Path(a.app)
    res = app / 'android/app/src/main/res'
    if not res.is_dir():
        raise SystemExit(f'Nao achei {res}')
    escala = a.escala
    if not 0.3 <= escala <= 0.8:
        raise SystemExit('Escala fora do normal (use entre 0.30 e 0.80).')
    fundo = cor(a.fundo)

    original = Image.open(a.simbolo)
    original.load()
    tipo = tipo_do_fundo(original)
    simbolo = original.convert('RGBA')
    if tipo in ('branco', 'xadrez'):
        simbolo = tirar_fundo_claro(simbolo)
    simbolo, avisos_limpeza = limpar_transparencia(simbolo)
    caixa = simbolo.getchannel('A').getbbox()
    if not caixa:
        raise SystemExit('O simbolo esta vazio (todo transparente).')
    simbolo = simbolo.crop(caixa)
    avisos = avisos_limpeza + avisos_da_imagem(original, simbolo, fundo, tipo, escala)

    # Adaptativo: caixa do simbolo = escala x 72 dp. Se o desenho passar do
    # circulo seguro de 66 dp (icone redondo), diminui ate caber.
    caixa_dp = escala * VISIVEL_DP
    raio = raio_relativo(simbolo)
    if raio * caixa_dp > SEGURO_DP / 2:
        novo = (SEGURO_DP / 2) / raio
        avisos.append(f'com {round(escala * 100)}% o desenho seria cortado no icone redondo: '
                      f'ficou com {round(novo / VISIVEL_DP * 100)}%.')
        caixa_dp = novo
    mono, aviso_mono = monocromatico(simbolo)
    if aviso_mono:
        avisos.append(aviso_mono)
    for aviso in avisos:
        print(f'AVISO: {aviso}', file=sys.stderr)

    for nome, fator in DENSIDADES.items():
        pasta = res / f'mipmap-{nome}'
        pasta.mkdir(parents=True, exist_ok=True)
        lado = round(48 * fator)
        tela = round(ADAPTATIVO_DP * fator)
        simbolo_no_quadro(simbolo, tela, caixa_dp * fator).save(pasta / 'ic_launcher_foreground.png')
        simbolo_no_quadro(mono, tela, caixa_dp * fator).save(pasta / 'ic_launcher_monochrome.png')
        # Android antigo (sem adaptativo): quadrado arredondado e redondo, simbolo a escala do lado.
        simbolo_no_quadro(simbolo, lado, lado * escala, fundo).save(pasta / 'ic_launcher.png')
        simbolo_no_quadro(simbolo, lado, lado * escala, fundo, 'redondo').save(pasta / 'ic_launcher_round.png')

    v26 = res / 'mipmap-anydpi-v26'
    v26.mkdir(exist_ok=True)
    (v26 / 'ic_launcher.xml').write_text(ADAPTATIVO_XML, encoding='utf-8')
    (v26 / 'ic_launcher_round.xml').write_text(ADAPTATIVO_XML, encoding='utf-8')
    (res / 'values').mkdir(exist_ok=True)
    (res / 'values/ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">{a.fundo.upper()}</color>\n</resources>\n',
        encoding='utf-8',
    )
    if por_round_icon(app / 'android/app/src/main/AndroidManifest.xml'):
        print('AndroidManifest.xml: android:roundIcon adicionado.')

    loja = app / 'loja'
    loja.mkdir(exist_ok=True)
    simbolo.save(loja / 'simbolo-limpo.png')
    # Google Play: 512x512, PNG 32 bits, quadrado cheio (a loja arredonda sozinha).
    cheio(simbolo, 512, escala, fundo).save(loja / 'icone-512.png')

    # iPhone/iPad: quadrado cheio e SEM transparencia (a Apple recusa o 1024
    # com transparencia); o iOS arredonda os cantos sozinho.
    ios = loja / 'ios/AppIcon.appiconset'
    ios.mkdir(parents=True, exist_ok=True)
    imagens = []
    for aparelho, pontos, vezes in IOS:
        px = round(pontos * vezes)
        nome = f'icone-{pontos:g}x{pontos:g}@{vezes}x.png'
        cheio(simbolo, px, escala, fundo).convert('RGB').save(ios / nome)
        imagens.append({'idiom': aparelho, 'size': f'{pontos:g}x{pontos:g}', 'scale': f'{vezes}x', 'filename': nome})
    (ios / 'Contents.json').write_text(
        json.dumps({'images': imagens, 'info': {'version': 1, 'author': 'xcode'}}, indent=2) + '\n', encoding='utf-8'
    )
    print(f'Icones gerados em {res} (simbolo a {round(caixa_dp / VISIVEL_DP * 100)}% do icone, fundo {a.fundo.upper()}, '
          f'fundo da imagem: {tipo if isinstance(tipo, str) else tipo[1]}), '
          f'{loja / "icone-512.png"} e {len(IOS)} do iPhone/iPad em {ios}')
    if avisos:
        print(f'{len(avisos)} aviso(s) sobre a imagem: veja acima.', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
