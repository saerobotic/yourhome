/* Jurnal YOUR HOME: skrip kecil (menu ponsel, progres baca, salin tautan). Halaman tetap utuh tanpa JavaScript. */
(function () {
  var toggle = document.getElementById('menuToggle');
  var links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  var nav = document.getElementById('navbar');
  var bar = document.getElementById('progressBar');
  var isPost = document.body.classList.contains('is-post');
  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop;
    if (nav) nav.classList.toggle('scrolled', y > 24);
    if (bar && isPost) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  var copy = document.getElementById('copyLink');
  if (copy && navigator.clipboard) {
    copy.addEventListener('click', function () {
      navigator.clipboard.writeText(copy.getAttribute('data-url')).then(function () {
        var old = copy.textContent;
        copy.textContent = 'Tautan disalin';
        setTimeout(function () { copy.textContent = old; }, 1800);
      });
    });
  } else if (copy) {
    copy.style.display = 'none';
  }
})();
