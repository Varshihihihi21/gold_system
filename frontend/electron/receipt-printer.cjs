const { BrowserWindow } = require('electron');

function safeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

/** Print validated receipt text through the system's default printer driver. */
async function printReceipt(receipt, partition) {
  if (!receipt || typeof receipt.title !== 'string' || receipt.title.length > 80
      || !Array.isArray(receipt.lines) || receipt.lines.length > 40) {
    throw new TypeError('Receipt data is invalid.');
  }
  const lines = receipt.lines.map((line) => {
    if (typeof line !== 'string' || line.length > 200) throw new TypeError('Receipt line is invalid.');
    return `<p>${safeHtml(line)}</p>`;
  }).join('');
  const total = receipt.total === undefined ? '' : `<strong>${safeHtml(receipt.total)}</strong>`;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{font:14px monospace;width:72mm;margin:0 auto;padding:4mm}
    p{margin:2mm 0;overflow-wrap:anywhere}strong{display:block;margin-top:4mm}
  </style><h2>${safeHtml(receipt.title)}</h2>${lines}${total}`;
  const printWindow = new BrowserWindow({
    show: false,
    width: 460,
    height: 760,
    title: receipt.title,
    autoHideMenuBar: true,
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
    },
  });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    printWindow.show();
    printWindow.focus();
    await new Promise((resolve, reject) => {
      printWindow.webContents.print({ silent: false, printBackground: false }, (success, reason) => {
        if (success) resolve();
        else reject(new Error(reason || 'The printer did not complete the job.'));
      });
    });
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
  }
}

module.exports = { printReceipt };
