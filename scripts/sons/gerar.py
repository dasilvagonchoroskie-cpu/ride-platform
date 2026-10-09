"""Sons proprios da Fortaleza Mov (sintetizados aqui, sem copiar nenhum som
de outro aplicativo): assobio de chamado, aviso curto e alerta de SOS."""
import sys, wave
import numpy as np

SR = 44100
rng = np.random.default_rng(7)

def glide(f0, f1, dur, curva='exp'):
    n = int(SR * dur)
    t = np.linspace(0, 1, n, endpoint=False)
    if curva == 'exp':
        return f0 * (f1 / f0) ** t
    return f0 + (f1 - f0) * t

def envelope(n, ataque=0.012, solta=0.045):
    e = np.ones(n)
    a = min(int(SR * ataque), n // 2)
    r = min(int(SR * solta), n // 2)
    e[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    e[-r:] = np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return e

def assobio(freqs, vibrato=0.010, vib_hz=6.0):
    """Assobio humano: seno quase puro, vibrato leve, um pouco de 2a
    harmonica (para carregar no alto-falante pequeno) e sopro."""
    n = len(freqs)
    t = np.arange(n) / SR
    f = freqs * (1 + vibrato * np.sin(2 * np.pi * vib_hz * t) * np.clip(t / 0.12, 0, 1))
    fase = 2 * np.pi * np.cumsum(f) / SR
    tom = np.sin(fase) + 0.16 * np.sin(2 * fase + 0.3) + 0.05 * np.sin(3 * fase)
    # sopro: ruido filtrado em volta da nota (passa-banda simples por FFT)
    ruido = rng.normal(0, 1, n)
    espectro = np.fft.rfft(ruido)
    freq_eixo = np.fft.rfftfreq(n, 1 / SR)
    centro = np.median(freqs)
    espectro *= np.exp(-((freq_eixo - centro) / 900) ** 2)
    sopro = np.fft.irfft(espectro, n)
    sopro /= (np.abs(sopro).max() + 1e-9)
    return (tom + 0.10 * sopro) * envelope(n)

def silencio(dur):
    return np.zeros(int(SR * dur))

def juntar(*partes):
    return np.concatenate(partes)

def normalizar(x, pico=0.89):
    return x / np.abs(x).max() * pico

def salvar_wav(nome, x):
    x = np.clip(x, -1, 1)
    with wave.open(nome, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())

# 1) Chamado do motorista: "fiu! fiu! fiuuuu" subindo, repete em loop.
n1 = assobio(glide(1350, 2350, 0.17))
n2 = assobio(glide(1350, 2500, 0.19))
subida = glide(1500, 2800, 0.18)
segura = np.full(int(SR * 0.30), 2800.0)
descida = glide(2800, 2300, 0.14)
n3 = assobio(np.concatenate([subida, segura, descida]), vibrato=0.014)
chamado = juntar(silencio(0.02), n1, silencio(0.07), n2, silencio(0.10), n3, silencio(0.60))
salvar_wav('chamado.wav', normalizar(chamado))

# 2) Aviso curto (motorista chegou, cadastro novo): "fiu-fiuu" e pausa.
a1 = assobio(glide(1500, 2400, 0.15))
a2 = assobio(np.concatenate([glide(1600, 2700, 0.14), np.full(int(SR * 0.12), 2700.0)]), vibrato=0.012)
aviso = juntar(silencio(0.02), a1, silencio(0.06), a2, silencio(0.90))
salvar_wav('aviso.wav', normalizar(aviso, 0.85))

# 3) Alerta de SOS na Central: dois tons alternando rapido, timbre forte.
def tom_forte(f, dur):
    n = int(SR * dur)
    t = np.arange(n) / SR
    fase = 2 * np.pi * f * t
    x = np.sin(fase) + 0.45 * np.sin(3 * fase) + 0.25 * np.sin(5 * fase) + 0.12 * np.sin(7 * fase)
    return x * envelope(n, 0.006, 0.012)
alerta = juntar(*[tom_forte(f, 0.16) for f in [1250, 880] * 6], silencio(0.35))
salvar_wav('alerta.wav', normalizar(alerta, 0.92))
print('ok', len(chamado) / SR, len(aviso) / SR, len(alerta) / SR)
