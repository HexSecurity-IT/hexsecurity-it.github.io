import { replies } from './assistant-replies.js?v=1';

const markup = `<aside id="hex-assistant" class="hex-assistant" aria-label="Hex Security website assistant" hidden>
    <button type="button" class="hex-launch" id="hex-launch" aria-controls="hex-chat" aria-expanded="false">
      <span class="hex-robot" aria-hidden="true"><span class="hex-antenna"></span><span class="hex-face"><i></i><i></i><b></b></span></span>
      <span class="hex-launch-copy"><strong>Ask Hex</strong><small lang="hi">नमस्ते! मदद चाहिए?</small></span>
    </button>
    <section class="hex-chat" id="hex-chat" aria-labelledby="hex-chat-title" hidden>
      <header class="hex-chat-header">
        <div><h2 id="hex-chat-title">Hex Security assistant</h2><p>Ask in Hindi, Hinglish or English</p></div>
        <button type="button" id="hex-close" aria-label="Close assistant">×</button>
      </header>
      <div class="hex-chat-body">
        <ol class="hex-messages" id="hex-messages" aria-label="Conversation" aria-live="polite"></ol>
        <div class="hex-actions" id="hex-actions">
          <button type="button" data-chat-question="All services">All services</button>
          <button type="button" data-chat-question="Billing software">Billing</button>
          <button type="button" data-chat-question="Shop camera">Wi-Fi camera</button>
          <button type="button" data-chat-question="Cyber security">Cyber security</button>
        </div>
        <div class="hex-audio-tools">
          <button type="button" id="hex-audio" aria-pressed="false">Voice replies off</button>
          <button type="button" id="hex-replay">Listen to reply</button>
        </div>
      </div>
      <div class="hex-input-area">
        <form id="hex-question-form">
          <label class="hex-visually-hidden" for="hex-question">Ask about a service</label>
          <input id="hex-question" maxlength="200" autocomplete="off" enterkeyhint="send" placeholder="Type a question…">
          <button type="submit" class="hex-send">Ask</button>
        </form>
        <div class="hex-mic-row" id="hex-mic-row" hidden>
          <button type="button" id="hex-mic" aria-pressed="false" aria-describedby="hex-voice-note">🎙 Speak</button>
          <label for="hex-language">Mic language</label>
          <select id="hex-language"><option value="hi-IN">हिन्दी</option><option value="en-IN">English</option></select>
        </div>
        <p class="hex-status" id="hex-status" role="status"></p>
        <p class="hex-voice-note" id="hex-voice-note">If you use the mic, your browser may process speech online. Keep passwords and OTPs out of chat.</p>
      </div>
    </section>
  </aside>`;
document.body.insertAdjacentHTML('beforeend', markup);

const root = document.querySelector('#hex-assistant');
const launch = root.querySelector('#hex-launch');
const panel = root.querySelector('#hex-chat');
const messages = root.querySelector('#hex-messages');
const actions = root.querySelector('#hex-actions');
const initialActions = [...actions.children];
const input = root.querySelector('#hex-question');
const status = root.querySelector('#hex-status');
const sound = root.querySelector('#hex-audio');
const mic = root.querySelector('#hex-mic');
const micRow = root.querySelector('#hex-mic-row');
const voiceNote = root.querySelector('#hex-voice-note');
const player = new Audio();
player.preload = 'none';
const Recognizer = window.SpeechRecognition || window.webkitSpeechRecognition;
const enquiryDialog = document.querySelector('#service-dialog');
let recognizer;
let voiceEnabled = false;
let currentReply = 'hello';
let currentService = location.pathname.match(/\/services\/([a-z-]+)\.html$/)?.[1];

const topics = [
  ['billing', /\b(?:bill|bills|billing|excel|vba|invoice|invoices|hisab|register|pdf)\b|बिल|एक्सेल|इनवॉइस|रजिस्टर|हिसाब|पीडीएफ|पी डी एफ/u],
  ['wifi-cctv', /\b(?:camera|cameras|cctv|wi fi|wifi|surveillance|recording)\b|कैमर|सीसीटीवी|वाई फ़ाई|वाई फाई|रिकॉर्डिंग/u],
  ['it-support', /\b(?:it support|printer|computer|laptop|network|troubleshoot|slow pc|software setup)\b|प्रिंटर|कंप्यूटर|कम्प्यूटर|लैपटॉप|नेटवर्क|आई टी सपोर्ट/u],
  ['store', /\b(?:websites?|online shop|shop online|online store|online list|online orders?|online bech|e commerce|ecommerce|product listing|checkout|marketplace)\b|वेबसाइट|ऑनलाइन दुकान|दुकान.*ऑनलाइन|ऑनलाइन स्टोर|ऑनलाइन ऑर्डर|ई कॉमर्स/u],
  ['marketing', /\b(?:ads?|marketing|seo|promotion|reels?|reach|advertising|campaign|new customers|customer nahi|customers nahi)\b|मार्केटिंग|विज्ञापन|गूगल ऐड|मेटा ऐड|रील|एस ई ओ|एसईओ|प्रचार|ग्राहक नहीं आते/u],
  ['design', /\b(?:graphic|design|designer|poster|logo|flyer|brochure|banner|creative)\b|ग्राफ़िक|ग्राफिक|डिज़ाइन|डिजाइन|पोस्टर|लोगो|बैनर/u],
  ['cybersecurity', /\b(?:cyber|cybersecurity|security|malware|phishing|scam|fraud|hacked|hacking|backup|suspect|suspicious|otp)\b|साइबर|सिक्योरिटी|सुरक्षा|मैलवेयर|स्कैम|फ्रॉड|हैक|धोखा|बैकअप|ओटीपी|फिशिंग/u]
];

function interpret(question) {
  const words = question.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
  const topic = topics.find(([, pattern]) => pattern.test(words))?.[0];
  if (/\b(?:data recovery|digital forensics|recover files|lost files|deleted files)\b|डेटा रिकवरी|डाटा रिकवरी|फ़ाइलें गायब|डिजिटल फ़ॉरेंसिक्स|डिजिटल फॉरेंसिक/u.test(words)) {
    return ['data', 'cybersecurity'];
  }
  const socialAccount = /\b(?:instagram|insta|facebook|fb|account|login)\b|इंस्टा|फेसबुक|फ़ेसबुक|अकाउंट|खाता|लॉगिन/u.test(words);
  if (socialAccount && /\b(?:recover|recovery|hack|hacked|login|locked|access|khul|khol|band)\b|रिकवरी|हैक|लॉक|खुल|एक्सेस|ऐक्सेस/u.test(words)) {
    return ['recovery', 'cybersecurity'];
  }
  if (/\b(?:price|pricing|cost|charges?|quote|kitna|kitne|rate|paisa)\b|कीमत|कितना|कितने|चार्ज|पैसा|खर्च|रेट/u.test(words)) {
    return ['price', topic || currentService];
  }
  if (/\b(?:contact|phone number|address|location|call|whatsapp|enquiry|inquiry)\b|फ़ोन नंबर|फोन नंबर|संपर्क|एन्क्वायरी|एंक्वायरी|पता|लोकेशन|कॉल|व्हाट्सएप/u.test(words)) {
    return ['contact', topic || currentService];
  }
  if (/\b(?:all services|services|hex security|kya karte|kya karti|who are you|what do you do|about hex)\b|सारी सर्विस|सेवाएं|सेवाएँ|क्या करते|क्या करती|हेक्स सिक्योरिटी/u.test(words)) {
    return ['all'];
  }
  if (topic) return [topic, topic];
  if (/^(?:hi|hey|hello|namaste|नमस्ते|हेलो)$/u.test(words)) return ['hello'];
  if (/\b(?:thanks|thank you|shukriya)\b|धन्यवाद|शुक्रिया/u.test(words)) return ['thanks', currentService];
  return ['clarify'];
}

function addMessage(text, fromCustomer = false) {
  const item = document.createElement('li');
  if (fromCustomer) item.dataset.customer = '';
  item.textContent = text;
  messages.append(item);
  if (messages.childElementCount > 13) messages.firstElementChild.remove();
}

function stopVoice() {
  player.pause();
  delete root.dataset.speaking;
}

function speak() {
  stopVoice();
  player.src = new URL('./media/assistant/' + currentReply + '.mp3', import.meta.url).href;
  player.play().catch(error => {
    if (error.name !== 'AbortError' && !panel.hidden) status.textContent = 'Tap Listen to reply to hear this message.';
  });
}

player.addEventListener('playing', () => { root.dataset.speaking = ''; });
player.addEventListener('ended', stopVoice);

function actionLink(label, url, callback) {
  const item = document.createElement('a');
  item.textContent = label;
  item.href = url;
  if (callback) item.addEventListener('click', callback);
  return item;
}

function updateActions(slug, reply) {
  if (!slug && reply !== 'contact') {
    actions.replaceChildren(...initialActions);
    return;
  }
  const links = [];
  if (slug) links.push(actionLink('Service & demo', new URL('./services/' + slug + '.html', import.meta.url)));
  const enquiryUrl = new URL(slug ? './?enquire=' + slug + '#services' : './#contact', import.meta.url);
  links.push(actionLink('Send enquiry', enquiryUrl, event => {
    if (!enquiryDialog) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setOpen(false, false);
    document.dispatchEvent(new CustomEvent('hex-enquiry', {detail: slug}));
  }));
  if (reply === 'contact') links.push(actionLink('Call our team', 'tel:+919680600369'));
  links.push(initialActions[0]);
  actions.replaceChildren(...links);
}

function answer(question) {
  const clean = question.trim().slice(0, 200);
  if (!clean) return;
  stopVoice();
  status.textContent = '';
  const [reply, slug] = interpret(clean);
  currentReply = reply;
  if (slug || reply === 'all') currentService = slug;
  addMessage(clean, true);
  addMessage(replies[reply]);
  updateActions(slug, reply);
  panel.querySelector('.hex-chat-body').scrollTop = panel.querySelector('.hex-chat-body').scrollHeight;
  if (voiceEnabled) speak();
}

function setOpen(open, returnFocus = true) {
  panel.hidden = !open;
  launch.setAttribute('aria-expanded', String(open));
  if (open) {
    if (!messages.childElementCount) addMessage(replies.hello);
    panel.querySelector('#hex-close').focus({preventScroll:true});
  } else {
    stopVoice();
    recognizer?.abort();
    if (returnFocus) launch.focus({preventScroll:true});
  }
}

launch.addEventListener('click', () => setOpen(panel.hidden));
panel.querySelector('#hex-close').addEventListener('click', () => setOpen(false));
root.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !panel.hidden) setOpen(false);
});
root.querySelector('#hex-replay').addEventListener('click', () => {
  recognizer?.abort();
  speak();
});
sound.addEventListener('click', () => {
  recognizer?.abort();
  voiceEnabled = !voiceEnabled;
  sound.textContent = voiceEnabled ? 'Voice replies on' : 'Voice replies off';
  sound.setAttribute('aria-pressed', String(voiceEnabled));
  if (voiceEnabled) speak();
  else stopVoice();
});
for (const button of initialActions) {
  button.addEventListener('click', () => answer(button.dataset.chatQuestion));
}
root.querySelector('#hex-question-form').addEventListener('submit', event => {
  event.preventDefault();
  recognizer?.abort();
  answer(input.value);
  input.value = '';
});

if (Recognizer) {
  micRow.hidden = false;
  recognizer = new Recognizer();
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;
  recognizer.onstart = () => {
    root.dataset.listening = '';
    mic.setAttribute('aria-pressed', 'true');
    mic.textContent = 'Stop mic';
    status.textContent = 'Listening… boliye.';
  };
  recognizer.onresult = event => {
    const heard = event.results[0]?.[0]?.transcript;
    if (heard && !panel.hidden) answer(heard);
  };
  recognizer.onend = () => {
    delete root.dataset.listening;
    mic.setAttribute('aria-pressed', 'false');
    mic.textContent = '🎙 Speak';
    if (status.textContent === 'Listening… boliye.') status.textContent = '';
  };
  recognizer.onerror = event => {
    if (!panel.hidden && event.error !== 'aborted') {
      status.textContent = 'Voice input unavailable. Aap apna sawaal type kar sakte hain.';
    }
  };
  mic.addEventListener('click', () => {
    if (root.hasAttribute('data-listening')) {
      recognizer.stop();
      return;
    }
    stopVoice();
    voiceEnabled = true;
    sound.textContent = 'Voice replies on';
    sound.setAttribute('aria-pressed', 'true');
    recognizer.lang = root.querySelector('#hex-language').value;
    try {
      recognizer.start();
    } catch {
      status.textContent = 'Mic start nahi hua. Dobara tap karein ya sawaal type karein.';
    }
  });
} else {
  voiceNote.textContent = 'Is browser mein sawaal type karein. Reply sunne ke liye Listen to reply dabayein.';
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    recognizer?.abort();
    stopVoice();
  }
});
enquiryDialog?.addEventListener('toggle', event => {
  if (event.newState === 'open') setOpen(false, false);
});
root.hidden = false;
