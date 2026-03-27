import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import * as dat from 'dat.gui';

// ============ PARTICLE CONFIGURATION ============
const WIDTH = 512;
const PARTICLES = WIDTH * WIDTH;

// ============ GUI PARAMETERS ============
const params = {
  // Simulation
  forceLimit: 0.1,     // Maximum attraction force
  forceStrength: 0.01, // Force multiplier by distance
  swirlStrength: 0.02, // Lateral swirl force
  damping: 0.98,       // Viscosity (lower value = faster deceleration)

  // Visual
  particleSize: 50.0,
  alphaBase: 0.3,
  colorSlow: '#00ccff', // Equivalent to vec3(0.0, 0.8, 1.0)
  colorFast: '#ff00cc', // Equivalent to vec3(1.0, 0.0, 0.8)

  // Bloom
  bloomStrength: 0.8,
  bloomRadius: 0.2,
  bloomThreshold: 0.1,

  // Actions
  restart: () => initSimulation()
};

// ============ BASIC SETUP ============
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020108);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 50, 150);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// ============ POST-PROCESSING ============
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  params.bloomStrength,
  params.bloomRadius,
  params.bloomThreshold
);
composer.addPass(bloomPass);

// ============ 1. SHADERS (With Uniforms) ============
const computeVelocityShader = `
    uniform vec3 uMousePos;
    uniform float uForceLimit;
    uniform float uForceStrength;
    uniform float uSwirlStrength;
    uniform float uDamping;
    
    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 pos = texture2D(texturePosition, uv);
        vec4 vel = texture2D(textureVelocity, uv);
        
        vec3 dir = uMousePos - pos.xyz;
        float dist = length(dir);
        
        vec3 force = normalize(dir) * min(uForceLimit, dist * uForceStrength);
        vec3 swirlDir = cross(normalize(dir), vec3(0.0, 1.0, 0.0));
        vec3 swirl = swirlDir * max(0.0, (1.0 - dist * uSwirlStrength)); 
        
        vel.xyz = (vel.xyz + force + swirl) * uDamping;
        
        gl_FragColor = vec4(vel.xyz, 1.0);
    }
`;

const computePositionShader = `
    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 pos = texture2D(texturePosition, uv);
        vec4 vel = texture2D(textureVelocity, uv);
        
        pos.xyz += vel.xyz;
        gl_FragColor = vec4(pos.xyz, 1.0);
    }
`;

const particleVertexShader = `
    uniform sampler2D texturePosition;
    uniform sampler2D textureVelocity;
    uniform float uParticleSize;
    
    attribute vec2 reference;
    varying vec2 vUv;
    varying float vSpeed;
    
    void main() {
        vUv = reference;
        
        vec3 pos = texture2D(texturePosition, reference).xyz;
        vec3 vel = texture2D(textureVelocity, reference).xyz; 
        
        vSpeed = length(vel); 
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        gl_PointSize = (uParticleSize / -mvPosition.z);
    }
`;

const particleFragmentShader = `
    varying float vSpeed;
    
    uniform vec3 uColorSlow;
    uniform vec3 uColorFast;
    uniform float uAlphaBase;
    
    void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        
        float speedRatio = smoothstep(2.0, 25.0, vSpeed); 
        vec3 finalColor = mix(uColorSlow, uColorFast, speedRatio);
        
        float alpha = (0.5 - dist) * 2.0; 
        
        gl_FragColor = vec4(finalColor, alpha * uAlphaBase);
    }
`;

// ============ 2. DYNAMIC INITIALIZATION ============
let gpuCompute, velocityVariable, positionVariable, particleSystem, material;

function initSimulation() {
  if (particleSystem) {
    scene.remove(particleSystem);
    particleSystem.geometry.dispose();
    particleSystem.material.dispose();
  }

  gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
  const dtPosition = gpuCompute.createTexture();
  const dtVelocity = gpuCompute.createTexture();
  const posArray = dtPosition.image.data;
  const velArray = dtVelocity.image.data;

  for (let i = 0; i < posArray.length; i += 4) {
    posArray[i + 0] = (Math.random() - 0.5) * 200;
    posArray[i + 1] = (Math.random() - 0.5) * 200;
    posArray[i + 2] = (Math.random() - 0.5) * 200;
    posArray[i + 3] = 1;
    velArray[i + 0] = 0; velArray[i + 1] = 0; velArray[i + 2] = 0; velArray[i + 3] = 1;
  }

  velocityVariable = gpuCompute.addVariable('textureVelocity', computeVelocityShader, dtVelocity);
  positionVariable = gpuCompute.addVariable('texturePosition', computePositionShader, dtPosition);

  gpuCompute.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);
  gpuCompute.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);

  const velUniforms = velocityVariable.material.uniforms;
  velUniforms['uMousePos'] = { value: new THREE.Vector3(0, 0, 0) };
  velUniforms['uForceLimit'] = { value: params.forceLimit };
  velUniforms['uForceStrength'] = { value: params.forceStrength };
  velUniforms['uSwirlStrength'] = { value: params.swirlStrength };
  velUniforms['uDamping'] = { value: params.damping };

  const error = gpuCompute.init();
  if (error !== null) console.error(error);

  const geometry = new THREE.BufferGeometry();
  const references = new Float32Array(PARTICLES * 2);

  for (let i = 0; i < PARTICLES; i++) {
    const x = (i % WIDTH) / WIDTH;
    const y = Math.floor(i / WIDTH) / WIDTH;
    references[i * 2] = x;
    references[i * 2 + 1] = y;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3));
  geometry.setAttribute('reference', new THREE.BufferAttribute(references, 2));

  material = new THREE.ShaderMaterial({
    uniforms: {
      texturePosition: { value: null },
      textureVelocity: { value: null },
      uParticleSize: { value: params.particleSize },
      uAlphaBase: { value: params.alphaBase },
      uColorSlow: { value: new THREE.Color(params.colorSlow) },
      uColorFast: { value: new THREE.Color(params.colorFast) }
    },
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  particleSystem = new THREE.Points(geometry, material);
  scene.add(particleSystem);
}

// Initialize for the first time
initSimulation();

// ============ 3. GUI PANEL ============
const gui = new dat.GUI({ width: 320 });

const folderFisica = gui.addFolder('Physics & Attraction');
folderFisica.add(params, 'forceStrength', 0.001, 0.05).name('Acceleration (Pull)');
folderFisica.add(params, 'forceLimit', 0.01, 0.5).name('Force Limit');
folderFisica.add(params, 'swirlStrength', 0.0, 0.1).name('Lateral Swirl');
folderFisica.add(params, 'damping', 0.8, 1.0).name('Viscosity (Inertia)');
folderFisica.open();

const folderVisual = gui.addFolder('Particle Visuals');
folderVisual.add(params, 'particleSize', 10.0, 200.0).name('Size');
folderVisual.add(params, 'alphaBase', 0.05, 1.0).name('Base Alpha');
folderVisual.addColor(params, 'colorSlow').name('Slow Color');
folderVisual.addColor(params, 'colorFast').name('Fast Color');
folderVisual.open();

const folderBloom = gui.addFolder('Bloom (Glow)');
folderBloom.add(params, 'bloomStrength', 0.0, 3.0).name('Strength').onChange(v => bloomPass.strength = v);
folderBloom.add(params, 'bloomRadius', 0.0, 1.0).name('Dispersion Radius').onChange(v => bloomPass.radius = v);
folderBloom.add(params, 'bloomThreshold', 0.0, 1.0).name('Cutoff Threshold').onChange(v => bloomPass.threshold = v);
folderBloom.open();

gui.add(params, 'restart').name('↻ Restart Positions');

// ============ 4. INTERACTION & RENDER ============
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const invisiblePlane = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshBasicMaterial({ visible: false }));
scene.add(invisiblePlane);

window.addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(invisiblePlane);

  if (intersects.length > 0 && velocityVariable) {
    velocityVariable.material.uniforms.uMousePos.value.copy(intersects[0].point);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();

  if (velocityVariable) {
    const vUni = velocityVariable.material.uniforms;
    vUni.uForceLimit.value = params.forceLimit;
    vUni.uForceStrength.value = params.forceStrength;
    vUni.uSwirlStrength.value = params.swirlStrength;
    vUni.uDamping.value = params.damping;
  }

  gpuCompute.compute();

  if (material) {
    const mUni = material.uniforms;
    mUni.texturePosition.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture;
    mUni.textureVelocity.value = gpuCompute.getCurrentRenderTarget(velocityVariable).texture;

    mUni.uParticleSize.value = params.particleSize;
    mUni.uAlphaBase.value = params.alphaBase;
    mUni.uColorSlow.value.set(params.colorSlow);
    mUni.uColorFast.value.set(params.colorFast);
  }

  composer.render();
}
animate();