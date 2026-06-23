import './styles.css';
import { Game } from './systems/Game.js';

const canvas = document.querySelector('#game-canvas');
const game = new Game({ canvas });

game.start();
