import './styles/tokens.css';
import './styles/app.css';
import { registerEngines } from './tracers';
import { App } from './ui/app';

registerEngines();

const root = document.getElementById('app');
if (root) new App(root);
