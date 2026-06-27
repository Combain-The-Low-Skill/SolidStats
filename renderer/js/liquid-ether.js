/**
 * Liquid Ether — vanilla JS port (from reactbits.dev)
 * Colours: #2ED9A0, #1FC98A (our palette)
 */
(function () {
  const container = document.querySelector('.w-left');
  if (!container) return;

  // ── Config ──────────────────────────────────────────────────────────────
  const CONFIG = {
    colors:              ['#2ED9A0', '#1FC98A', '#2ED9A0'],
    mouseForce:          20,
    cursorSize:          120,
    resolution:          0.5,
    dt:                  0.014,
    BFECC:               true,
    isViscous:           false,
    viscous:             30,
    iterationsViscous:   32,
    iterationsPoisson:   32,
    isBounce:            false,
    autoDemo:            true,
    autoSpeed:           0.4,
    autoIntensity:       2.2,
    takeoverDuration:    0.25,
    autoResumeDelay:     1000,
    autoRampDuration:    0.6,
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  let rafId = null;
  let isVisible = true;
  const isVisibleRef = { current: true };

  function makePaletteTexture(stops) {
    let arr = (Array.isArray(stops) && stops.length) ? stops : ['#ffffff', '#ffffff'];
    if (arr.length === 1) arr = [arr[0], arr[0]];
    const w = arr.length;
    const data = new Uint8Array(w * 4);
    for (let i = 0; i < w; i++) {
      const c = new THREE.Color(arr[i]);
      data[i * 4]     = Math.round(c.r * 255);
      data[i * 4 + 1] = Math.round(c.g * 255);
      data[i * 4 + 2] = Math.round(c.b * 255);
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, w, 1, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  const paletteTex = makePaletteTexture(CONFIG.colors);
  const bgVec4 = new THREE.Vector4(0, 0, 0, 0);

  // ── Shaders ──────────────────────────────────────────────────────────────
  const face_vert = `
    attribute vec3 position;
    uniform vec2 px;
    uniform vec2 boundarySpace;
    varying vec2 uv;
    precision highp float;
    void main(){
      vec3 pos = position;
      vec2 scale = 1.0 - boundarySpace * 2.0;
      pos.xy = pos.xy * scale;
      uv = vec2(0.5) + pos.xy * 0.5;
      gl_Position = vec4(pos, 1.0);
    }`;
  const line_vert = `
    attribute vec3 position;
    uniform vec2 px;
    precision highp float;
    varying vec2 uv;
    void main(){
      vec3 pos = position;
      uv = 0.5 + pos.xy * 0.5;
      vec2 n = sign(pos.xy);
      pos.xy = abs(pos.xy) - px * 1.0;
      pos.xy *= n;
      gl_Position = vec4(pos, 1.0);
    }`;
  const mouse_vert = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    uniform vec2 center;
    uniform vec2 scale;
    uniform vec2 px;
    varying vec2 vUv;
    void main(){
      vec2 pos = position.xy * scale * 2.0 * px + center;
      vUv = uv;
      gl_Position = vec4(pos, 0.0, 1.0);
    }`;
  const advection_frag = `
    precision highp float;
    uniform sampler2D velocity;
    uniform float dt;
    uniform bool isBFECC;
    uniform vec2 fboSize;
    uniform vec2 px;
    varying vec2 uv;
    void main(){
      vec2 ratio = max(fboSize.x, fboSize.y) / fboSize;
      if(isBFECC == false){
        vec2 vel = texture2D(velocity, uv).xy;
        vec2 uv2 = uv - vel * dt * ratio;
        vec2 newVel = texture2D(velocity, uv2).xy;
        gl_FragColor = vec4(newVel, 0.0, 0.0);
      } else {
        vec2 spot_new = uv;
        vec2 vel_old = texture2D(velocity, uv).xy;
        vec2 spot_old = spot_new - vel_old * dt * ratio;
        vec2 vel_new1 = texture2D(velocity, spot_old).xy;
        vec2 spot_new2 = spot_old + vel_new1 * dt * ratio;
        vec2 error = spot_new2 - spot_new;
        vec2 spot_new3 = spot_new - error / 2.0;
        vec2 vel_2 = texture2D(velocity, spot_new3).xy;
        vec2 spot_old2 = spot_new3 - vel_2 * dt * ratio;
        vec2 newVel2 = texture2D(velocity, spot_old2).xy;
        gl_FragColor = vec4(newVel2, 0.0, 0.0);
      }
    }`;
  const color_frag = `
    precision highp float;
    uniform sampler2D velocity;
    uniform sampler2D palette;
    uniform vec4 bgColor;
    varying vec2 uv;
    void main(){
      vec2 vel = texture2D(velocity, uv).xy;
      float lenv = clamp(length(vel), 0.0, 1.0);
      vec3 c = texture2D(palette, vec2(lenv, 0.5)).rgb;
      vec3 outRGB = mix(bgColor.rgb, c, lenv);
      float outA = mix(bgColor.a, 1.0, lenv);
      gl_FragColor = vec4(outRGB, outA);
    }`;
  const divergence_frag = `
    precision highp float;
    uniform sampler2D velocity;
    uniform float dt;
    uniform vec2 px;
    varying vec2 uv;
    void main(){
      float x0 = texture2D(velocity, uv-vec2(px.x,0.0)).x;
      float x1 = texture2D(velocity, uv+vec2(px.x,0.0)).x;
      float y0 = texture2D(velocity, uv-vec2(0.0,px.y)).y;
      float y1 = texture2D(velocity, uv+vec2(0.0,px.y)).y;
      float divergence = (x1-x0+y1-y0)/2.0;
      gl_FragColor = vec4(divergence/dt);
    }`;
  const externalForce_frag = `
    precision highp float;
    uniform vec2 force;
    uniform vec2 center;
    uniform vec2 scale;
    uniform vec2 px;
    varying vec2 vUv;
    void main(){
      vec2 circle = (vUv - 0.5) * 2.0;
      float d = 1.0 - min(length(circle), 1.0);
      d *= d;
      gl_FragColor = vec4(force * d, 0.0, 1.0);
    }`;
  const poisson_frag = `
    precision highp float;
    uniform sampler2D pressure;
    uniform sampler2D divergence;
    uniform vec2 px;
    varying vec2 uv;
    void main(){
      float p0 = texture2D(pressure, uv+vec2(px.x*2.0,0.0)).r;
      float p1 = texture2D(pressure, uv-vec2(px.x*2.0,0.0)).r;
      float p2 = texture2D(pressure, uv+vec2(0.0,px.y*2.0)).r;
      float p3 = texture2D(pressure, uv-vec2(0.0,px.y*2.0)).r;
      float div = texture2D(divergence, uv).r;
      float newP = (p0+p1+p2+p3)/4.0 - div;
      gl_FragColor = vec4(newP);
    }`;
  const pressure_frag = `
    precision highp float;
    uniform sampler2D pressure;
    uniform sampler2D velocity;
    uniform vec2 px;
    uniform float dt;
    varying vec2 uv;
    void main(){
      float p0 = texture2D(pressure, uv+vec2(px.x,0.0)).r;
      float p1 = texture2D(pressure, uv-vec2(px.x,0.0)).r;
      float p2 = texture2D(pressure, uv+vec2(0.0,px.y)).r;
      float p3 = texture2D(pressure, uv-vec2(0.0,px.y)).r;
      vec2 v = texture2D(velocity, uv).xy;
      vec2 gradP = vec2(p0-p1, p2-p3)*0.5;
      v = v - gradP*dt;
      gl_FragColor = vec4(v, 0.0, 1.0);
    }`;
  const viscous_frag = `
    precision highp float;
    uniform sampler2D velocity;
    uniform sampler2D velocity_new;
    uniform float v;
    uniform vec2 px;
    uniform float dt;
    varying vec2 uv;
    void main(){
      vec2 old  = texture2D(velocity, uv).xy;
      vec2 new0 = texture2D(velocity_new, uv+vec2(px.x*2.0,0.0)).xy;
      vec2 new1 = texture2D(velocity_new, uv-vec2(px.x*2.0,0.0)).xy;
      vec2 new2 = texture2D(velocity_new, uv+vec2(0.0,px.y*2.0)).xy;
      vec2 new3 = texture2D(velocity_new, uv-vec2(0.0,px.y*2.0)).xy;
      vec2 newv = 4.0*old + v*dt*(new0+new1+new2+new3);
      newv /= 4.0*(1.0 + v*dt);
      gl_FragColor = vec4(newv, 0.0, 0.0);
    }`;

  // ── Common ───────────────────────────────────────────────────────────────
  const Common = {
    width: 0, height: 0, aspect: 1, pixelRatio: 1,
    renderer: null, clock: null, container: null,
    init(el) {
      this.container = el;
      this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      this.resize();
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.autoClear = false;
      this.renderer.setClearColor(new THREE.Color(0x000000), 0);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(this.width, this.height);
      this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;';
      this.clock = new THREE.Clock();
      this.clock.start();
    },
    resize() {
      if (!this.container) return;
      const r = this.container.getBoundingClientRect();
      this.width  = Math.max(1, Math.floor(r.width));
      this.height = Math.max(1, Math.floor(r.height));
      this.aspect = this.width / this.height;
      if (this.renderer) this.renderer.setSize(this.width, this.height, false);
    },
    update() { this.clock.getDelta(); }
  };

  // ── Mouse ─────────────────────────────────────────────────────────────────
  const Mouse = {
    mouseMoved: false,
    coords: new THREE.Vector2(),
    coords_old: new THREE.Vector2(),
    diff: new THREE.Vector2(),
    timer: null,
    container: null,
    isHoverInside: false,
    hasUserControl: false,
    isAutoActive: false,
    autoIntensity: 2.0,
    takeoverActive: false,
    takeoverStartTime: 0,
    takeoverDuration: 0.25,
    takeoverFrom: new THREE.Vector2(),
    takeoverTo: new THREE.Vector2(),
    onInteract: null,
    init(el) {
      this.container = el;
      this._mm = this._onMouseMove.bind(this);
      this._ml = this._onLeave.bind(this);
      window.addEventListener('mousemove', this._mm);
      document.addEventListener('mouseleave', this._ml);
    },
    dispose() {
      window.removeEventListener('mousemove', this._mm);
      document.removeEventListener('mouseleave', this._ml);
    },
    isPointInside(cx, cy) {
      if (!this.container) return false;
      const r = this.container.getBoundingClientRect();
      return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    },
    setCoords(x, y) {
      if (!this.container) return;
      if (this.timer) clearTimeout(this.timer);
      const r = this.container.getBoundingClientRect();
      const nx = (x - r.left) / r.width;
      const ny = (y - r.top)  / r.height;
      this.coords.set(nx * 2 - 1, -(ny * 2 - 1));
      this.mouseMoved = true;
      this.timer = setTimeout(() => { this.mouseMoved = false; }, 100);
    },
    setNormalized(nx, ny) {
      this.coords.set(nx, ny);
      this.mouseMoved = true;
    },
    _onMouseMove(e) {
      if (!this.isPointInside(e.clientX, e.clientY)) {
        this.isHoverInside = false;
        return;
      }
      this.isHoverInside = true;
      if (this.onInteract) this.onInteract();
      if (this.isAutoActive && !this.hasUserControl && !this.takeoverActive) {
        const r = this.container.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width;
        const ny = (e.clientY - r.top)  / r.height;
        this.takeoverFrom.copy(this.coords);
        this.takeoverTo.set(nx * 2 - 1, -(ny * 2 - 1));
        this.takeoverStartTime = performance.now();
        this.takeoverActive = true;
        this.hasUserControl = true;
        this.isAutoActive = false;
        return;
      }
      this.setCoords(e.clientX, e.clientY);
      this.hasUserControl = true;
    },
    _onLeave() { this.isHoverInside = false; },
    update() {
      if (this.takeoverActive) {
        const t = (performance.now() - this.takeoverStartTime) / (this.takeoverDuration * 1000);
        if (t >= 1) {
          this.takeoverActive = false;
          this.coords.copy(this.takeoverTo);
          this.coords_old.copy(this.coords);
          this.diff.set(0, 0);
        } else {
          const k = t * t * (3 - 2 * t);
          this.coords.copy(this.takeoverFrom).lerp(this.takeoverTo, k);
        }
      }
      this.diff.subVectors(this.coords, this.coords_old);
      this.coords_old.copy(this.coords);
      if (this.coords_old.x === 0 && this.coords_old.y === 0) this.diff.set(0, 0);
      if (this.isAutoActive && !this.takeoverActive) this.diff.multiplyScalar(this.autoIntensity);
    }
  };

  // ── AutoDriver ────────────────────────────────────────────────────────────
  class AutoDriver {
    constructor(mouse, manager, opts) {
      this.mouse = mouse;
      this.manager = manager;
      this.enabled = opts.enabled;
      this.speed = opts.speed;
      this.resumeDelay = opts.resumeDelay || 3000;
      this.rampDurationMs = (opts.rampDuration || 0) * 1000;
      this.active = false;
      this.current = new THREE.Vector2(0, 0);
      this.target  = new THREE.Vector2();
      this.lastTime = performance.now();
      this.activationTime = 0;
      this.margin = 0.2;
      this._tmp = new THREE.Vector2();
      this.pickNewTarget();
    }
    pickNewTarget() {
      const m = this.margin;
      this.target.set((Math.random() * 2 - 1) * (1 - m), (Math.random() * 2 - 1) * (1 - m));
    }
    forceStop() { this.active = false; this.mouse.isAutoActive = false; }
    update() {
      if (!this.enabled) return;
      const now = performance.now();
      const idle = now - this.manager.lastUserInteraction;
      if (idle < this.resumeDelay) { if (this.active) this.forceStop(); return; }
      if (this.mouse.isHoverInside) { if (this.active) this.forceStop(); return; }
      if (!this.active) {
        this.active = true;
        this.current.copy(this.mouse.coords);
        this.lastTime = now;
        this.activationTime = now;
      }
      this.mouse.isAutoActive = true;
      let dt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      if (dt > 0.2) dt = 0.016;
      const dir = this._tmp.subVectors(this.target, this.current);
      const dist = dir.length();
      if (dist < 0.01) { this.pickNewTarget(); return; }
      dir.normalize();
      let ramp = 1;
      if (this.rampDurationMs > 0) {
        const t = Math.min(1, (now - this.activationTime) / this.rampDurationMs);
        ramp = t * t * (3 - 2 * t);
      }
      const move = Math.min(this.speed * dt * ramp, dist);
      this.current.addScaledVector(dir, move);
      this.mouse.setNormalized(this.current.x, this.current.y);
    }
  }

  // ── ShaderPass ────────────────────────────────────────────────────────────
  class ShaderPass {
    constructor(props) {
      this.props = props || {};
      this.uniforms = this.props.material?.uniforms;
      this.scene = null; this.camera = null;
    }
    init() {
      this.scene  = new THREE.Scene();
      this.camera = new THREE.Camera();
      if (this.uniforms) {
        const mat = new THREE.RawShaderMaterial(this.props.material);
        const geo = new THREE.PlaneGeometry(2, 2);
        this.scene.add(new THREE.Mesh(geo, mat));
      }
    }
    update() {
      Common.renderer.setRenderTarget(this.props.output || null);
      Common.renderer.render(this.scene, this.camera);
      Common.renderer.setRenderTarget(null);
    }
  }

  class Advection extends ShaderPass {
    constructor(p) {
      super({ material: { vertexShader: face_vert, fragmentShader: advection_frag,
        uniforms: { boundarySpace:{value:p.cellScale}, px:{value:p.cellScale},
          fboSize:{value:p.fboSize}, velocity:{value:p.src.texture},
          dt:{value:p.dt}, isBFECC:{value:true} } }, output: p.dst });
      this.uniforms = this.props.material.uniforms;
      this.init();
      // boundary lines
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(
        [-1,-1,0,-1,1,0,-1,1,0,1,1,0,1,1,0,1,-1,0,1,-1,0,-1,-1,0]), 3));
      this.line = new THREE.LineSegments(bg,
        new THREE.RawShaderMaterial({ vertexShader:line_vert, fragmentShader:advection_frag, uniforms:this.uniforms }));
      this.scene.add(this.line);
    }
    update({ dt, isBounce, BFECC }) {
      this.uniforms.dt.value = dt;
      this.line.visible = isBounce;
      this.uniforms.isBFECC.value = BFECC;
      super.update();
    }
  }

  class ExternalForce extends ShaderPass {
    constructor(p) {
      super({ output: p.dst });
      super.init();
      const mat = new THREE.RawShaderMaterial({ vertexShader: mouse_vert,
        fragmentShader: externalForce_frag, blending: THREE.AdditiveBlending,
        depthWrite: false, uniforms: { px:{value:p.cellScale},
          force:{value:new THREE.Vector2()}, center:{value:new THREE.Vector2()},
          scale:{value:new THREE.Vector2(p.cursor_size, p.cursor_size)} } });
      this.mouse = new THREE.Mesh(new THREE.PlaneGeometry(1,1), mat);
      this.scene.add(this.mouse);
    }
    update(p) {
      const u = this.mouse.material.uniforms;
      const fx = (Mouse.diff.x / 2) * p.mouse_force;
      const fy = (Mouse.diff.y / 2) * p.mouse_force;
      const sx = p.cursor_size * p.cellScale.x;
      const sy = p.cursor_size * p.cellScale.y;
      u.force.value.set(fx, fy);
      u.center.value.set(
        Math.min(Math.max(Mouse.coords.x, -1+sx+p.cellScale.x*2), 1-sx-p.cellScale.x*2),
        Math.min(Math.max(Mouse.coords.y, -1+sy+p.cellScale.y*2), 1-sy-p.cellScale.y*2));
      u.scale.value.set(p.cursor_size, p.cursor_size);
      super.update();
    }
  }

  class Viscous extends ShaderPass {
    constructor(p) {
      super({ material: { vertexShader:face_vert, fragmentShader:viscous_frag,
        uniforms:{ boundarySpace:{value:p.boundarySpace}, velocity:{value:p.src.texture},
          velocity_new:{value:p.dst_.texture}, v:{value:p.viscous},
          px:{value:p.cellScale}, dt:{value:p.dt} } },
        output:p.dst, output0:p.dst_, output1:p.dst });
      this.init();
    }
    update({ viscous, iterations, dt }) {
      this.uniforms.v.value = viscous;
      let fin, fout;
      for (let i = 0; i < iterations; i++) {
        fin  = i%2===0 ? this.props.output0 : this.props.output1;
        fout = i%2===0 ? this.props.output1 : this.props.output0;
        this.uniforms.velocity_new.value = fin.texture;
        this.props.output = fout;
        this.uniforms.dt.value = dt;
        super.update();
      }
      return fout;
    }
  }

  class Divergence extends ShaderPass {
    constructor(p) {
      super({ material:{ vertexShader:face_vert, fragmentShader:divergence_frag,
        uniforms:{ boundarySpace:{value:p.boundarySpace}, velocity:{value:p.src.texture},
          px:{value:p.cellScale}, dt:{value:p.dt} } }, output:p.dst });
      this.init();
    }
    update({ vel }) { this.uniforms.velocity.value = vel.texture; super.update(); }
  }

  class Poisson extends ShaderPass {
    constructor(p) {
      super({ material:{ vertexShader:face_vert, fragmentShader:poisson_frag,
        uniforms:{ boundarySpace:{value:p.boundarySpace}, pressure:{value:p.dst_.texture},
          divergence:{value:p.src.texture}, px:{value:p.cellScale} } },
        output:p.dst, output0:p.dst_, output1:p.dst });
      this.init();
    }
    update({ iterations }) {
      let pin, pout;
      for (let i = 0; i < iterations; i++) {
        pin  = i%2===0 ? this.props.output0 : this.props.output1;
        pout = i%2===0 ? this.props.output1 : this.props.output0;
        this.uniforms.pressure.value = pin.texture;
        this.props.output = pout;
        super.update();
      }
      return pout;
    }
  }

  class Pressure extends ShaderPass {
    constructor(p) {
      super({ material:{ vertexShader:face_vert, fragmentShader:pressure_frag,
        uniforms:{ boundarySpace:{value:p.boundarySpace}, pressure:{value:p.src_p.texture},
          velocity:{value:p.src_v.texture}, px:{value:p.cellScale}, dt:{value:p.dt} } },
        output:p.dst });
      this.init();
    }
    update({ vel, pressure }) {
      this.uniforms.velocity.value = vel.texture;
      this.uniforms.pressure.value = pressure.texture;
      super.update();
    }
  }

  // ── Simulation ────────────────────────────────────────────────────────────
  class Simulation {
    constructor(opts) {
      this.options = { iterations_poisson:32, iterations_viscous:32, mouse_force:20,
        resolution:0.5, cursor_size:100, viscous:30, isBounce:false, dt:0.014,
        isViscous:false, BFECC:true, ...opts };
      this.fboSize = new THREE.Vector2();
      this.cellScale = new THREE.Vector2();
      this.boundarySpace = new THREE.Vector2();
      this.fbos = {};
      this.init();
    }
    getFloatType() {
      return /iPad|iPhone|iPod/i.test(navigator.userAgent) ? THREE.HalfFloatType : THREE.FloatType;
    }
    init() {
      this.calcSize();
      const type = this.getFloatType();
      const opts = { type, depthBuffer:false, stencilBuffer:false,
        minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
        wrapS:THREE.ClampToEdgeWrapping, wrapT:THREE.ClampToEdgeWrapping };
      ['vel_0','vel_1','vel_viscous0','vel_viscous1','div','pressure_0','pressure_1'].forEach(k => {
        this.fbos[k] = new THREE.WebGLRenderTarget(this.fboSize.x, this.fboSize.y, opts);
      });
      this.advection    = new Advection({ cellScale:this.cellScale, fboSize:this.fboSize, dt:this.options.dt, src:this.fbos.vel_0, dst:this.fbos.vel_1 });
      this.externalForce= new ExternalForce({ cellScale:this.cellScale, cursor_size:this.options.cursor_size, dst:this.fbos.vel_1 });
      this.viscous      = new Viscous({ cellScale:this.cellScale, boundarySpace:this.boundarySpace, viscous:this.options.viscous, src:this.fbos.vel_1, dst:this.fbos.vel_viscous1, dst_:this.fbos.vel_viscous0, dt:this.options.dt });
      this.divergence   = new Divergence({ cellScale:this.cellScale, boundarySpace:this.boundarySpace, src:this.fbos.vel_viscous0, dst:this.fbos.div, dt:this.options.dt });
      this.poisson      = new Poisson({ cellScale:this.cellScale, boundarySpace:this.boundarySpace, src:this.fbos.div, dst:this.fbos.pressure_1, dst_:this.fbos.pressure_0 });
      this.pressure     = new Pressure({ cellScale:this.cellScale, boundarySpace:this.boundarySpace, src_p:this.fbos.pressure_0, src_v:this.fbos.vel_viscous0, dst:this.fbos.vel_0, dt:this.options.dt });
    }
    calcSize() {
      const w = Math.max(1, Math.round(this.options.resolution * Common.width));
      const h = Math.max(1, Math.round(this.options.resolution * Common.height));
      this.cellScale.set(1/w, 1/h);
      this.fboSize.set(w, h);
    }
    resize() {
      this.calcSize();
      Object.values(this.fbos).forEach(f => f.setSize(this.fboSize.x, this.fboSize.y));
    }
    update() {
      const o = this.options;
      this.boundarySpace[o.isBounce ? 'set' : 'copy'](o.isBounce ? new THREE.Vector2() : this.cellScale, o.isBounce ? 0 : undefined);
      if (o.isBounce) this.boundarySpace.set(0,0); else this.boundarySpace.copy(this.cellScale);
      this.advection.update({ dt:o.dt, isBounce:o.isBounce, BFECC:o.BFECC });
      this.externalForce.update({ cursor_size:o.cursor_size, mouse_force:o.mouse_force, cellScale:this.cellScale });
      let vel = this.fbos.vel_1;
      if (o.isViscous) vel = this.viscous.update({ viscous:o.viscous, iterations:o.iterations_viscous, dt:o.dt });
      this.divergence.update({ vel });
      const pressure = this.poisson.update({ iterations:o.iterations_poisson });
      this.pressure.update({ vel, pressure });
    }
  }

  // ── Output + WebGLManager ─────────────────────────────────────────────────
  class Output {
    constructor() {
      this.sim = new Simulation({
        mouse_force: CONFIG.mouseForce,
        cursor_size: CONFIG.cursorSize,
        resolution:  CONFIG.resolution,
        dt:          CONFIG.dt,
        BFECC:       CONFIG.BFECC,
        isViscous:   CONFIG.isViscous,
        viscous:     CONFIG.viscous,
        iterations_viscous:  CONFIG.iterationsViscous,
        iterations_poisson:  CONFIG.iterationsPoisson,
        isBounce:    CONFIG.isBounce,
      });
      this.scene  = new THREE.Scene();
      this.camera = new THREE.Camera();
      this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2,2),
        new THREE.RawShaderMaterial({ vertexShader:face_vert, fragmentShader:color_frag,
          transparent:true, depthWrite:false,
          uniforms:{ velocity:{value:this.sim.fbos.vel_0.texture},
            boundarySpace:{value:new THREE.Vector2()},
            palette:{value:paletteTex}, bgColor:{value:bgVec4} } }));
      this.scene.add(this.mesh);
    }
    resize() { this.sim.resize(); }
    update() {
      this.sim.update();
      Common.renderer.setRenderTarget(null);
      Common.renderer.render(this.scene, this.camera);
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  Common.init(container);
  container.prepend(Common.renderer.domElement);

  Mouse.init(container);
  Mouse.autoIntensity = CONFIG.autoIntensity;
  Mouse.takeoverDuration = CONFIG.takeoverDuration;

  const manager = { lastUserInteraction: performance.now() };
  Mouse.onInteract = () => { manager.lastUserInteraction = performance.now(); };

  const autoDriver = new AutoDriver(Mouse, manager, {
    enabled:      CONFIG.autoDemo,
    speed:        CONFIG.autoSpeed,
    resumeDelay:  CONFIG.autoResumeDelay,
    rampDuration: CONFIG.autoRampDuration,
  });

  const output = new Output();

  let running = false;
  function loop() {
    if (!running) return;
    autoDriver.update();
    Mouse.update();
    Common.update();
    output.update();
    rafId = requestAnimationFrame(loop);
  }
  function start() { if (running) return; running = true; loop(); }
  function pause() { running = false; if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  // Resize
  let resizeRaf = null;
  const ro = new ResizeObserver(() => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => { Common.resize(); output.resize(); });
  });
  ro.observe(container);

  // Pause when hidden
  const io = new IntersectionObserver(entries => {
    isVisibleRef.current = entries[0].isIntersecting;
    isVisibleRef.current && !document.hidden ? start() : pause();
  }, { threshold: [0, 0.01] });
  io.observe(container);

  document.addEventListener('visibilitychange', () => {
    document.hidden ? pause() : (isVisibleRef.current && start());
  });

  // Экспортируем управление для AnimMode
  window.LiquidEther = {
    start() { start(); },
    pause() { pause(); },
    setVisible(v) {
      if (Common.renderer && Common.renderer.domElement) {
        Common.renderer.domElement.style.display = v ? '' : 'none';
      }
      v ? start() : pause();
    }
  };

  // Запускаем только в rich-режиме
  if (typeof AnimMode === 'undefined' || AnimMode.isRich()) {
    start();
  } else {
    if (Common.renderer && Common.renderer.domElement) {
      Common.renderer.domElement.style.display = 'none';
    }
  }
})();
