import './style.css';
import { Game } from './game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);

// keep a handle for debugging / screenshots
window.__gameInstance = game;
