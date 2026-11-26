// Codigo que ficava dentro do index.html. Fora dele, a politica de seguranca pode proibir script embutido.
    // Alarme "o motorista chegou" no navegador (so com o site aberto): bipes + vibracao.
    (function () {
      var ctx = null;
      function audio() {
        try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch (_) {}
        return ctx;
      }
      // O navegador so libera som depois de um toque: o primeiro toque no site prepara o audio.
      window.addEventListener('pointerdown', audio, { once: true });
      window.addEventListener('keydown', audio, { once: true });
      window.fmAlarme = function () {
        try { if (navigator.vibrate) navigator.vibrate([600, 300, 600, 300, 600]); } catch (_) {}
        var c = audio();
        if (!c) return;
        var t0 = c.currentTime;
        for (var i = 0; i < 6; i++) {
          var o = c.createOscillator(), g = c.createGain();
          o.type = 'square'; o.frequency.value = i % 2 ? 880 : 1175;
          g.gain.setValueAtTime(0.0001, t0 + i * 0.45);
          g.gain.exponentialRampToValueAtTime(0.35, t0 + i * 0.45 + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.45 + 0.4);
          o.connect(g); g.connect(c.destination);
          o.start(t0 + i * 0.45); o.stop(t0 + i * 0.45 + 0.42);
        }
      };
    })();

    // Instalar como aplicativo (icone na area de trabalho / tela inicial). Nao ha botao solto na tela:
    // o botao fica na aba Conta do app (13/11/2026), para nao cobrir nada.
    (function () {
      var pedido = null;
      window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); pedido = e; });
      window.addEventListener('appinstalled', function () { pedido = null; });
      window.fmPodeInstalar = function () { return !!pedido; };
      window.fmInstalar = function () {
        if (!pedido) return;
        var p = pedido; pedido = null;
        p.prompt();
      };
      // Some a tela de "abrindo" quando o Flutter desenha.
      window.addEventListener('flutter-first-frame', function () {
        var c = document.getElementById('carregando');
        if (c) c.remove();
      });
    })();
