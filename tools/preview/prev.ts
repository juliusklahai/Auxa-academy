import * as THREE from 'three';
import { buildHandSurface } from '../../src/hands3d/geometry';
const m = buildHandSurface(2.2);
const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
g.setIndex(new THREE.BufferAttribute(m.indices, 1));
const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(1000, 900); document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#eee');
scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 1.6)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(-1, 1, 2); scene.add(dl);
const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: .95 })); scene.add(mesh);
const wire = new THREE.LineSegments(new THREE.EdgesGeometry(g, 40), new THREE.LineBasicMaterial({ color: '#222' })); scene.add(wire);
const view = (window as any).VIEW || 'top';
const cam = new THREE.OrthographicCamera(-110, 110, 100, -100, 1, 1000);
if (view === 'top') { cam.position.set(-10, 70, 400); cam.lookAt(-10, 70, 0); }
else { cam.position.set(300, 70, 120); cam.up.set(0, 0, 1); cam.lookAt(-10, 70, 0); }
r.render(scene, cam);
(window as any).done = true;
