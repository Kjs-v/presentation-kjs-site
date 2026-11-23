import './styles/base.css';
import { loadContent } from './lib/content';
import { applyTheme } from './lib/theme';
import { route, startRouter } from './lib/router';
import { header, footer } from './layout';
import { homePage } from './pages/home';
import { productsPage } from './pages/products';
import { showPage } from './pages/show';
import { unitPage } from './pages/unit';
import { galleryPage } from './pages/gallery';
import { notFoundPage } from './pages/not-found';

// Register routes here. Specific paths first, the "/:unitId" catch-all last.
route('/', homePage);
route('/products', productsPage);
route('/show', showPage);
route('/gallery', galleryPage);
route('/:unitId', unitPage);

const content = await loadContent();
applyTheme(content.site);

const app = document.getElementById('app')!;
const main = document.createElement('main');
app.replaceChildren(header(content.site), main, footer(content.site));
startRouter(main, content, notFoundPage);
