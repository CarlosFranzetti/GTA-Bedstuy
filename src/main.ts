// Placeholder boot: replaced by the integration pass once all modules land.
import * as THREE from 'three';
import { Game } from '@/core/Game';
import { Input } from '@/core/Input';

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.className = 'game';
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fb8d8');
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 6, 12); camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight('#ffffff', '#555566', 1.2));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: '#3b3b3b' }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: '#c0392b' }));
cube.position.y = 1; scene.add(cube);

const input = new Input(renderer.domElement);
const game = new Game(() => renderer.render(scene, camera), () => input.endFrame());
game.add({ update: (dt) => { cube.rotation.y += dt; cube.position.x += input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']) * 5 * dt; } });
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
(window as unknown as { __gtaReady: boolean }).__gtaReady = true;
game.start();
