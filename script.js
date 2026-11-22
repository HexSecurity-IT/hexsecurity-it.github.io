const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav-links');

menuButton.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.textContent = open ? '×' : '☰';
});

nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.textContent = '☰';
}));

document.querySelector('#year').textContent = new Date().getFullYear();

const cards = [...document.querySelectorAll('.offer')];
const modal = document.querySelector('#service-dialog');
const introDialog = document.querySelector('#intro-dialog');
const details = document.querySelector('#details-step');
const title = document.querySelector('#dialog-title');
const modalVideo = document.querySelector('#dialog-video');
const interactiveDemoLink = document.querySelector('#open-service-demo');
const guideCaptions = document.querySelector('#dialog-captions');
const guidePlay = document.querySelector('#guide-play');
const form = document.querySelector('#lead-form');
const service = document.querySelector('#lead-service');
const backButton = document.querySelector('#back-details');
const motionButton = document.querySelector('#motion-toggle');
const motionSetting = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = motionSetting.matches;
let activeCard = null;
let receipt;
let sending = false;
const receiptStatus = document.querySelector('#enquiry-status');
const fallback = document.querySelector('#enquiry-fallback');

const galleryVideos = [...document.querySelectorAll('.inline-video')];
const visibleVideos = new Set();

function syncMotion() {
  const previewsVisible = !paused && !document.hidden && !modal.open && !introDialog.open;
  for (const video of galleryVideos) {
    const shouldPlay = previewsVisible && visibleVideos.has(video);
    if (shouldPlay) video.play().catch(() => {});
    else video.pause();
  }
  motionButton.textContent = paused ? 'Play previews' : 'Pause previews';
}

function setMotion(nextPaused) {
  paused = nextPaused;
  syncMotion();
}

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.intersectionRatio >= 0.25) visibleVideos.add(entry.target);
    else visibleVideos.delete(entry.target);
  }
  syncMotion();
}, {threshold: [0, 0.25]});

galleryVideos.forEach(video => observer.observe(video));

motionButton.addEventListener('click', () => setMotion(!paused));
motionSetting.addEventListener('change', event => {
  setMotion(event.matches);
  if (event.matches) modalVideo.pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) modalVideo.pause();
  syncMotion();
});
document.addEventListener('hex-intro-change', syncMotion);
syncMotion();
service.add(new Option('General enquiry', 'General enquiry'));

function playGuide() {
  const card = activeCard;
  guidePlay.hidden = true;
  modalVideo.play().catch(error => {
    if (error.name === 'NotAllowedError' && activeCard === card && modal.open && !details.hidden)
      guidePlay.hidden = false;
  });
}

guidePlay.addEventListener('click', playGuide);
modalVideo.addEventListener('play', () => { guidePlay.hidden = true; });

function showDetails(card) {
  activeCard = card;
  const name = card.querySelector('h3').textContent;
  title.textContent = name;
  service.value = name;
  service.disabled = true;
  const preview = card.querySelector('video');
  interactiveDemoLink.href = card.querySelector('.offer-preview').href;
  modalVideo.setAttribute('aria-label', name + ' — Hinglish video guide');
  if (modalVideo.getAttribute('src') !== preview.dataset.detailSrc) {
    modalVideo.poster = preview.dataset.detailPoster;
    guideCaptions.src = preview.dataset.captions;
    modalVideo.src = preview.dataset.detailSrc;
  }
  document.querySelector('#dialog-summary').textContent = card.querySelector('.offer-copy p').textContent;
  document.querySelector('#dialog-details').replaceChildren(card.querySelector('template').content.cloneNode(true));
  form.hidden = true;
  details.hidden = false;
  modal.setAttribute('aria-labelledby', 'dialog-title');
  if (!modal.open) modal.showModal();
  syncMotion();
  guidePlay.hidden = true;
  if (paused) guidePlay.hidden = false;
  else playGuide();
  modal.scrollTop = 0;
  title.focus({preventScroll:true});
}

cards.forEach(card => {
  const name = card.querySelector('h3').textContent;
  service.add(new Option(name, name));
});

function handleServiceLink(event, action) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  action();
}

for (const link of document.querySelectorAll('.offer-open')) {
  const card = link.closest('.offer');
  link.addEventListener('click', event => handleServiceLink(event, () => {
    countActivity(card.dataset.slug, 'open');
    showDetails(card);
  }));
}

for (const link of document.querySelectorAll('.offer-enquire')) {
  link.addEventListener('click', event => {
    handleServiceLink(event, () => showForm('website', link.closest('.offer')));
  });
}

function showForm(preferredChannel, card = activeCard) {
  activeCard = card;
  modalVideo.pause();
  details.hidden = true;
  form.hidden = false;
  backButton.hidden = !activeCard;
  service.disabled = Boolean(activeCard);
  service.value = activeCard ? activeCard.querySelector('h3').textContent : 'General enquiry';
  const actions = form.querySelector('.compose-actions');
  for (const button of actions.querySelectorAll('button')) {
    const primary = button.value === preferredChannel;
    button.classList.toggle('primary-action', primary);
    button.classList.toggle('secondary-action', !primary);
    if (primary) actions.prepend(button);
  }
  modal.setAttribute('aria-labelledby', 'form-heading');
  if (!modal.open) modal.showModal();
  syncMotion();
  modal.scrollTop = 0;
  form.elements.name.focus({preventScroll:true});
}

document.querySelector('#start-enquiry').addEventListener('click', () => showForm('website'));
const enquirySlug = new URLSearchParams(location.search).get('enquire');
const requestedService = cards.find(card => card.dataset.slug === enquirySlug);
if (requestedService) showForm('website', requestedService);
document.addEventListener('hex-enquiry', event => {
  showForm('website', cards.find(card => card.dataset.slug === event.detail) || null);
});
document.querySelectorAll('[data-enquiry]').forEach(link => {
  link.addEventListener('click', event => {
    handleServiceLink(event, () => showForm(link.dataset.enquiry, null));
  });
});
backButton.addEventListener('click', () => { if (activeCard) showDetails(activeCard); });
modal.querySelector('.close-enquiry').addEventListener('click', () => modal.close());
modal.addEventListener('close', () => {
  activeCard = null;
  receipt = undefined;
  fallback.hidden = true;
  fallback.removeAttribute('href');
  receiptStatus.hidden = true;
  modalVideo.pause();
  modalVideo.removeAttribute('src');
  modalVideo.removeAttribute('poster');
  guideCaptions.removeAttribute('src');
  guidePlay.hidden = true;
  modalVideo.load();
  syncMotion();
  form.reset();
  for (const input of form.querySelectorAll('input')) input.setCustomValidity('');
});
modal.addEventListener('click', event => {
  if (event.target !== modal) return;
  const r = modal.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) modal.close();
});

const phone = form.elements.phone;
phone.addEventListener('input', () => {
  phone.setCustomValidity(phone.value && !/^[0-9]{10}$/.test(phone.value)
    ? 'Enter exactly 10 digits without +91.' : '');
});
phone.addEventListener('paste', event => {
  const pasted = event.clipboardData.getData('text').trim();
  if (/^[0-9]{1,10}$/.test(pasted)) return;
  event.preventDefault();
  phone.setCustomValidity('Paste a 10-digit mobile number without +91 or spaces.');
  phone.reportValidity();
});
for (const input of [form.elements.name, form.elements.city]) {
  input.addEventListener('input', () => input.setCustomValidity(''));
}

form.addEventListener('input', () => {
  fallback.hidden = true;
  receiptStatus.hidden = true;
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (sending) return;
  const name = form.elements.name.value.trim();
  const city = form.elements.city.value.trim();
  if (!name) form.elements.name.setCustomValidity('Enter your name.');
  if (!city) form.elements.city.setCustomValidity('Enter your city.');
  if (!/^[0-9]{10}$/.test(phone.value)) phone.setCustomValidity('Enter exactly 10 digits without +91.');
  if (!form.reportValidity()) return;

  const email = form.elements.email.value.trim();
  const message = form.elements.message.value.trim();
  const enquiry = ['Hello Hex Security,', '', 'I would like to enquire about ' + service.value + '.',
    '', 'Name: ' + name, 'Mobile: +91 ' + phone.value, 'City: ' + city];
  if (email) enquiry.push('Reply email: ' + email);
  if (message) enquiry.push('', message);
  const destination = new URL('https://wa.me/919680600369');
  destination.searchParams.set('text', enquiry.join('\n'));
  const whatsapp = event.submitter?.value === 'whatsapp';
  if (!reportingEnabled) {
    if (whatsapp) {
      window.location.assign(destination.href);
      return;
    }
    receiptStatus.textContent = 'Direct enquiries work on the live Hex Security website.';
    receiptStatus.hidden = false;
    return;
  }

  const selected = cards.find(card => card.querySelector('h3').textContent === service.value);
  const fields = {name,phone:phone.value,city,email,message,service:selected?.dataset.slug || 'general',consent:true,delivery:'website'};
  const stamp = JSON.stringify(fields);
  if (receipt?.stamp !== stamp) receipt = {stamp,reference:crypto.randomUUID()};
  const current = receipt;
  const nextPage = () => whatsapp ? destination.href : './enquiry-sent.html' + (current.code ? '#' + current.code : '');
  receiptStatus.hidden = false;
  fallback.hidden = true;
  if (current.completed) {
    window.location.assign(nextPage());
    return;
  }
  sending = true;
  receiptStatus.textContent = 'Sending your enquiry…';
  const buttons = [...form.querySelectorAll('button[type="submit"]')];
  buttons.forEach(button => { button.disabled = true; });
  try {
    const code = await sendWebsiteEnquiry({...fields,reference:current.reference});
    if (!modal.open || receipt !== current) return;
    current.code = code;
    current.completed = true;
    receiptStatus.textContent = 'Enquiry sent successfully.';
    if (!whatsapp) modal.close();
    window.location.assign(nextPage());
  } catch {
    if (modal.open && receipt === current) {
      receiptStatus.textContent = 'We could not confirm receipt. Retry here or continue on WhatsApp.';
      fallback.href = destination.href;
      fallback.textContent = 'Continue on WhatsApp';
      fallback.hidden = false;
    }
  } finally {
    sending = false;
    buttons.forEach(button => { button.disabled = false; });
  }
});
