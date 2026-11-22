// MeshBatch: builds one big vertex-coloured BufferGeometry out of boxes, frustums, cylinders and
// quads, so a whole district (or a whole car body) is a single draw call.
import * as THREE from '../../vendor/three.module.min.js';

const colorCache = new Map();
const tmpColor = new THREE.Color();

function rgbOf(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    tmpColor.set(hex);
    c = [tmpColor.r, tmpColor.g, tmpColor.b];
    colorCache.set(hex, c);
  }
  return c;
}

export class MeshBatch {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];
    this.count = 0;
    this.ox = 0; this.oy = 0; this.oz = 0;
    this.cos = 1; this.sin = 0;
  }

  /** Every shape added after this is placed at (x, y, z) and turned by rotY. */
  at(x = 0, y = 0, z = 0, rotY = 0) {
    this.ox = x; this.oy = y; this.oz = z;
    this.cos = Math.cos(rotY); this.sin = Math.sin(rotY);
    return this;
  }

  quad(a, b, c, d, color, uv) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.abs(nx) + Math.abs(ny) + Math.abs(nz) < 1e-9) {
      // A triangle passed as a quad (d === a): take the normal from the other corner.
      const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      nx = uy * wz - uz * wy; ny = uz * wx - ux * wz; nz = ux * wy - uy * wx;
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const rnx = nx * this.cos + nz * this.sin, rnz = -nx * this.sin + nz * this.cos;
    const rgb = rgbOf(color);
    const u0 = uv ? uv[0] : 0, v0 = uv ? uv[1] : 0, u1 = uv ? uv[2] : 1, v1 = uv ? uv[3] : 1;
    const corners = [a, b, c, d];
    const cornerUv = [u0, v0, u1, v0, u1, v1, u0, v1];
    for (let k = 0; k < 4; k++) {
      const p = corners[k];
      this.positions.push(this.ox + p[0] * this.cos + p[2] * this.sin, this.oy + p[1], this.oz - p[0] * this.sin + p[2] * this.cos);
      this.normals.push(rnx, ny, rnz);
      this.uvs.push(cornerUv[k * 2], cornerUv[k * 2 + 1]);
      this.colors.push(rgb[0], rgb[1], rgb[2]);
    }
    const i = this.count;
    this.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    this.count += 4;
    return this;
  }

  /** A box whose bottom rectangle and top rectangle may differ (a car cabin, a tower crown). */
  frustum(x0, x1, z0, z1, y0, tx0, tx1, tz0, tz1, y1, color, topColor = color, opts = {}) {
    const tw = opts.tileW, th = opts.tileH;
    const uo = opts.uOffset || 0;
    const sideUv = (len) => (tw ? [uo, y0 / th, uo + len / tw, y1 / th] : undefined);
    if (opts.sides !== false) {
      this.quad([x1, y0, z1], [x1, y0, z0], [tx1, y1, tz0], [tx1, y1, tz1], color, sideUv(z1 - z0));
      this.quad([x0, y0, z0], [x0, y0, z1], [tx0, y1, tz1], [tx0, y1, tz0], color, sideUv(z1 - z0));
      this.quad([x0, y0, z1], [x1, y0, z1], [tx1, y1, tz1], [tx0, y1, tz1], color, sideUv(x1 - x0));
      this.quad([x1, y0, z0], [x0, y0, z0], [tx0, y1, tz0], [tx1, y1, tz0], color, sideUv(x1 - x0));
    }
    if (opts.top !== false) this.quad([tx0, y1, tz1], [tx1, y1, tz1], [tx1, y1, tz0], [tx0, y1, tz0], topColor);
    if (opts.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color);
    return this;
  }

  /** A box centred on (cx, cz) standing on y0. */
  box(cx, y0, cz, sx, sy, sz, color, opts) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    return this.frustum(x0, x1, z0, z1, y0, x0, x1, z0, z1, y0 + sy, color, (opts && opts.topColor) || color, opts);
  }

  /** A flat rectangle facing up, its UVs in world metres so ground textures tile evenly. */
  plane(x0, z0, x1, z1, y, color, tile = 8) {
    return this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], color, [x0 / tile, z1 / tile, x1 / tile, z0 / tile]);
  }

  /** A vertical cylinder or cone; the top may be narrower and shifted (a leaning palm trunk). */
  cylinder(cx, y0, cz, r0, y1, r1, segs, color, tx = cx, tz = cz, capColor = color) {
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2, a1 = ((s + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      this.quad(
        [cx + c1 * r0, y0, cz + s1 * r0], [cx + c0 * r0, y0, cz + s0 * r0],
        [tx + c0 * r1, y1, tz + s0 * r1], [tx + c1 * r1, y1, tz + s1 * r1], color);
      if (r1 > 0.01) this.quad([tx, y1, tz], [tx + c1 * r1, y1, tz + s1 * r1], [tx + c0 * r1, y1, tz + s0 * r1], [tx, y1, tz], capColor);
    }
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  mesh(material, shadows = true) {
    const m = new THREE.Mesh(this.build(), material);
    m.castShadow = shadows;
    m.receiveShadow = true;
    return m;
  }
}
