const pages = [
  { id: 'rates', label: 'Daily rates', marker: '01' },
  { id: 'customers', label: 'Customers', marker: '02' },
  { id: 'payments', label: 'Payments', marker: '03' },
  { id: 'sales', label: 'Billing', marker: '04' },
  { id: 'purchases', label: 'Purchases', marker: '05' },
  { id: 'expenses', label: 'Expenses', marker: '06' },
  { id: 'logbook', label: 'Logbook', marker: '07' },
  { id: 'analytics', label: 'Analytics', marker: '08' },
];

/** Authenticated layout with keyboard-accessible navigation between supported workflows. */
export default function AppShell({ page, setPage, deviceName, onSignOut, children }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="topbar">
        <a className="brand" href="#main-content" aria-label="Kalash Gold terminal home">
          <span className="brand-mark" aria-hidden="true">K</span>
          <span><strong>Kalash Gold</strong><small>Counter terminal</small></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          {pages.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`nav-item ${page === item.id ? 'nav-active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-marker">{item.marker}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="device-menu">
          <span className="device-indicator" aria-hidden="true" />
          <span className="device-name">{deviceName || 'Authorized terminal'}</span>
          <button className="button button-quiet signout-button" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>
      <main id="main-content" className="main-content" tabIndex="-1">{children}</main>
      <footer className="app-footer"><span>KALASH GOLD / TERMINAL</span><span>Rates · Billing · Stock · Cash · Analytics</span></footer>
    </div>
  );
}
