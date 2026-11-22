(() => {
  const trigger = document.querySelector('#open-introduction');
  const intro = document.querySelector('#intro-dialog');
  if (trigger && intro && typeof intro.showModal === 'function') {
    const player = intro.querySelector('video');
    trigger.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      intro.showModal();
      document.dispatchEvent(new Event('hex-intro-change'));
      player.play().catch(() => {});
    });
    intro.addEventListener('close', () => {
      player.pause();
      document.dispatchEvent(new Event('hex-intro-change'));
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) player.pause(); });
    intro.querySelector('.close-enquiry').addEventListener('click', () => intro.close());
    intro.querySelector('.intro-actions a').addEventListener('click', () => intro.close());
  }

  const glow = document.createElement('span');
  glow.className = 'pointer-glow';
  glow.setAttribute('aria-hidden', 'true');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let point;
  let frame = 0;
  let fade;

  function paint() {
    frame = 0;
    if (!point || reduceMotion.matches) return;
    const host = point.target.closest('dialog[open]') || document.body;
    if (glow.parentElement !== host) host.append(glow);
    glow.style.transform = `translate3d(${point.clientX}px, ${point.clientY}px, 0) translate(-50%, -50%)`;
    glow.classList.add('pointer-glow-visible');
  }

  function track(event, immediate = false) {
    if (reduceMotion.matches || (event.pointerType === 'touch' && event.type === 'pointermove' && !event.buttons)) return;
    clearTimeout(fade);
    point = event;
    if (immediate) {
      cancelAnimationFrame(frame);
      paint();
    } else if (!frame) frame = requestAnimationFrame(paint);
  }

  function hide() {
    point = undefined;
    glow.classList.remove('pointer-glow-visible');
  }

  function fadeAfterTouch() {
    clearTimeout(fade);
    fade = setTimeout(hide, 300);
  }

  function trackTouch(event) {
    if (event.touches.length === 1) track(event.touches[0], event.type === 'touchstart');
  }

  document.addEventListener('pointermove', track, {passive: true});
  document.addEventListener('pointerdown', event => track(event, true), {passive: true});
  document.addEventListener('pointerup', event => {
    if (event.pointerType !== 'mouse') fadeAfterTouch();
  }, {passive: true});
  document.addEventListener('pointercancel', event => {
    if (event.pointerType !== 'touch') hide();
  }, {passive: true});
  document.addEventListener('touchstart', trackTouch, {passive: true});
  document.addEventListener('touchmove', trackTouch, {passive: true});
  document.addEventListener('touchend', fadeAfterTouch, {passive: true});
  document.addEventListener('touchcancel', hide, {passive: true});
  document.documentElement.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse') hide();
  });
  window.addEventListener('blur', hide);
  reduceMotion.addEventListener('change', hide);
})();
