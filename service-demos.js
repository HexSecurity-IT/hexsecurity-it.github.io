(() => {
  const studio = document.querySelector('[data-demo]');
  if (!studio) return;
  const stage = studio.querySelector('.demo-stage');
  const assets = '../media/demos/';
  const money = new Intl.NumberFormat('en-IN', {style: 'currency', currency: 'INR', maximumFractionDigits: 0});
  const price = amount => money.format(amount);
  const products = [
    {id: 'notebook', name: 'Studio notebook', cost: 150},
    {id: 'bottle', name: 'Sage water bottle', cost: 450},
    {id: 'mug', name: 'Ceramic coffee mug', cost: 300},
    {id: 'lamp', name: 'Brass desk lamp', cost: 1200}
  ];
  const image = (file, alt, className = 'preview-photo') => `<img class="${className}" src="${assets}${file}.webp" alt="${alt}" loading="lazy" decoding="async">`;
  const selectedTotal = quantities => quantities.reduce((total, units, i) => total + units * products[i].cost, 0);

  function windowPreview(title, markup) {
    stage.innerHTML = `<div class="preview-window">
      <div class="preview-bar"><span>${title}</span><small>Interactive demo</small></div>
      ${markup}
    </div>`;
  }

  function choicePreview(title, group, options, draw) {
    windowPreview(title, `<div class="preview-body">
      <div class="preview-switch" role="group" aria-label="${group}">
        ${options.map((option, index) => `<button type="button" data-choice="${index}" aria-pressed="${index === 0}">${option}</button>`).join('')}
      </div>
      <div class="preview-panel"></div>
    </div>`);
    const choices = [...stage.querySelectorAll('[data-choice]')];
    const panel = stage.querySelector('.preview-panel');
    const show = index => {
      choices.forEach((button, i) => button.setAttribute('aria-pressed', i === index));
      panel.innerHTML = draw(index);
    };
    choices.forEach((button, index) => button.addEventListener('click', () => show(index)));
    show(0);
    return panel;
  }

  function billing() {
    const quantities = [2, 1, 1];
    const saved = [];
    let dirty = true;
    windowPreview('Sample billing desk', `<div class="preview-body">
      <div class="preview-switch" role="group" aria-label="Billing screens">
        <button type="button" data-screen="invoice" aria-pressed="true">Create invoice</button>
        <button type="button" data-screen="register" aria-pressed="false">Sales register</button>
      </div>
      <div data-billing-panel="invoice">
        <div class="preview-table-wrap">
          <table>
            <thead><tr><th scope="col">Product</th><th scope="col">Qty</th><th scope="col">Amount</th></tr></thead>
            <tbody>${products.slice(0, 3).map((item, index) => `<tr>
              <th scope="row">${item.name}<small>${price(item.cost)} each</small></th>
              <td><div class="preview-quantity">
                <button type="button" data-step="-1" data-product="${index}" aria-label="Remove one ${item.name}">−</button>
                <span data-qty="${index}"></span>
                <button type="button" data-step="1" data-product="${index}" aria-label="Add one ${item.name}">+</button>
              </div></td>
              <td data-line="${index}"></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="preview-total"><span>Invoice total</span><strong data-invoice-total></strong></div>
        <button class="preview-primary" type="button" data-save>Save sample invoice</button>
        <p class="preview-status" role="status">Change any quantity to see the total update.</p>
      </div>
      <div data-billing-panel="register" hidden>
        <div class="preview-table-wrap">
          <table><thead><tr><th scope="col">Invoice</th><th scope="col">Items</th><th scope="col">Total</th></tr></thead><tbody data-register></tbody></table>
        </div>
      </div>
    </div>`);
    const status = stage.querySelector('.preview-status');
    const save = stage.querySelector('[data-save]');
    const register = stage.querySelector('[data-register]');
    const panels = [...stage.querySelectorAll('[data-billing-panel]')];
    const screens = [...stage.querySelectorAll('[data-screen]')];

    function update() {
      quantities.forEach((quantity, index) => {
        stage.querySelector(`[data-qty="${index}"]`).textContent = quantity;
        stage.querySelector(`[data-line="${index}"]`).textContent = price(quantity * products[index].cost);
        stage.querySelector(`[data-product="${index}"][data-step="-1"]`).disabled = quantity === 0;
        stage.querySelector(`[data-product="${index}"][data-step="1"]`).disabled = quantity === 99;
      });
      stage.querySelector('[data-invoice-total]').textContent = price(selectedTotal(quantities));
      save.disabled = !dirty || !selectedTotal(quantities);
      register.innerHTML = saved.length
        ? saved.map(entry => `<tr><th scope="row">${entry.id}</th><td>${entry.count}</td><td>${price(entry.total)}</td></tr>`).join('')
        : '<tr><td colspan="3">Save a sample invoice to see it here.</td></tr>';
    }

    stage.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
      quantities[Number(button.dataset.product)] += Number(button.dataset.step);
      dirty = true;
      update();
      status.textContent = 'Invoice total updated to ' + price(selectedTotal(quantities)) + '.';
    }));
    screens.forEach(button => button.addEventListener('click', () => {
      screens.forEach(screen => screen.setAttribute('aria-pressed', screen === button));
      panels.forEach(panel => { panel.hidden = panel.dataset.billingPanel !== button.dataset.screen; });
    }));
    save.addEventListener('click', () => {
      const id = 'INV-' + (1042 + saved.length);
      saved.unshift({id, count: quantities.reduce((sum, n) => sum + n, 0), total: selectedTotal(quantities)});
      dirty = false;
      update();
      status.textContent = id + ' saved. Open Sales register to find it.';
    });
    update();
  }

  function store() {
    const quantities = products.map(() => 0);
    const demoShop = 'Desk Supply · Sample shop';
    windowPreview(demoShop, `<div class="preview-body shop-preview">
      <div class="shop-main">
        <h3>Everyday desk essentials</h3>
        <div class="shop-products">${products.map((product, index) => `<article class="shop-product">
          ${image('product-'+product.id, product.name, 'shop-product-photo')}
          <div><h4>${product.name}</h4><p>${price(product.cost)}</p>
          <button type="button" data-add="${index}" aria-label="Add ${product.name} to cart">Add to cart</button></div>
        </article>`).join('')}</div>
      </div>
      <aside class="shop-cart" aria-labelledby="sample-cart-title">
        <h3 id="sample-cart-title">Your cart</h3>
        <div data-cart-lines></div>
        <div class="preview-total"><span>Total</span><strong data-cart-total></strong></div>
        <button class="preview-primary" type="button" data-checkout>Place sample order</button>
        <p class="preview-status" role="status">Try the shopping flow with demo products.</p>
      </aside>
    </div>`);
    const lines = stage.querySelector('[data-cart-lines]');
    const total = stage.querySelector('[data-cart-total]');
    const status = stage.querySelector('.preview-status');
    const checkout = stage.querySelector('[data-checkout]');
    function refresh(message) {
      const cartRows = products.map((item, index) => quantities[index]
        ? `<li><span>${item.name} × ${quantities[index]}</span><button type="button" data-remove="${index}" aria-label="Remove ${item.name}">−</button></li>` : '');
      const amount = selectedTotal(quantities);
      lines.innerHTML = amount ? `<ul>${cartRows.join('')}</ul>` : '<p>Your cart is empty.</p>';
      total.textContent = price(amount);
      checkout.disabled = amount === 0;
      if (message) status.textContent = message;
    }
    stage.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.add);
      if (quantities[index] === 99) return;
      quantities[index]++;
      refresh(products[index].name + ' added. Cart total ' + price(selectedTotal(quantities)) + '.');
    }));
    lines.addEventListener('click', event => {
      const button = event.target.closest('[data-remove]');
      if (!button) return;
      const index = Number(button.dataset.remove);
      quantities[index]--;
      refresh('Cart updated. Total ' + price(selectedTotal(quantities)) + '.');
      (lines.querySelector(`[data-remove="${index}"]`) || stage.querySelector(`[data-add="${index}"]`)).focus();
    });
    checkout.addEventListener('click', () => {
      const amount = selectedTotal(quantities);
      if (!amount) return;
      quantities.fill(0);
      refresh('Sample order confirmed for ' + price(amount) + '. This is a preview checkout.');
      stage.querySelector('[data-add]').focus();
    });
    refresh();
  }

  function design() {
    const examples = [
      ['brand', 'Café logo, packaging and colour swatches', 'Logo and brand identity', 'A cup-and-mountain mark with a burgundy, cream and sage palette, carried across packaging and print.'],
      ['poster', 'Local café window poster featuring iced coffee and the café logo', 'Print poster', 'A large product image and a clear layout designed to read from outside the shop.'],
      ['social', 'Matching café artwork presented on a phone, with packaging next to it', 'Social media creative', 'The same logo and colours in a mobile format, designed for customers scrolling a social feed.']
    ];
    choicePreview('Café brand portfolio', 'Design samples', ['Logo & identity', 'Print poster', 'Social creative'], index => {
      const [file, alt, title, description] = examples[index];
      return `<figure class="preview-figure">${image('design-'+file, alt)}<figcaption><strong>${title}</strong><span>${description}</span></figcaption></figure>`;
    });
  }

  function cameras() {
    const views = [
      ['entrance', 'Sample camera frame covering a shop entrance and aisles', '01 · Shop entrance', 'Live view preview'],
      ['counter', 'Cropped sample frame showing the checkout counter', '02 · Checkout counter', 'Counter coverage preview'],
      ['entrance', 'Recorded sample frame of the shop entrance', '01 · Shop entrance', 'Recorded footage preview']
    ];
    choicePreview('Shop camera monitor', 'Camera views', ['Entrance', 'Counter', 'Playback'], index => {
      const [file, alt, label, status] = views[index];
      return `<figure class="preview-figure camera-figure">
        <div class="camera-screen">${image('camera-'+file, alt)}<span class="camera-label">${label}</span></div>
        <figcaption><strong>${status}</strong><span>${index === 2 ? 'Example recording · 10:24 AM' : 'Sample footage for the coverage demo.'}</span></figcaption>
      </figure>`;
    });
  }

  function marketing() {
    const placements = [
      ['Sponsored search result', 'Boutique in Suratgarh', 'Shop local kurtas and browse the collection online.', 'boutique'],
      ['Sponsored Reel', 'A new kurta collection in the feed', 'A vertical creative introduces the products and takes interested viewers to the shop.', 'reels'],
      ['YouTube video ad', 'A boutique ad before a video', 'A wide creative shows the shop and gives viewers a clear next step.', 'youtube']
    ];
    const panel = choicePreview('Retail campaign preview', 'Ad placements', ['Google Search', 'Instagram Reels', 'YouTube'], index => {
      const [placement, title, description, file] = placements[index];
      const creative = image('ads-'+file, 'Sample product creative for a clothing boutique');
      const layouts = [
        `<div class="sample-search"><div>kurta shop near me</div><small>Sponsored result</small><strong>Suratgarh Boutique</strong>${creative}</div>`,
        `<div class="sample-reel"><div>${creative}<span>Sponsored · Suratgarh Boutique</span></div></div>`,
        `<div class="sample-player"><div>${creative}<span>Video ad · 0:06</span></div><span aria-hidden="true">▶</span></div>`
      ];
      return `<div class="ad-preview">
        <div class="ad-display">${layouts[index]}</div>
        <div class="ad-card"><small>${placement}</small><h3>${title}</h3><p>${description}</p>
          <button type="button" class="preview-primary" data-show-offer aria-expanded="false">Preview the landing page</button>
          <div class="ad-landing" hidden><strong>Kurta collection</strong><p>Shop photos, collection details and an enquiry button would appear on the customer’s landing page.</p></div>
        </div>
      </div>`;
    });
    panel.addEventListener('click', event => {
      const control = event.target.closest('[data-show-offer]');
      if (!control) return;
      const landing = panel.querySelector('.ad-landing');
      landing.hidden = !landing.hidden;
      control.setAttribute('aria-expanded', !landing.hidden);
      control.textContent = landing.hidden ? 'Preview the landing page' : 'Hide landing page preview';
    });
  }

  function itSupport() {
    windowPreview('Sample support dashboard', `<div class="preview-body">
      <div class="technical-preview">
      ${image('support-setup', 'Technician inspecting a computer and connected devices')}
      <div>
      <h3>Printer and network check</h3>
      <ul class="preview-checks">
        <li><span>Workstation connection</span><strong>Connected</strong></li>
        <li><span>Network connection</span><strong>Ready</strong></li>
        <li><span>Invoice printer</span><strong class="preview-attention" data-printer>Print job waiting</strong></li>
      </ul>
      <button type="button" class="preview-primary" data-print>Run sample print test</button>
      <p role="status" class="preview-status">See how the printer status changes after a test.</p>
      </div>
      </div>
    </div>`);
    stage.querySelector('[data-print]').addEventListener('click', () => {
      const printer = stage.querySelector('[data-printer]');
      printer.textContent = 'Test page printed';
      printer.classList.remove('preview-attention');
      const photo = stage.querySelector('.technical-preview img');
      photo.src = assets + 'support-print.webp';
      photo.alt = 'Technician and shop staff check the sample printout';
      stage.querySelector('.preview-status').textContent = 'Sample result: the printer is ready to take invoice jobs.';
    });
  }

  function cybersecurity() {
    const cases = [
      ['Unfamiliar sign-in', 'Review login alerts using the platform’s own account settings. Report any activity you do not recognise.', 'Check the alert in official account settings.', 'alert', 'Shop owner reviewing a login alert on a phone'],
      ['Two-step verification', 'Add a second verification step on your own account, then keep recovery options up to date.', 'Review recovery details and two-step verification.', 'phone', 'Security professional reviewing a phone'],
      ['Backups and missing files', 'Check which files are backed up before deciding whether to attempt recovery.', 'Confirm what was saved in the last backup.', 'backup', 'Backup drive and device used in a review']
    ];
    const panel = choicePreview('Sample account security review', 'Security checks', ['Login alert', 'Two-step sign-in', 'Backup check'], index => {
      const [title, description, step, filename, alt] = cases[index];
      return `<div class="technical-preview">${image('security-' + filename, alt)}<div class="security-review"><span class="preview-signal" aria-hidden="true">!</span><div>
        <h3>${title}</h3><p>${description}</p>
        <div class="security-step"><strong>Recommended first step</strong><span>${step}</span></div>
        <button type="button" class="preview-primary" data-review>Mark sample as reviewed</button>
        <p class="preview-status" role="status"></p>
      </div></div></div>`;
    });
    panel.addEventListener('click', event => {
      if (!event.target.closest('[data-review]')) return;
      panel.querySelector('.preview-status').textContent = 'Review complete for this sample.';
    });
  }

  const demos = {'it-support': itSupport, 'wifi-cctv': cameras, billing, store, marketing, design, cybersecurity};
  demos[studio.dataset.demo]?.();
})();
