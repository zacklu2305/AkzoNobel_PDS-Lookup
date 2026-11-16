import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log('%cBuilt by Zack Lu', 'font-weight:bold; font-size:12px;');

createRoot(document.getElementById('root')!).render(<App />);
