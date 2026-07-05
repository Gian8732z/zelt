// Procedural 3D model of the 8er Spatz for Tent3D.svelte. Geometry is schematic but structurally
// faithful (per the Materialwart's spec, 2026-07-05): A-frame ridge tent; the Vorzelt is a separate
// front fabric sheet in the same plane as the Aussenzelt; 4 poles (3 in-line poking through the
// ridge, 1 holding the Vorzelt); no ridge pole; 5 hem attachment points per Aussenzelt long side +
// storm guys at the edge poles; 3 per Vorzelt side + its pole guy; 10 cords Innenzelt↔Aussenzelt
// hem (5 per side); eyelets + hooks at every hem point. Every tappable piece sits in a Group whose
// userData.subpart is its SubPartKey; thin parts carry oversized invisible proxy cylinders so they
// are actually hittable on a phone. This module imports three statically and is itself dynamically
// imported, so three lands in a lazy chunk — keep it out of eagerly-loaded code.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Severity, SubPartKey } from './parts';
import { SUBPART_LABELS } from './parts';

export interface TentScene {
	setStates(states: Partial<Record<SubPartKey, Severity>>): void;
	setSelected(key: SubPartKey | null): void;
	setXray(on: boolean): void;
	pick(clientX: number, clientY: number): SubPartKey | null;
	resetView(): void;
	resize(): void;
	dispose(): void;
}

// ── Dimensions (schematic meters) ───────────────────────────────────────────
const H = 2.05; // ridge height
const POLE_TOP = 2.35; // in-line poles poke through the ridge
const W = 2.2; // hem half-width
const ZB = -1.6; // back edge
const ZF = 1.6; // front edge (Aussenzelt ends, Vorzelt begins)
const ZV = 3.0; // Vorzelt pole
const VH = 1.55; // Vorzelt pole height
const VW = 1.0; // Vorzelt hem half-width at the pole

// ── Palette ──────────────────────────────────────────────────────────────────
const COL = {
	aussenzelt: 0x9a5148,
	vorzelt: 0xa85f52,
	innenzelt: 0xe9e2d2,
	boden: 0xcfc6b0,
	zipper: 0x55565c,
	aufhaengung: 0xd8d0bc,
	cord: 0xcbb389,
	hook: 0x8a8f98,
	oese: 0xb8bdc6,
	stange: 0x9aa0a8,
	hering: 0x6b6f76,
	ground: 0xe3d3a8
};
const AMBER = new THREE.Color(0xe0a030);
const RED = new THREE.Color(0xc0392b);

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function quadGeo(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
	const g = new THREE.BufferGeometry();
	g.setFromPoints([a, b, c, a, c, d]);
	g.computeVertexNormals();
	return g;
}
function triGeo(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
	const g = new THREE.BufferGeometry();
	g.setFromPoints([a, b, c]);
	g.computeVertexNormals();
	return g;
}
/** Cylinder from a to b (radius r) — used for poles, cords, zipper, loops. */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
	const dir = b.clone().sub(a);
	const geo = new THREE.CylinderGeometry(r, r, dir.length(), 8);
	const mesh = new THREE.Mesh(geo, mat);
	mesh.position.copy(a).addScaledVector(dir, 0.5);
	mesh.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
	return mesh;
}

interface PartEntry {
	group: THREE.Group;
	materials: THREE.MeshLambertMaterial[];
}

export function createTentScene(canvas: HTMLCanvasElement): TentScene {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(42, 4 / 3, 0.1, 60);
	const HOME_POS = V(5.2, 3.0, 5.6);
	const HOME_TARGET = V(0, 0.85, 0.5);
	camera.position.copy(HOME_POS);

	const controls = new OrbitControls(camera, canvas);
	controls.target.copy(HOME_TARGET);
	controls.enableDamping = true;
	controls.enablePan = false;
	controls.minDistance = 3;
	controls.maxDistance = 13;
	controls.maxPolarAngle = Math.PI / 2 - 0.04; // never sink below the ground plane

	scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8272, 1.15));
	const sun = new THREE.DirectionalLight(0xffffff, 0.9);
	sun.position.set(5, 8, 4);
	scene.add(sun);

	const parts = new Map<SubPartKey, PartEntry>();
	const pickables: THREE.Object3D[] = [];
	// Invisible fat hit zones over thin geometry; never tinted, never rendered.
	const proxyMat = new THREE.MeshBasicMaterial({
		transparent: true,
		opacity: 0,
		depthWrite: false,
		colorWrite: false
	});

	function part(key: SubPartKey): PartEntry {
		let e = parts.get(key);
		if (!e) {
			e = { group: new THREE.Group(), materials: [] };
			e.group.userData.subpart = key;
			e.group.name = key;
			scene.add(e.group);
			pickables.push(e.group);
			parts.set(key, e);
		}
		return e;
	}
	function mat(key: SubPartKey, color: number, side?: THREE.Side): THREE.MeshLambertMaterial {
		const m = new THREE.MeshLambertMaterial({ color, transparent: true });
		if (side !== undefined) m.side = side;
		m.userData.base = new THREE.Color(color);
		part(key).materials.push(m);
		return m;
	}
	function addProxy(key: SubPartKey, mesh: THREE.Mesh) {
		mesh.userData.proxy = true;
		part(key).group.add(mesh);
	}

	// ── Ground (not pickable) ──────────────────────────────────────────────────
	const ground = new THREE.Mesh(
		new THREE.CircleGeometry(6.5, 48).rotateX(-Math.PI / 2),
		new THREE.MeshLambertMaterial({ color: COL.ground })
	);
	scene.add(ground);

	// ── Aussenzelt: two roof panels + closed back gable ────────────────────────
	{
		const m = mat('aussenzelt_stoff', COL.aussenzelt, THREE.DoubleSide);
		const g = part('aussenzelt_stoff').group;
		g.add(new THREE.Mesh(quadGeo(V(0, H, ZB), V(0, H, ZF), V(W, 0.05, ZF), V(W, 0.05, ZB)), m));
		g.add(new THREE.Mesh(quadGeo(V(0, H, ZB), V(0, H, ZF), V(-W, 0.05, ZF), V(-W, 0.05, ZB)), m));
		g.add(new THREE.Mesh(triGeo(V(0, H, ZB), V(-W, 0.05, ZB), V(W, 0.05, ZB)), m));
	}

	// ── Vorzelt: separate front sheet in the same plane, ridge dropping to its pole
	{
		const m = mat('vorzelt_stoff', COL.vorzelt, THREE.DoubleSide);
		const g = part('vorzelt_stoff').group;
		const zf = ZF + 0.04; // small gap: it's its own sheet of fabric
		g.add(new THREE.Mesh(quadGeo(V(0, H, zf), V(0, VH, ZV), V(VW, 0.05, ZV), V(W, 0.05, zf)), m));
		g.add(new THREE.Mesh(quadGeo(V(0, H, zf), V(0, VH, ZV), V(-VW, 0.05, ZV), V(-W, 0.05, zf)), m));
	}

	// ── Innenzelt: inset roof + back gable + front gable with zipper, floor ────
	const IH = 1.85; // inner ridge height
	const IW = 1.9;
	const IZB = -1.45;
	const IZF = 1.35;
	{
		const m = mat('innenzelt_stoff', COL.innenzelt, THREE.DoubleSide);
		const g = part('innenzelt_stoff').group;
		g.add(new THREE.Mesh(quadGeo(V(0, IH, IZB), V(0, IH, IZF), V(IW, 0.02, IZF), V(IW, 0.02, IZB)), m));
		g.add(new THREE.Mesh(quadGeo(V(0, IH, IZB), V(0, IH, IZF), V(-IW, 0.02, IZF), V(-IW, 0.02, IZB)), m));
		g.add(new THREE.Mesh(triGeo(V(0, IH, IZB), V(-IW, 0.02, IZB), V(IW, 0.02, IZB)), m));
		g.add(new THREE.Mesh(triGeo(V(0, IH, IZF), V(-IW, 0.02, IZF), V(IW, 0.02, IZF)), m));
	}
	{
		const m = mat('innenzelt_boden', COL.boden, THREE.DoubleSide);
		part('innenzelt_boden').group.add(
			new THREE.Mesh(quadGeo(V(-IW, 0.03, IZB), V(IW, 0.03, IZB), V(IW, 0.03, IZF), V(-IW, 0.03, IZF)), m)
		);
	}
	{
		// Door zipper: up the middle of the front gable, just proud of the fabric.
		const m = mat('innenzelt_reissverschluss', COL.zipper);
		const e = part('innenzelt_reissverschluss');
		e.group.add(tube(V(0, 0.05, IZF + 0.02), V(0, 1.55, IZF + 0.02), 0.02, m));
		addProxy('innenzelt_reissverschluss', tube(V(0, 0.05, IZF + 0.02), V(0, 1.55, IZF + 0.02), 0.09, proxyMat));
	}
	{
		// Aufhängung: loops hanging the inner ridge from the outer ridge.
		const m = mat('innenzelt_aufhaengung', COL.aufhaengung);
		for (const z of [-1.1, -0.35, 0.4, 1.1]) {
			part('innenzelt_aufhaengung').group.add(tube(V(0, IH + 0.005, z), V(0, H - 0.02, z), 0.015, m));
			addProxy('innenzelt_aufhaengung', tube(V(0, IH, z), V(0, H, z), 0.08, proxyMat));
		}
	}
	{
		// 10 connecting cords Innenzelt ↔ Aussenzelt hem, 5 per side.
		const m = mat('innenzelt_schnuere', COL.cord);
		for (const s of [1, -1]) {
			for (const z of [-1.4, -0.7, 0, 0.7, 1.3]) {
				const a = V(s * IW, 0.22, z);
				const b = V(s * (W - 0.02), 0.09, z);
				part('innenzelt_schnuere').group.add(tube(a, b, 0.012, m));
				addProxy('innenzelt_schnuere', tube(a, b, 0.07, proxyMat));
			}
		}
	}

	// ── Hem hardware: eyelet + hook + guy cord + peg per attachment point ──────
	const heringMat = mat('heringe', COL.hering);
	function peg(at: THREE.Vector3, away: THREE.Vector3) {
		const tip = at.clone().add(V(away.x * 0.12, 0.16, away.z * 0.12));
		const base = at.clone().add(V(-away.x * 0.04, -0.06, -away.z * 0.04));
		part('heringe').group.add(tube(base, tip, 0.028, heringMat));
		addProxy('heringe', tube(base, tip, 0.11, proxyMat));
	}
	const hemMats = {
		aussenzelt: {
			cord: mat('aussenzelt_abspannung', COL.cord),
			hook: mat('aussenzelt_haken', COL.hook),
			oese: mat('aussenzelt_oesen', COL.oese)
		},
		vorzelt: {
			cord: mat('vorzelt_abspannung', COL.cord),
			hook: mat('vorzelt_haken', COL.hook),
			oese: mat('vorzelt_oesen', COL.oese)
		}
	} as const;
	function hemPoint(
		fabric: 'aussenzelt' | 'vorzelt',
		hem: THREE.Vector3,
		out: THREE.Vector3, // unit-ish outward direction on the ground plane
		guyLen: number
	) {
		const { cord: cordM, hook: hookM, oese: oeseM } = hemMats[fabric];
		const pegAt = hem.clone().addScaledVector(out, guyLen).setY(0.03);
		// Öse: small ring on the fabric hem.
		const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 12), oeseM);
		ring.position.copy(hem).y += 0.02;
		ring.lookAt(hem.clone().add(out));
		part(`${fabric}_oesen`).group.add(ring);
		const ringProxy = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), proxyMat);
		ringProxy.position.copy(ring.position);
		addProxy(`${fabric}_oesen`, ringProxy);
		// Haken: short metal piece hooked into the Öse, start of the guy.
		const hookEnd = hem.clone().addScaledVector(out, 0.12).setY(hem.y - 0.02);
		part(`${fabric}_haken`).group.add(tube(hem, hookEnd, 0.022, hookM));
		addProxy(`${fabric}_haken`, tube(hem, hookEnd, 0.09, proxyMat));
		// Abspannung: cord from the hook down to the peg.
		part(`${fabric}_abspannung`).group.add(tube(hookEnd, pegAt, 0.012, cordM));
		addProxy(`${fabric}_abspannung`, tube(hookEnd, pegAt, 0.07, proxyMat));
		peg(pegAt, out);
	}

	// Aussenzelt long sides: 5 attachment points per side.
	for (const s of [1, -1]) {
		for (const z of [-1.6, -0.8, 0, 0.8, 1.6]) {
			hemPoint('aussenzelt', V(s * W, 0.1, z), V(s, 0, 0), 0.55);
		}
	}
	// Vorzelt sides: 3 per side along the tapered hem.
	for (const s of [1, -1]) {
		for (const t of [0.25, 0.55, 0.85]) {
			const hem = V(s * (W + (VW - W) * t), 0.08, ZF + (ZV - ZF) * t);
			const out = V(s * 0.76, 0, 0.65).normalize();
			hemPoint('vorzelt', hem, out, 0.5);
		}
	}

	// ── Storm guys at the edge poles + Vorzelt pole guy ────────────────────────
	{
		const cordM = hemMats.aussenzelt.cord;
		// Back pole: guy from the pole top down behind the tent.
		const backPeg = V(0, 0.03, ZB - 1.3);
		part('aussenzelt_abspannung').group.add(tube(V(0, POLE_TOP, ZB), backPeg, 0.012, cordM));
		addProxy('aussenzelt_abspannung', tube(V(0, POLE_TOP, ZB), backPeg, 0.07, proxyMat));
		peg(backPeg, V(0, 0, -1));
		// Front pole: its guy is the ridge cord running over the Vorzelt pole…
		part('aussenzelt_abspannung').group.add(tube(V(0, POLE_TOP, ZF), V(0, VH + 0.03, ZV), 0.012, cordM));
		addProxy('aussenzelt_abspannung', tube(V(0, POLE_TOP, ZF), V(0, VH + 0.03, ZV), 0.07, proxyMat));
	}
	{
		// …continuing from the Vorzelt pole down to the front peg (the Vorzelt's own guy).
		const cordM = hemMats.vorzelt.cord;
		const frontPeg = V(0, 0.03, ZV + 0.75);
		part('vorzelt_abspannung').group.add(tube(V(0, VH, ZV), frontPeg, 0.012, cordM));
		addProxy('vorzelt_abspannung', tube(V(0, VH, ZV), frontPeg, 0.07, proxyMat));
		peg(frontPeg, V(0, 0, 1));
	}

	// ── Stangen: 3 in-line poles poking through the ridge + the Vorzelt pole ───
	{
		const m = mat('stangen', COL.stange);
		for (const z of [ZB, 0, ZF]) {
			part('stangen').group.add(tube(V(0, 0, z), V(0, POLE_TOP, z), 0.035, m));
			addProxy('stangen', tube(V(0, 0, z), V(0, POLE_TOP, z), 0.11, proxyMat));
		}
		part('stangen').group.add(tube(V(0, 0, ZV), V(0, VH, ZV), 0.03, m));
		addProxy('stangen', tube(V(0, 0, ZV), V(0, VH, ZV), 0.11, proxyMat));
	}

	// ── State → material application (idempotent, recomputed from base) ────────
	let states: Partial<Record<SubPartKey, Severity>> = {};
	let selected: SubPartKey | null = null;
	let xray = false;
	const GHOSTABLE = new Set<SubPartKey>(['aussenzelt_stoff', 'vorzelt_stoff']);

	function apply() {
		for (const [key, entry] of parts) {
			const sev = states[key];
			for (const m of entry.materials) {
				m.color.copy(m.userData.base as THREE.Color);
				m.opacity = 1;
				m.emissive.setHex(0x000000);
				m.depthWrite = true;
				if (sev === 'damaged') m.color.lerp(AMBER, 0.65);
				if (sev === 'missing') {
					m.color.lerp(RED, 0.75);
					m.opacity = 0.3;
					m.depthWrite = false;
				}
				if (xray && GHOSTABLE.has(key) && sev !== 'missing') {
					m.opacity = 0.15;
					m.depthWrite = false;
				}
				if (selected === key) {
					m.emissive.setHex(0x353535);
					if (m.opacity < 1) m.opacity = Math.min(m.opacity + 0.15, 1);
				}
			}
		}
		requestRender();
	}

	// ── Render on demand: keep the loop alive only while something moves ───────
	let framesLeft = 0;
	let rafId = 0;
	let disposed = false;
	function frame() {
		rafId = 0;
		if (disposed) return;
		controls.update();
		renderer.render(scene, camera);
		if (--framesLeft > 0) rafId = requestAnimationFrame(frame);
	}
	function requestRender(frames = 45) {
		framesLeft = Math.max(framesLeft, frames); // ~0.75s covers the damping tail
		if (!rafId) rafId = requestAnimationFrame(frame);
	}
	controls.addEventListener('change', () => requestRender());
	controls.addEventListener('start', () => requestRender(120));

	function resize() {
		const w = canvas.clientWidth || 1;
		const h = canvas.clientHeight || 1;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		requestRender(2);
	}
	resize();
	apply();

	// ── Picking ─────────────────────────────────────────────────────────────────
	const raycaster = new THREE.Raycaster();
	const ndc = new THREE.Vector2();
	function subpartOf(obj: THREE.Object3D | null): SubPartKey | null {
		for (let o = obj; o; o = o.parent) {
			if (o.userData.subpart) return o.userData.subpart as SubPartKey;
		}
		return null;
	}
	function pick(clientX: number, clientY: number): SubPartKey | null {
		const rect = canvas.getBoundingClientRect();
		ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
		raycaster.setFromCamera(ndc, camera);
		for (const hit of raycaster.intersectObjects(pickables, true)) {
			const key = subpartOf(hit.object);
			if (!key) continue;
			// In the x-ray view the ghost shells shouldn't swallow taps meant for the interior.
			if (xray && GHOSTABLE.has(key)) continue;
			return key;
		}
		return null;
	}

	return {
		setStates(next) {
			states = next;
			apply();
		},
		setSelected(key) {
			selected = key;
			apply();
		},
		setXray(on) {
			xray = on;
			apply();
		},
		pick,
		resetView() {
			camera.position.copy(HOME_POS);
			controls.target.copy(HOME_TARGET);
			requestRender();
		},
		resize,
		dispose() {
			disposed = true;
			if (rafId) cancelAnimationFrame(rafId);
			controls.dispose();
			scene.traverse((o) => {
				if (o instanceof THREE.Mesh) {
					o.geometry.dispose();
					for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
				}
			});
			renderer.dispose();
		}
	};
}

/** German aria/label for a sub-part — re-exported so UI code can import from one place. */
export function subPartLabel(key: SubPartKey): string {
	return SUBPART_LABELS[key];
}
