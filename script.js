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
const details = document.querySelector('#details-step');
const title = document.querySelector('#dialog-title');
const modalVideo = document.querySelector('#dialog-video');
const form = document.querySelector('#lead-form');
const service = document.querySelector('#lead-service');
const backButton = document.querySelector('#back-details');
const motionButton = document.querySelector('#motion-toggle');
const motionSetting = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = motionSetting.matches;
let activeCard = null;

const galleryVideos = [...document.querySelectorAll('.inline-video')];
const visibleVideos = new Set();

function syncMotion() {
  for (const video of galleryVideos) {
    const shouldPlay = !paused && visibleVideos.has(video) && !document.hidden && !modal.open;
    if (shouldPlay) video.play().catch(() => {});
    else video.pause();
  }
  motionButton.textContent = paused ? 'Play videos' : 'Pause videos';
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
document.addEventListener('visibilitychange', syncMotion);
syncMotion();
service.add(new Option('General enquiry', 'General enquiry'));

function showDetails(card) {
  activeCard = card;
  const name = card.querySelector('h3').textContent;
  title.textContent = name;
  service.value = name;
  service.disabled = true;
  const preview = card.querySelector('video');
  modalVideo.setAttribute('aria-label', preview.getAttribute('aria-label'));
  if (modalVideo.getAttribute('src') !== preview.dataset.detailSrc) {
    modalVideo.poster = preview.dataset.detailPoster;
    modalVideo.src = preview.dataset.detailSrc;
  }
  document.querySelector('#dialog-summary').textContent = card.querySelector('.offer-copy p').textContent;
  document.querySelector('#dialog-details').replaceChildren(card.querySelector('template').content.cloneNode(true));
  form.hidden = true;
  details.hidden = false;
  modal.setAttribute('aria-labelledby', 'dialog-title');
  if (!modal.open) modal.showModal();
  syncMotion();
  if (!paused) modalVideo.play().catch(() => {});
  modal.scrollTop = 0;
  title.focus({preventScroll:true});
}

cards.forEach(card => {
  const name = card.querySelector('h3').textContent;
  service.add(new Option(name, name));
  card.querySelector('.offer-open').addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    showDetails(card);
  });
});

function showForm(preferredChannel) {
  modalVideo.pause();
  details.hidden = true;
  form.hidden = false;
  backButton.hidden = !activeCard;
  if (!activeCard) {
    service.disabled = false;
    service.value = 'General enquiry';
  }
  const actions = form.querySelector('.compose-actions');
  actions.prepend(actions.querySelector('[value="' + preferredChannel + '"]'));
  modal.setAttribute('aria-labelledby', 'form-heading');
  if (!modal.open) modal.showModal();
  syncMotion();
  modal.scrollTop = 0;
  form.elements.name.focus({preventScroll:true});
}

document.querySelector('#start-enquiry').addEventListener('click', () => showForm('whatsapp'));
const enquirySlug = new URLSearchParams(location.search).get('enquire');
const requestedService = cards.find(card => card.dataset.slug === enquirySlug);
if (requestedService) {
  showDetails(requestedService);
  showForm('whatsapp');
}
document.querySelectorAll('[data-enquiry]').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    activeCard = null;
    showForm(link.dataset.enquiry);
  });
});
backButton.addEventListener('click', () => { if (activeCard) showDetails(activeCard); });
modal.querySelector('.close-enquiry').addEventListener('click', () => modal.close());
modal.addEventListener('close', () => {
  activeCard = null;
  modalVideo.pause();
  modalVideo.removeAttribute('src');
  modalVideo.removeAttribute('poster');
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

form.addEventListener('submit', event => {
  event.preventDefault();
  const name = form.elements.name.value.trim();
  const city = form.elements.city.value.trim();
  if (!name) form.elements.name.setCustomValidity('Enter your name.');
  if (!city) form.elements.city.setCustomValidity('Enter your city.');
  if (!/^[0-9]{10}$/.test(phone.value)) phone.setCustomValidity('Enter exactly 10 digits without +91.');
  if (!form.reportValidity()) return;

  const enquiry = ['Hello Hex Security,', '', 'I would like to enquire about ' + service.value + '.',
    '', 'Name: ' + name, 'Mobile: +91 ' + phone.value, 'City: ' + city].join('\n');
  const gmail = event.submitter?.value === 'gmail';
  const destination = new URL(gmail ? 'https://mail.google.com/mail/' : 'https://wa.me/919680600369');
  destination.search = new URLSearchParams(gmail ? {
    view: 'cm', fs: '1', to: 'info.hexsec@zohomail.in', su: 'Service enquiry: ' + service.value, body: enquiry
  } : {text: enquiry}).toString();
  window.location.assign(destination.href);
});
