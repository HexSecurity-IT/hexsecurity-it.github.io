(() => {
  const sections = [...document.querySelectorAll('[data-scroll-reveal]')];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  let frame = 0;

  function documentTop(element) {
    let top = 0;
    // Layout offsets are unaffected by the reveal transform.
    for (let ancestor = element; ancestor; ancestor = ancestor.offsetParent) {
      top += ancestor.offsetTop;
    }
    return top;
  }

  function update() {
    frame = 0;
    if (reduceMotion.matches) return;

    const height = root.clientHeight;
    const start = window.scrollY + height * .99;
    const distance = Math.min(height * .29, 240);
    const positions = sections.map(element => {
      const progress = Math.max(0, Math.min(1, (start - documentTop(element)) / distance));
      return ((1 - progress) ** 2).toFixed(3);
    });

    sections.forEach((element, index) => {
      if (element.style.getPropertyValue('--scroll-away') !== positions[index]) {
        element.style.setProperty('--scroll-away', positions[index]);
      }
    });
    root.classList.add('has-scroll-motion');
  }

  function schedule() {
    if (!frame && !reduceMotion.matches) frame = requestAnimationFrame(update);
  }

  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) root.classList.remove('has-scroll-motion');
    else schedule();
  });
  window.addEventListener('scroll', schedule, {passive: true});
  window.addEventListener('resize', schedule);
  window.addEventListener('pageshow', schedule);
  document.fonts.ready.then(schedule);
  schedule();
})();
