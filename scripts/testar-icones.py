#!/usr/bin/env python3
"""Teste do gerador de icones (Etapa 6). Roda numa copia temporaria; nao mexe nos apps.

  python3 scripts/testar-icones.py

Monta um simbolo amarelo de teste e confere, para transparente, fundo
branco, xadrez desenhado e fundo preto: arquivos de todas as densidades,
simbolo a 60% do icone visivel, dentro do circulo seguro de 66 dp,
monocromatico so com a forma clara, XML com <monochrome>, roundIcon no
manifesto, fundo #0070B8, fundo branco/xadrez removido e avisos certos.
"""
import pathlib
import shutil
import subprocess
import sys
import tempfile

import importlib.util

import numpy as np
from PIL import Image, ImageDraw

RAIZ = pathlib.Path(__file__).resolve().parent.parent
GERADOR = RAIZ / 'scripts/gerar-icones.py'
falhas = []
_spec = importlib.util.spec_from_file_location('gerar_icones', GERADOR)
gerador = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gerador)


def conferir(ok, texto):
    print(('OK     ' if ok else 'FALHA  ') + texto)
    if not ok:
        falhas.append(texto)


def simbolo(S=1024, K=4) -> Image.Image:
    im = Image.new('RGBA', (S * K, S * K), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    Y, N = (248, 192, 58, 255), (13, 32, 64, 255)
    sc = lambda pts: [(x * K, y * K) for x, y in pts]
    d.polygon(sc([(120, 420), (400, 470), (400, 560), (150, 600)]), fill=Y)
    d.polygon(sc([(904, 420), (624, 470), (624, 560), (874, 600)]), fill=Y)
    d.ellipse((330 * K, 330 * K, 694 * K, 694 * K), fill=Y)
    d.ellipse((390 * K, 390 * K, 634 * K, 634 * K), fill=N)
    d.ellipse((480 * K, 480 * K, 544 * K, 544 * K), fill=Y)
    return im.resize((S, S), Image.BOX)


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix='icones-'))
    s = simbolo()
    S = s.width
    s.save(tmp / 'transparente.png')
    b = Image.new('RGBA', (S, S), (255, 255, 255, 255)); b.alpha_composite(s); b.convert('RGB').save(tmp / 'branco.png')
    x = np.zeros((S, S, 4), np.uint8); x[..., 3] = 255
    q = ((np.arange(S)[:, None] // 32 + np.arange(S)[None, :] // 32) % 2).astype(bool)
    x[..., :3] = np.where(q[..., None], 204, 255)
    xi = Image.fromarray(x, 'RGBA'); xi.alpha_composite(s); xi.convert('RGB').save(tmp / 'xadrez.png')
    p = Image.new('RGBA', (S, S), (0, 0, 0, 255)); p.alpha_composite(s); p.convert('RGB').save(tmp / 'preto.png')
    # Transparente com sujeira de exportacao: nevoa de alfa 2 no fundo todo,
    # miolo com alfa 252 e contorno com cor preta por baixo da transparencia.
    n = np.asarray(s).copy()
    fundo = n[..., 3] == 0
    n[..., 3] = np.where(fundo, 2, np.where(n[..., 3] == 255, 252, n[..., 3]))
    meio = (n[..., 3] > 2) & (n[..., 3] < 252)
    n[..., :3] = np.where(meio[..., None], 0, n[..., :3])
    Image.fromarray(n, 'RGBA').save(tmp / 'nevoa.png')

    ref = np.asarray(s).astype(float)
    for caso, aviso_esperado in [('transparente', None), ('branco', 'fundo BRANCO'), ('xadrez', 'xadrez DESENHADO'), ('preto', 'fundo de cor #000000'), ('nevoa', 'nevoa quase invisivel')]:
        print(f'--- {caso}')
        app = tmp / f'app-{caso}'
        main_dir = app / 'android/app/src/main'
        main_dir.mkdir(parents=True)
        shutil.copytree(RAIZ / 'apps/mobile_driver/android/app/src/main/res', main_dir / 'res')
        manifesto = (RAIZ / 'apps/mobile_driver/android/app/src/main/AndroidManifest.xml').read_text()
        (main_dir / 'AndroidManifest.xml').write_text(manifesto.replace('\n        android:roundIcon="@mipmap/ic_launcher_round"', ''))
        r = subprocess.run([sys.executable, str(GERADOR), str(tmp / f'{caso}.png'), str(app)], capture_output=True, text=True)
        conferir(r.returncode == 0, f'{caso}: gerador terminou ({r.returncode})' + ('' if r.returncode == 0 else ' ' + r.stderr[-300:]))
        if r.returncode:
            continue
        if aviso_esperado:
            conferir(aviso_esperado in r.stderr, f'{caso}: avisou "{aviso_esperado}"')
        else:
            conferir('fundo' not in r.stderr, f'{caso}: sem aviso de fundo')
        res = main_dir / 'res'
        for dens, f in {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}.items():
            for nome, lado in [('ic_launcher', 48), ('ic_launcher_round', 48), ('ic_launcher_foreground', 108), ('ic_launcher_monochrome', 108)]:
                arq = res / f'mipmap-{dens}/{nome}.png'
                ok = arq.is_file() and Image.open(arq).size == (round(lado * f),) * 2
                if not ok:
                    conferir(False, f'{caso}: {arq.relative_to(app)}')
        conferir(True, f'{caso}: 20 PNG do Android nos tamanhos certos')
        xml = (res / 'mipmap-anydpi-v26/ic_launcher.xml').read_text()
        xml_r = (res / 'mipmap-anydpi-v26/ic_launcher_round.xml').read_text()
        conferir('<monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>' in xml and xml == xml_r, f'{caso}: adaptativo e redondo com camada monocromatica')
        conferir('#0070B8' in (res / 'values/ic_launcher_background.xml').read_text(), f'{caso}: fundo #0070B8')
        conferir('android:roundIcon="@mipmap/ic_launcher_round"' in (main_dir / 'AndroidManifest.xml').read_text(), f'{caso}: roundIcon no manifesto')

        fg = np.asarray(Image.open(res / 'mipmap-xxxhdpi/ic_launcher_foreground.png'))
        ys, xs = np.nonzero(fg[..., 3] > 40)
        lado_dp = (max(xs.max() - xs.min(), ys.max() - ys.min()) + 1) / 4
        raio_dp = np.sqrt((xs - (fg.shape[1] - 1) / 2) ** 2 + (ys - (fg.shape[0] - 1) / 2) ** 2).max() / 4
        if caso != 'preto':
            conferir(abs(lado_dp / 72 - 0.60) <= 0.02, f'{caso}: simbolo com {lado_dp / 72:.0%} do icone visivel (pedido ~60%)')
        conferir(raio_dp <= 33, f'{caso}: dentro do circulo seguro de 66 dp (raio {raio_dp:.1f} dp)')
        mono = np.asarray(Image.open(res / 'mipmap-xxxhdpi/ic_launcher_monochrome.png'))
        vis = mono[..., 3] > 0
        conferir(vis.any() and (mono[vis][:, :3] == 255).all(), f'{caso}: monocromatico so com a forma (branca)')
        if caso != 'preto':
            # o miolo azul-escuro vira vazado no monocromatico
            c = fg.shape[0] // 2
            anel = mono[c - 24, c, 3]
            conferir(anel < 40, f'{caso}: parte escura do desenho vazada no monocromatico (alfa {anel})')
        play = Image.open(app / 'loja/icone-512.png')
        conferir(play.size == (512, 512) and np.asarray(play.convert('RGBA'))[..., 3].min() == 255, f'{caso}: Google Play 512x512 sem transparencia')
        ios = Image.open(app / 'loja/ios/AppIcon.appiconset/icone-1024x1024@1x.png')
        conferir(ios.size == (1024, 1024) and ios.mode == 'RGB', f'{caso}: App Store 1024 sem transparencia')
        if caso in ('branco', 'xadrez'):
            # Remocao do fundo na imagem inteira, comparada com o original sobre o azul.
            limpo = np.asarray(gerador.tirar_fundo_claro(Image.open(tmp / f'{caso}.png'))).astype(float)
            azul = np.array([0, 112, 184.])
            sobre = lambda z: z[..., :3] * z[..., 3:] / 255 + azul * (1 - z[..., 3:] / 255)
            dif = np.abs(sobre(ref) - sobre(limpo)).max(-1)
            sobra = int(((limpo[..., 3] > 32) & (ref[..., 3] == 0)).sum())
            conferir(np.percentile(dif, 99.9) <= 8 and dif.max() <= 64 and sobra == 0,
                     f'{caso}: fundo removido sem franja (dif 99,9% = {np.percentile(dif, 99.9):.0f}, max {dif.max():.0f}, sobra {sobra} px)')
    shutil.rmtree(tmp, ignore_errors=True)
    print(f'\nResultado: {len(falhas)} falha(s).')
    return 1 if falhas else 0


if __name__ == '__main__':
    sys.exit(main())
