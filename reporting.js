'use strict';

const reportOrigin = 'https://hex-security-reports.info-hexsec.workers.dev';
const reportingEnabled = location.origin === 'https://hexsecurity-it.github.io';

function countActivity(page, event) {
  if (!reportingEnabled || navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
  fetch(reportOrigin + '/activity', {
    method:'POST', credentials:'omit', referrerPolicy:'no-referrer', keepalive:true,
    headers:{'Content-Type':'application/json'}, body:JSON.stringify({page,event})
  }).catch(() => {});
}

if (reportingEnabled) {
  const match = location.pathname.match(/^\/services\/([a-z-]+)\.html$/);
  if (match || ['/', '/index.html'].includes(location.pathname)) {
    countActivity(match ? match[1] : 'home', 'view');
  }
}

async function sendWebsiteEnquiry(enquiry) {
  const response = await fetch(reportOrigin + '/enquiries', {
    method:'POST', credentials:'omit', referrerPolicy:'no-referrer',
    headers:{'Content-Type':'application/json'}, body:JSON.stringify(enquiry),
    signal:AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error('Enquiry not confirmed');
  const receipt = await response.json();
  if (receipt.received !== true || receipt.reference !== enquiry.reference) throw new Error('Enquiry not confirmed');
}
