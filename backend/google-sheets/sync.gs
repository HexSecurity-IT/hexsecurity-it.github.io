/** @OnlyCurrentDoc */
const sheetReportUrl = 'https://hex-security-reports.info-hexsec.workers.dev/sheet-report';

function configureReport() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (book.getId() !== '1T45NlokESoGc-xrHa1S6AQI9SLWoaPDmNb6OCW29Zio') throw new Error('Open the Hex Security report.');
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('REPORT_KEY');
  if (!key) {
    key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('REPORT_KEY', key);
  }
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key);
  const fingerprint = digest.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
  book.getSheetByName('Enquiries').getRange('F1').setNote('Cloudflare report fingerprint: ' + fingerprint);
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'syncWebsiteReport')) {
    ScriptApp.newTrigger('syncWebsiteReport').timeBased().everyMinutes(5).create();
  }
  syncWebsiteReport();
}

function syncWebsiteReport() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const key = props.getProperty('REPORT_KEY');
    if (!key) throw new Error('Run configureReport once.');
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const state = JSON.parse(props.getProperty('REPORT_CURSOR') || '{"since":"2000-01-01","kind":"enquiries","after":0}');
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const url = sheetReportUrl + '?kind=' + state.kind + '&since=' + state.since + '&after=' + state.after;
      const response = UrlFetchApp.fetch(url, {headers:{Authorization:'Bearer ' + key},muteHttpExceptions:true,followRedirects:false});
      if (response.getResponseCode() !== 200) throw new Error('Cloudflare report connection returned ' + response.getResponseCode() + '.');
      const page = JSON.parse(response.getContentText());
      if (!state.startedDay) state.startedDay = page.today;
      const leads = state.kind === 'enquiries';
      mergeReportRows_(book.getSheetByName(leads ? 'Enquiries' : 'Visits'), page.rows, leads);
      SpreadsheetApp.flush();
      if (page.next) {
        state.after = page.next;
      } else if (leads) {
        state.kind = 'visits';
        state.after = 0;
      } else {
        props.setProperty('REPORT_CURSOR', JSON.stringify({since:state.startedDay,kind:'enquiries',after:0}));
        return;
      }
      props.setProperty('REPORT_CURSOR', JSON.stringify(state));
    }
  } finally {
    lock.releaseLock();
  }
}

function mergeReportRows_(sheet, incoming, leads) {
  if (!incoming.length) return;
  const width = leads ? 6 : 4;
  const last = sheet.getLastRow();
  const existing = last > 1 ? sheet.getRange(2, leads ? 6 : 1, last-1, leads ? 1 : 4).getDisplayValues() : [];
  const rowKey = row => JSON.stringify(row.slice(0,3));
  const index = new Map(existing.map((row,i) => [leads ? row[0] : rowKey(row),i+2]));
  const added = [];
  for (const row of incoming) {
    const at = index.get(leads ? row[5] : rowKey(row));
    if (!at) {
      added.push(row);
    } else if (!leads && Number(existing[at-2][3]) !== row[3]) {
      sheet.getRange(at,4).setValue(row[3]);
    }
  }
  if (!added.length) return;
  if (last + added.length > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), last+added.length-sheet.getMaxRows());
  sheet.getRange(last+1,1,added.length,leads ? 6 : 3).setNumberFormat('@');
  const values = added.map(row => row.map(v => typeof v === 'string' && /^[=+'@-]/.test(v) ? "'" + v : v));
  sheet.getRange(last+1,1,added.length,width).setValues(values);
}
