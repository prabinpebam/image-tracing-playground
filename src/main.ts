import './styles/tokens.css';
import './styles/app.css';
import { registerEngines } from './tracers';
import { initTheme } from './ui/theme';
import { App } from './ui/app';

initTheme();
registerEngines();

const root = document.getElementById('app');
if (root) new App(root);
