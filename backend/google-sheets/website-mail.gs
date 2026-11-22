const websiteMailEndpoint = 'https://hex-security-reports.info-hexsec.workers.dev/mail-outbox';
const websiteInbox = 'info.hexsec@zohomail.in';

function installWebsiteMail() {
  const props = PropertiesService.getScriptProperties();
  if (!callWebsiteMail_(props, {action:'ping'}).ready) throw new Error('Website mail connection unavailable.');
  if (!ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === 'deliverWebsiteMail')) {
    ScriptApp.newTrigger('deliverWebsiteMail').timeBased().everyMinutes(1).create();
  }
  deliverWebsiteMail();
}

function deliverWebsiteMail() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const budget = Math.min(5, MailApp.getRemainingDailyQuota());
    if (!budget) return;
    const props = PropertiesService.getScriptProperties();
    const batch = callWebsiteMail_(props, {action:'claim',count:budget});
    for (const row of batch.rows) {
      const sentKey = 'SENT_' + row.reference;
      if (!props.getProperty(sentKey)) {
        const options = {name:'Hex Security Website'};
        if (row.reply_to) options.replyTo = row.reply_to;
        const body = [
          'A customer sent an enquiry on the Hex Security website.', '',
          'Service: ' + row.service,
          'Name: ' + row.customer_name,
          'Mobile: +91 ' + row.phone,
          'City: ' + row.city,
          'Email: ' + (row.reply_to || 'Not provided'),
          'Received (IST): ' + row.received_ist, '',
          'Request: ' + (row.message || 'No additional details'), '',
          'Reference: ' + row.reference
        ].join('\n');
        MailApp.sendEmail(websiteInbox, 'Website enquiry — ' + row.service, body, options);
        props.setProperty(sentKey,'1');
      }
      if (callWebsiteMail_(props, {action:'sent',reference:row.reference,lease:batch.lease}).acknowledged) {
        props.deleteProperty(sentKey);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function callWebsiteMail_(props, body) {
  const key = props.getProperty('ENQUIRY_MAIL_KEY');
  if (!/^[0-9a-f]{64}$/i.test(key || '')) throw new Error('Website mail connection key is missing.');
  const result = UrlFetchApp.fetch(websiteMailEndpoint, {
    method:'post',
    contentType:'application/json',
    headers:{Authorization:'Bearer ' + key},
    payload:JSON.stringify(body),
    followRedirects:false,
    muteHttpExceptions:true
  });
  if (result.getResponseCode() !== 200) throw new Error('Website mail connection returned ' + result.getResponseCode() + '.');
  return JSON.parse(result.getContentText());
}
