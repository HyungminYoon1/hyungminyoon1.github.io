// Each view is also an ordinary static page for direct visits and links.
const routes = new Set(['/', '/about/', '/projects/', '/learning/', '/projects/nodease/', '/projects/storeops/', '/projects/hmmwv/']);
const previousSections = new Map([
  ['#intro', '/about/'], ['#projects', '/projects/'], ['#cases', '/projects/'],
  ['#learning', '/learning/'], ['#approach', '/about/#approach'],
]);

function pagePath(pathname) {
  return pathname.replace(/\/index\.html$/, '/');
}

function destination(url) {
  const path = pagePath(url.pathname);
  const previous = path === '/' && previousSections.get(url.hash);
  return previous ? new URL(previous, url) : url;
}

const coverPreference = { paused: false };
let coverLifetime;

function setUpCover(main) {
  coverLifetime?.abort();
  coverLifetime = undefined;
  const control = main.querySelector('.motion-control');
  if (!control) return;
  const lifetime = new AbortController();
  coverLifetime = lifetime;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let session;

  async function applyPreference() {
    session?.abort();
    control.hidden = true;
    main.removeAttribute('data-motion');
    if (reduced.matches) return;
    const current = new AbortController();
    session = current;
    try {
      const { mountCover } = await import('/assets/cover-motion.js');
      if (!current.signal.aborted) mountCover(main, current.signal, coverPreference);
    } catch {
      current.abort();
    }
  }

  reduced.addEventListener('change', applyPreference, { signal: lifetime.signal });
  lifetime.signal.addEventListener('abort', () => session?.abort(), { once: true });
  applyPreference();
}

const initial = destination(new URL(location.href));
if (initial.href !== location.href) {
  location.replace(initial);
} else {
  setUpCover(document.querySelector('main'));
  enableNavigation();
}

function enableNavigation() {
  let displayed = pagePath(location.pathname);
  let pending;
  const positions = new Map();
  let sequence = 0;
  let entry = currentEntry();
  history.scrollRestoration = 'manual';

  function currentEntry() {
    if (!history.state?.portfolioEntry) {
      history.replaceState({ ...history.state, portfolioEntry: performance.timeOrigin + '/' + (++sequence) }, '');
    }
    return history.state.portfolioEntry;
  }

  function activateEntry(url, fromHistory) {
    if (!fromHistory && url.href !== location.href) history.pushState(null, '', url);
    entry = currentEntry();
    const anchor = document.getElementById(url.hash.slice(1));
    if (fromHistory && positions.has(entry)) {
      window.scrollTo({ top: positions.get(entry), behavior: 'instant' });
    } else if (anchor) {
      if (anchor.hasAttribute('tabindex')) anchor.focus({ preventScroll: true });
      anchor.scrollIntoView({ behavior: 'instant' });
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  async function navigate(url, fromHistory) {
    pending?.abort();
    const path = pagePath(url.pathname);
    positions.set(entry, window.scrollY);
    if (displayed === path) {
      activateEntry(url, fromHistory);
      return;
    }

    const request = new AbortController();
    pending = request;
    try {
      const response = await fetch(path, {
        signal: request.signal, mode: 'same-origin', credentials: 'omit', redirect: 'error',
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
        throw new Error('Unavailable portfolio page');
      }
      const next = new DOMParser().parseFromString(await response.text(), 'text/html');
      const main = next.querySelector('main#main');
      if (!main || !next.body.dataset.view) throw new Error('Missing portfolio content');
      if (request.signal.aborted) return;

      document.title = next.title;
      document.querySelector('meta[name="description"]').content = next.querySelector('meta[name="description"]').content;
      document.body.dataset.view = next.body.dataset.view;
      if (next.body.dataset.project) document.body.dataset.project = next.body.dataset.project;
      else delete document.body.dataset.project;
      for (const link of document.querySelectorAll('.site-header a')) {
        const current = next.querySelector('.site-header a[href="' + link.getAttribute('href') + '"]')?.getAttribute('aria-current');
        if (current) link.setAttribute('aria-current', current);
        else link.removeAttribute('aria-current');
      }
      document.querySelector('main').replaceWith(main);
      setUpCover(main);
      displayed = path;
      main.focus({ preventScroll: true });
      activateEntry(url, fromHistory);
    } catch {
      if (!request.signal.aborted) {
        if (fromHistory) location.reload();
        else location.assign(url);
      }
    }
  }

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target || link.hasAttribute('download') || link.origin !== location.origin) return;
    const url = destination(new URL(link.href));
    const path = pagePath(url.pathname);
    if (url.search || !routes.has(path)) return;
    event.preventDefault();
    navigate(url, false);
  });

  window.addEventListener('popstate', () => {
    const url = destination(new URL(location.href));
    if (url.href !== location.href) history.replaceState(history.state, '', url);
    navigate(url, true);
  });
}
