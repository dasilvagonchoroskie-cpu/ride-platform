// Codigo que ficava dentro do index.html. Fora dele, a politica de seguranca pode proibir script embutido.
    // Instalar como aplicativo (ícone na área de trabalho / tela inicial).
    (function () {
      var pedido = null;
      var botao = document.getElementById('instalar');
      var fechar = document.getElementById('fechar-instalar');
      window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        pedido = e;
        try { if (localStorage.getItem('fm.instalar.depois') === '1') return; } catch (_) {}
        botao.style.display = 'block';
      });
      botao.addEventListener('click', function (e) {
        if (e.target === fechar) {
          botao.style.display = 'none';
          try { localStorage.setItem('fm.instalar.depois', '1'); } catch (_) {}
          return;
        }
        if (!pedido) return;
        pedido.prompt();
        pedido.userChoice.finally(function () { pedido = null; botao.style.display = 'none'; });
      });
      window.addEventListener('appinstalled', function () { botao.style.display = 'none'; });
      // Some a tela de "abrindo" quando o Flutter desenha.
      window.addEventListener('flutter-first-frame', function () {
        var c = document.getElementById('carregando');
        if (c) c.remove();
      });
    })();
