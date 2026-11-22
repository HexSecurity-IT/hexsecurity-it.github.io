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

  function track(event) {
    if (reduceMotion.matches || (event.pointerType === 'touch' && event.type === 'pointermove' && !event.buttons)) return;
    clearTimeout(fade);
    point = event;
    if (!frame) frame = requestAnimationFrame(paint);
  }

  function hide() {
    point = undefined;
    glow.classList.remove('pointer-glow-visible');
  }

  document.addEventListener('pointermove', track, {passive: true});
  document.addEventListener('pointerdown', track, {passive: true});
  document.addEventListener('pointerup', event => {
    if (event.pointerType !== 'mouse') fade = setTimeout(hide, 160);
  }, {passive: true});
  document.addEventListener('pointercancel', hide, {passive: true});
  document.documentElement.addEventListener('pointerleave', hide);
  window.addEventListener('blur', hide);
  reduceMotion.addEventListener('change', hide);
})();
