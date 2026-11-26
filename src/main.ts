import './styles/theme.css';
import { loadContent } from './lib/content';
import { applyPageColour, applyTheme } from './lib/theme';
import { onRoute, redirect, route, startRouter } from './lib/router';
import { afterRoute, initEffects, introScreen } from './lib/effects';
import { header, footer, markCurrent } from './layout';
import { notesPanel } from './widgets/notes';
import { homePage } from './pages/home';
import { aboutPage } from './pages/about';
import { productsPage } from './pages/products';
import { showPage } from './pages/show';
import { unitPage } from './pages/unit';
import { galleryPage } from './pages/gallery';
import { promotersPage } from './pages/promoters';
import { notFoundPage } from './pages/not-found';

// Register routes here. Fixed paths first; the "/:unitId" catch-alls last.
route('/', homePage);
route('/about', aboutPage);
route('/products', productsPage);
route('/show', showPage);
route('/gallery', galleryPage);
route('/promoter-profile', promotersPage);
// Pages that moved: Supply Chain is now a section of Unit 2; Unit 1's Clients is now Customers.
redirect('/supply-chain', '/unit-2/supply-chain');
redirect('/unit-1/clients', '/unit-1/customers');
route('/:unitId', unitPage);
route('/:unitId/:tab', unitPage);

const content = await loadContent();
applyTheme(content.site);
initEffects();

const app = document.getElementById('app')!;
const main = document.createElement('main');
const siteFooter = footer(content.site);
const notes = notesPanel();
app.replaceChildren(header(content, notes.api), main, siteFooter, notes.element);

const titles: Record<string, string> = Object.fromEntries([
  ...content.site.nav.map((n) => [n.path, n.label]),
  ['/products', 'Products'],
  ['/show', 'Presentation'],
]);
onRoute((pathname) => {
  afterRoute();
  applyPageColour(pathname);
  markCurrent(pathname);
  // The footer is hidden on the full-screen pages (home and slides), as in the design reference.
  siteFooter.hidden = pathname === '/' || pathname === '/show';
  const sectionPath = '/' + (pathname.split('/')[1] ?? '');
  document.title =
    pathname === '/'
      ? content.site.name
      : `${titles[sectionPath] ?? content.site.name} | ${content.site.name}`;
});

startRouter(main, content, notFoundPage);
// Add ?nointro to the URL to skip the intro while developing.
if (location.pathname === '/' && content.home.intro && !new URLSearchParams(location.search).has('nointro'))
  introScreen();
