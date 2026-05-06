import './style.css';
import * as THREE from 'three';
import gsap from 'gsap';

// DOM Elements
const canvas = document.getElementById('materializer-canvas');
const ctaContainer = document.getElementById('cta-button-container');
const ctaButton = document.getElementById('cta-button');
const chatModal = document.getElementById('chat-modal');
const closeChat = document.getElementById('close-chat');

// Global Data for Nodes
const repos = ['VitalStream', 'PicSortPro', 'SentinelCloud', 'OpenBrain', 'AutoScript', 'CryptoScraper', 'AWS Bedrock'];
const nodes = [];
let isIntroComplete = false;

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Scene & Camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 10;

// Particles
const particleCount = 3000;
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const targetPositions = new Float32Array(particleCount * 3);
const colors = new Float32Array(particleCount * 3);

// Button dimensions in world space
const buttonWidth = 6;
const buttonHeight = 1.5;

// Color (Accent #D7543C)
const colorAccent = new THREE.Color('#D7543C');

for (let i = 0; i < particleCount; i++) {
  // Initial Chaos (Sphere)
  const r = 6 * Math.cbrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;
  const phi = Math.acos(2 * Math.random() - 1);

  positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
  positions[i * 3 + 2] = r * Math.cos(phi);

  // Target Order (Rounded Rectangle roughly matching the button)
  targetPositions[i * 3] = (Math.random() - 0.5) * buttonWidth;
  targetPositions[i * 3 + 1] = (Math.random() - 0.5) * buttonHeight;
  targetPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.2; // slight depth

  colors[i * 3] = colorAccent.r;
  colors[i * 3 + 1] = colorAccent.g;
  colors[i * 3 + 2] = colorAccent.b;
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('targetPosition', new THREE.BufferAttribute(targetPositions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

// Custom Shader Material for Opacity/Glow
const material = new THREE.ShaderMaterial({
  uniforms: {
    uProgress: { value: 0.0 }, // 0 = chaos, 1 = order
    uOpacity: { value: 0.0 }
  },
  vertexShader: `
    uniform float uProgress;
    attribute vec3 targetPosition;
    varying vec3 vColor;
    
    void main() {
      vColor = color;
      vec3 currentPos = mix(position, targetPosition, uProgress);
      vec4 mvPosition = modelViewMatrix * vec4(currentPos, 1.0);
      gl_PointSize = (12.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform float uOpacity;
    varying vec3 vColor;
    void main() {
      // Circle shape
      float dist = distance(gl_PointCoord, vec2(0.5));
      if(dist > 0.5) discard;
      
      // Soft edge glow
      float alpha = (0.5 - dist) * 2.0 * uOpacity;
      gl_FragColor = vec4(vColor, alpha);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending
});

const points = new THREE.Points(geometry, material);
scene.add(points);

// Add Background 3D Wireframe for depth
const bgGeometry = new THREE.IcosahedronGeometry(25, 2);
const bgMaterial = new THREE.MeshBasicMaterial({
  color: 0x333333,
  wireframe: true,
  transparent: true,
  opacity: 0.15
});
const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
scene.add(bgMesh);

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation Loop
let animationFrameId;
function animate() {
  animationFrameId = requestAnimationFrame(animate);

  // Slight rotation during chaos
  if (material && material.uniforms && material.uniforms.uProgress.value < 1.0) {
    if (points) {
      points.rotation.y += 0.002;
      points.rotation.x += 0.001;
    }
  }

  // Continuously rotate background for 3D effect
  bgMesh.rotation.y += 0.0005;
  bgMesh.rotation.x += 0.0002;

  // Call the updateNodes function if defined
  if (typeof updateNodes === 'function') {
    updateNodes(performance.now());
  }

  renderer.render(scene, camera);
}
animate();

// Animation Sequence on Load
window.addEventListener('load', () => {
  const tl = gsap.timeline();

  // 1. Fade in chaos
  tl.to(material.uniforms.uOpacity, { value: 0.8, duration: 1.5, ease: 'power2.out' })
    // 2. Move to order
    .to(material.uniforms.uProgress, { value: 1.0, duration: 2.5, ease: 'power3.inOut' }, "+=0.5")

    // 3. Show the card (At 90% completion)
    .add(() => {
      isIntroComplete = true;
      if (ctaContainer) ctaContainer.classList.remove('hidden');
      if (ctaButton) ctaButton.classList.remove('hidden');
    }, "-=0.25")
    // 4. Dispose ONLY the particles gracefully, keep the 3D background running
    .to(material.uniforms.uOpacity, { value: 0.0, duration: 0.5 }, "-=0.25")
    .add(() => {
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    });
});

// UI Interactions
let isModalOpen = false;

ctaButton.addEventListener('click', () => {
  ctaContainer.classList.add('hidden');
  chatModal.classList.remove('hidden');
  isModalOpen = true;
});

closeChat.addEventListener('click', () => {
  chatModal.classList.add('hidden');
  ctaContainer.classList.remove('hidden');
  isModalOpen = false;
});

// 3D Tilt Effect and Glare on Hover
const cardGlare = ctaButton.querySelector('.card-glare');

ctaContainer.addEventListener('mousemove', (e) => {
  const rect = ctaContainer.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  const rotateX = ((y - centerY) / centerY) * -12; // Max 12 deg
  const rotateY = ((x - centerX) / centerX) * 12;

  ctaButton.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

  // Update glare position
  if (cardGlare) {
    cardGlare.style.setProperty('--mouse-x', `${(x / rect.width) * 100}%`);
    cardGlare.style.setProperty('--mouse-y', `${(y / rect.height) * 100}%`);
  }
});

ctaContainer.addEventListener('mouseleave', () => {
  ctaButton.style.transform = 'rotateX(0deg) rotateY(0deg)';
});



const svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
svgOverlay.style.position = 'absolute';
svgOverlay.style.top = '0';
svgOverlay.style.left = '0';
svgOverlay.style.width = '100%';
svgOverlay.style.height = '100%';
svgOverlay.style.pointerEvents = 'none';
svgOverlay.style.zIndex = '25'; // Between card and modal, or just below modal
document.getElementById('app').appendChild(svgOverlay);

repos.forEach((repoName, i) => {
  // Create Node Element
  const node = document.createElement('div');
  node.className = 'repo-node hidden';
  node.innerText = repoName;
  document.getElementById('app').appendChild(node);

  // Random initial position
  const startX = Math.random() * window.innerWidth;
  const startY = Math.random() * window.innerHeight;

  // Animation properties
  const floatSpeed = 0.0005 + Math.random() * 0.001;
  const floatRadiusX = 50 + Math.random() * 100;
  const floatRadiusY = 50 + Math.random() * 100;
  const offset = Math.random() * Math.PI * 2;

  // Create Connecting Line
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('stroke', '#D7543C');
  line.setAttribute('stroke-width', '1');
  line.setAttribute('stroke-dasharray', '5, 5');
  line.setAttribute('opacity', '0'); // Hidden initially
  svgOverlay.appendChild(line);

  nodes.push({ element: node, line, startX, startY, floatSpeed, floatRadiusX, floatRadiusY, offset });
});

// Cached rect for CTA button — updated on resize
let cachedCtaRect = ctaContainer.getBoundingClientRect();
window.addEventListener('resize', () => {
  cachedCtaRect = ctaContainer.getBoundingClientRect();
});

// Update hook called from the animate loop
function updateNodes(time) {
  if (!chatModal) return;

  nodes.forEach(nodeData => {
    // Calculate new floating position
    const currentX = nodeData.startX + Math.sin(time * nodeData.floatSpeed + nodeData.offset) * nodeData.floatRadiusX;
    const currentY = nodeData.startY + Math.cos(time * nodeData.floatSpeed + nodeData.offset) * nodeData.floatRadiusY;

    // Boundary check so they don't float off completely
    const clampedX = Math.max(50, Math.min(window.innerWidth - 100, currentX));
    const clampedY = Math.max(50, Math.min(window.innerHeight - 50, currentY));

    nodeData.element.style.transform = `translate(${clampedX}px, ${clampedY}px)`;

    // Update Line
    // If the intro is complete AND the modal is hidden, the repos are visible and lines connect to the button.
    // If the modal is open, we hide the repos and lines.
    if (!isModalOpen && isIntroComplete) {
      nodeData.element.classList.remove('hidden');

      // Use cached rect for the CTA container
      const targetX = cachedCtaRect.left + cachedCtaRect.width / 2;
      const targetY = cachedCtaRect.top + cachedCtaRect.height / 2;

      nodeData.line.setAttribute('opacity', '0.3');
      nodeData.line.setAttribute('x1', clampedX + nodeData.element.offsetWidth / 2);
      nodeData.line.setAttribute('y1', clampedY + nodeData.element.offsetHeight / 2);
      nodeData.line.setAttribute('x2', targetX);
      nodeData.line.setAttribute('y2', targetY);

      // Animate stroke dash
      nodeData.line.setAttribute('stroke-dashoffset', -(time * 0.05));
    } else {
      // Hide them when chat is active
      nodeData.element.classList.add('hidden');
      nodeData.line.setAttribute('opacity', '0');
    }
  });
}
