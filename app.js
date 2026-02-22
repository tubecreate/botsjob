/**
 * BotJob 3D Game World Dashboard
 * Each agent has its own workstation area with desk, monitor, and activity
 */

const API_BASE = 'http://localhost:5295/api/v1';

// ============ State ============
let agents = [];
let missions = [];
let browserInstances = [];

// 3D World
let scene, camera, renderer, controls;
let raycaster, mouse;
let agentWorkstations = []; // { mesh, agent, label, desk, monitor, screenMesh, isActive }
let groundPlane;
let hoveredAgent = null;
let clock;

// Layout config — workstation positions arranged in zones
const WORKSTATION_LAYOUTS = [
    // Zone positions [x, z, rotationY] — arranged in a semicircle / office layout
    { x: -6, z: -3, rot: Math.PI / 4 },
    { x: -3, z: -5, rot: Math.PI / 6 },
    { x: 0,  z: -6, rot: 0 },
    { x: 3,  z: -5, rot: -Math.PI / 6 },
    { x: 6,  z: -3, rot: -Math.PI / 4 },
    { x: -6, z: 2,  rot: Math.PI / 3 },
    { x: -3, z: 4,  rot: Math.PI / 5 },
    { x: 0,  z: 5,  rot: 0 },
    { x: 3,  z: 4,  rot: -Math.PI / 5 },
    { x: 6,  z: 2,  rot: -Math.PI / 3 },
    { x: -8, z: 0,  rot: Math.PI / 2 },
    { x: 8,  z: 0,  rot: -Math.PI / 2 },
];

// ============ Init 3D World ============
function initWorld() {
    const canvas = document.getElementById('world-canvas');

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080a12, 0.018);

    camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(14, 12, 14);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x060810);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.2;
    controls.minDistance = 6;
    controls.maxDistance = 40;
    controls.target.set(0, 0, 0);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    clock = new THREE.Clock();

    setupLighting();
    setupGround();
    setupEnvironment();

    window.addEventListener('resize', onResize);
    canvas.addEventListener('click', onWorldClick);
    canvas.addEventListener('mousemove', onWorldMouseMove);

    animate();
}

// ============ Lighting ============
function setupLighting() {
    scene.add(new THREE.AmbientLight(0x334466, 0.5));

    const sun = new THREE.DirectionalLight(0xffeedd, 0.9);
    sun.position.set(12, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 60;
    const d = 18;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    scene.add(sun);

    const rimLight = new THREE.DirectionalLight(0x4466ff, 0.25);
    rimLight.position.set(-10, 6, -8);
    scene.add(rimLight);

    // Colored atmosphere
    const pinkLight = new THREE.PointLight(0xf43f5e, 0.3, 25);
    pinkLight.position.set(-6, 3, 6);
    scene.add(pinkLight);

    const purpleLight = new THREE.PointLight(0xa855f7, 0.3, 25);
    purpleLight.position.set(6, 3, -6);
    scene.add(purpleLight);

    const cyanLight = new THREE.PointLight(0x22d3ee, 0.2, 20);
    cyanLight.position.set(0, 4, 0);
    scene.add(cyanLight);
}

// ============ Ground ============
function setupGround() {
    const groundGeo = new THREE.PlaneGeometry(50, 50);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x10121c, roughness: 0.9, metalness: 0.1 });
    groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // Main grid
    const grid = new THREE.GridHelper(40, 40, 0x1a1e30, 0x1a1e30);
    grid.position.y = 0.01;
    grid.material.opacity = 0.35;
    grid.material.transparent = true;
    scene.add(grid);

    // Accent grid
    const accentGrid = new THREE.GridHelper(40, 8, 0xf43f5e, 0xa855f7);
    accentGrid.position.y = 0.02;
    accentGrid.material.opacity = 0.06;
    accentGrid.material.transparent = true;
    scene.add(accentGrid);
}

// ============ Environment (buildings, server rack, etc.) ============
function setupEnvironment() {
    const bldgMat = new THREE.MeshStandardMaterial({ color: 0x161928, roughness: 0.7, metalness: 0.15 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0e1018, roughness: 0.8 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xf43f5e, emissiveIntensity: 0.2, roughness: 0.4 });

    // Central server tower
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 1.5), bldgMat);
    tower.position.set(0, 1.5, 0);
    tower.castShadow = true;
    tower.receiveShadow = true;
    scene.add(tower);

    // Server lights
    for (let y = 0.5; y < 2.8; y += 0.4) {
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.02),
            new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0x22c55e : 0x3b82f6 })
        );
        light.position.set(0.76, y, 0);
        scene.add(light);
        // Other side
        const light2 = light.clone();
        light2.position.set(-0.76, y + 0.2, 0);
        scene.add(light2);
    }

    // Tower accent ring
    const ringGeo = new THREE.TorusGeometry(1.2, 0.03, 8, 6);
    const ring = new THREE.Mesh(ringGeo, accentMat);
    ring.position.set(0, 3.1, 0);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);

    // Corner structures
    const corners = [[-12, -12], [12, -12], [-12, 12], [12, 12]];
    corners.forEach(([cx, cz]) => {
        const h = 1 + Math.random() * 2;
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 1.2), darkMat);
        b.position.set(cx, h / 2, cz);
        b.castShadow = true;
        scene.add(b);
    });

    // Side walls (low)
    [-15, 15].forEach(pos => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 0.3, 0.15), darkMat);
        wall.position.set(0, 0.15, pos);
        scene.add(wall);
        const wall2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 30), darkMat);
        wall2.position.set(pos, 0.15, 0);
        scene.add(wall2);
    });

    // Border text signs — "Truong Tuan Com"
    function makeTextTexture(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Glow
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 20;
        ctx.font = 'bold 64px Inter, Arial, sans-serif';
        ctx.fillStyle = '#f43f5e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        // Second pass for brightness
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }
    const brandTex = makeTextTexture('TRUONG TUAN COM');
    const signMat = new THREE.MeshBasicMaterial({ map: brandTex, transparent: true, side: THREE.DoubleSide });

    // Place on all 4 walls
    // Front wall (z = -15)
    const sign1 = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), signMat);
    sign1.position.set(0, 1.2, -14.9);
    scene.add(sign1);
    // Back wall (z = 15)
    const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), signMat);
    sign2.position.set(0, 1.2, 14.9);
    sign2.rotation.y = Math.PI;
    scene.add(sign2);
    // Left wall (x = -15)
    const sign3 = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), signMat);
    sign3.position.set(-14.9, 1.2, 0);
    sign3.rotation.y = Math.PI / 2;
    scene.add(sign3);
    // Right wall (x = 15)
    const sign4 = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), signMat);
    sign4.position.set(14.9, 1.2, 0);
    sign4.rotation.y = -Math.PI / 2;
    scene.add(sign4);

    // Floating particles
    const pCount = 300;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
        pPos[i * 3] = (Math.random() - 0.5) * 35;
        pPos[i * 3 + 1] = 0.5 + Math.random() * 10;
        pPos[i * 3 + 2] = (Math.random() - 0.5) * 35;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({ color: 0xf43f5e, size: 0.04, transparent: true, opacity: 0.4 });
    scene.add(new THREE.Points(pGeo, pMat));
}

// ============ Workstation Builder ============
function buildWorkstation(x, z, rot, color) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rot;

    const deskMat = new THREE.MeshStandardMaterial({ color: 0x1c1f32, roughness: 0.6, metalness: 0.2 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x13151f, roughness: 0.7 });
    const screenFrameMat = new THREE.MeshStandardMaterial({ color: 0x111320, roughness: 0.4, metalness: 0.3 });

    // Desk top
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.9), deskMat);
    deskTop.position.set(0, 0.65, 0);
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    group.add(deskTop);

    // Desk legs
    [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.65, 0.05), legMat);
        leg.position.set(lx, 0.325, lz);
        group.add(leg);
    });

    // Monitor frame
    const monitorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.05), screenFrameMat);
    monitorFrame.position.set(0, 1.35, -0.2);
    monitorFrame.castShadow = true;
    group.add(monitorFrame);

    // Monitor stand
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.06), screenFrameMat);
    stand.position.set(0, 0.85, -0.2);
    group.add(stand);

    // Monitor base
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.2), screenFrameMat);
    base.position.set(0, 0.68, -0.2);
    group.add(base);

    // Screen (emissive — will change when active)
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x0a1628 }); // dark = idle
    const screenGeo = new THREE.PlaneGeometry(1.0, 0.6);
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 1.35, -0.17);
    group.add(screenMesh);

    // Keyboard
    const keyboard = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.02, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x1a1d2e, roughness: 0.5 })
    );
    keyboard.position.set(0, 0.69, 0.15);
    group.add(keyboard);

    // Chair
    const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.4), deskMat);
    chairSeat.position.set(0, 0.4, 0.7);
    group.add(chairSeat);
    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.05), deskMat);
    chairBack.position.set(0, 0.65, 0.9);
    group.add(chairBack);
    // Chair legs
    [[-0.18, 0.55], [0.18, 0.55], [-0.18, 0.85], [0.18, 0.85]].forEach(([cx, cz]) => {
        const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), legMat);
        cl.position.set(cx, 0.2, cz);
        group.add(cl);
    });

    // Floor zone indicator (colored pad under desk)
    const padGeo = new THREE.PlaneGeometry(2.2, 1.8);
    const padMat = new THREE.MeshBasicMaterial({
        color: color || 0x60a5fa,
        transparent: true,
        opacity: 0.04,
        side: THREE.DoubleSide,
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.005, 0.3);
    group.add(pad);

    // Border glow around zone
    const borderGeo = new THREE.RingGeometry(1.3, 1.35, 4);
    const borderMat = new THREE.MeshBasicMaterial({
        color: color || 0x60a5fa,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
    });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.rotation.x = -Math.PI / 2;
    border.position.set(0, 0.006, 0.3);
    group.add(border);

    return { group, screenMesh, padMat, borderMat };
}

// ============ Place Agents at Workstations ============
function placeAgentsInWorld() {
    // Clean up old
    agentWorkstations.forEach(({ mesh, label, workstationGroup }) => {
        scene.remove(mesh);
        scene.remove(workstationGroup);
        if (label) label.remove();
    });
    agentWorkstations = [];

    if (agents.length === 0) return;

    agents.forEach((agent, i) => {
        const layout = WORKSTATION_LAYOUTS[i % WORKSTATION_LAYOUTS.length];
        const agentColor = resolveColor(agent.avatar_color || 'blue');

        // Build workstation
        const ws = buildWorkstation(layout.x, layout.z, layout.rot, agentColor);
        scene.add(ws.group);

        // Build 3D character
        const builder = CHARACTER_BUILDERS[agent.avatar_type] || CHARACTER_BUILDERS.bot;
        const character = builder(agentColor);

        // Position character at chair, FACING the monitor
        // In workstation local space: chair is at z=0.55, monitor at z=-0.2
        // Character must face -Z (toward monitor), so local rotation = PI
        const localChairPos = new THREE.Vector3(0, 0, 0.55);
        // Rotate local position by workstation rotation
        localChairPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), layout.rot);
        character.position.set(
            layout.x + localChairPos.x,
            0.15,
            layout.z + localChairPos.z
        );
        // Face the monitor: base rotation + PI to look toward -Z in local space
        character.rotation.y = layout.rot + Math.PI;

        character.castShadow = true;
        character.traverse(child => {
            if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
        });

        character.userData.agentId = agent.id;
        character.userData.isAgent = true;
        // Store base rotation for animation
        character.userData.baseRotY = layout.rot + Math.PI;
        scene.add(character);

        // CSS label
        const label = document.createElement('div');
        label.className = 'agent-label-3d';
        label.innerHTML = `<span class="label-name">${escapeHtml(agent.name)}</span>`;
        label.dataset.name = agent.name;
        document.body.appendChild(label);

        // Check if agent has active browser
        const isActive = browserInstances.some(bi => {
            if (bi.status !== 'running') return false;
            // Precise match by agent_id
            if (bi.agent_id && bi.agent_id === agent.id) return true;
            // Fallback: match by profile name if it belongs to agent's allowed_profiles
            return agent.allowed_profiles && agent.allowed_profiles.includes(bi.profile);
        });

        // Update screen based on activity
        if (isActive) {
            setScreenActive(ws.screenMesh, agentColor);
            ws.padMat.opacity = 0.1;
            ws.borderMat.opacity = 0.18;
        }

        agentWorkstations.push({
            mesh: character,
            agent,
            label,
            workstationGroup: ws.group,
            screenMesh: ws.screenMesh,
            padMat: ws.padMat,
            borderMat: ws.borderMat,
            isActive,
            layoutIndex: i,
        });
    });
}

function setScreenActive(screenMesh, color) {
    // Make screen glow with activity
    screenMesh.material.dispose();
    screenMesh.material = new THREE.MeshBasicMaterial({
        color: 0x0f2844,
    });

    // Add screen content lines (simulated code/browser)
    const lineGroup = new THREE.Group();
    const lineMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.6 });
    const lineMat2 = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.4 });

    for (let row = 0; row < 6; row++) {
        const width = 0.2 + Math.random() * 0.5;
        const line = new THREE.Mesh(
            new THREE.PlaneGeometry(width, 0.03),
            row % 3 === 0 ? lineMat : lineMat2
        );
        line.position.set(-0.2 + width / 2, 1.55 - row * 0.08, -0.165);
        lineGroup.add(line);
    }
    // URL bar
    const urlBar = new THREE.Mesh(
        new THREE.PlaneGeometry(0.85, 0.04),
        new THREE.MeshBasicMaterial({ color: 0x1a2744 })
    );
    urlBar.position.set(0, 1.63, -0.165);
    lineGroup.add(urlBar);

    screenMesh.parent.add(lineGroup);
    lineGroup.userData.screenLines = true;
}

// ============ Update Labels (3D → 2D projection) ============
function updateLabels() {
    agentWorkstations.forEach(({ mesh, label, isActive }) => {
        const pos = new THREE.Vector3();
        pos.setFromMatrixPosition(mesh.matrixWorld);
        pos.y += 2.0;

        const projected = pos.clone().project(camera);
        const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-(projected.y * 0.5) + 0.5) * window.innerHeight;

        if (projected.z > 1) {
            label.style.display = 'none';
        } else {
            label.style.display = 'block';
            label.style.left = x + 'px';
            label.style.top = y + 'px';
            // Show activity indicator
            if (isActive) {
                label.innerHTML = `<span class="label-name">🟢 ${escapeHtml(label.dataset.name || '')}</span>`;
            }
        }
    });
}

// ============ Animation Loop ============
function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    controls.update();

    // Animate agents — body, head, and ARMS
    agentWorkstations.forEach(({ mesh, isActive, layoutIndex }, i) => {
        const phase = i * 0.8;
        // Idle breathing (seated bob)
        mesh.position.y = 0.15 + Math.sin(t * 1.5 + phase) * 0.025;

        const baseRot = mesh.userData.baseRotY || 0;

        if (isActive) {
            // Active: slight body sway while typing
            mesh.rotation.y = baseRot + Math.sin(t * 1.2 + phase) * 0.04;
        } else {
            // Idle: occasional look-around
            mesh.rotation.y = baseRot + Math.sin(t * 0.3 + phase) * 0.15;
        }

        // Arm animation
        const leftArm = mesh.userData.leftArm;
        const rightArm = mesh.userData.rightArm;

        if (leftArm && rightArm) {
            if (isActive) {
                // TYPING: arms reach forward, forearms alternate rapid up/down
                // Upper arms angled forward toward keyboard
                leftArm.rotation.x = -1.0 + Math.sin(t * 0.5 + phase) * 0.05;
                rightArm.rotation.x = -1.0 + Math.sin(t * 0.5 + phase + 1) * 0.05;

                // Forearm rapid typing motion (alternating)
                const leftForearm = leftArm.userData.forearmPivot;
                const rightForearm = rightArm.userData.forearmPivot;
                if (leftForearm) {
                    leftForearm.rotation.x = -0.3 + Math.sin(t * 12 + phase) * 0.15;
                }
                if (rightForearm) {
                    rightForearm.rotation.x = -0.3 + Math.sin(t * 12 + phase + Math.PI) * 0.15;
                }
            } else {
                // IDLE: arms resting on desk, gentle sway
                leftArm.rotation.x = -0.7 + Math.sin(t * 0.4 + phase) * 0.05;
                rightArm.rotation.x = -0.7 + Math.sin(t * 0.4 + phase + 1) * 0.05;

                const leftForearm = leftArm.userData.forearmPivot;
                const rightForearm = rightArm.userData.forearmPivot;
                if (leftForearm) leftForearm.rotation.x = -0.5;
                if (rightForearm) rightForearm.rotation.x = -0.5;
            }
        }
    });

    // Animate active screens (flicker effect)
    agentWorkstations.forEach(({ screenMesh, isActive, workstationGroup }) => {
        if (isActive) {
            workstationGroup.traverse(child => {
                if (child.userData && child.userData.screenLines) {
                    child.children.forEach(line => {
                        if (line.material.opacity !== undefined && line.material.color.getHex() !== 0x1a2744) {
                            line.material.opacity = 0.3 + Math.random() * 0.4;
                        }
                    });
                }
            });
        }
    });

    // Server tower lights blink
    scene.traverse(child => {
        if (child.isMesh && child.material.isMeshBasicMaterial &&
            (child.material.color.getHex() === 0x22c55e || child.material.color.getHex() === 0x3b82f6)) {
            child.material.opacity = 0.5 + Math.sin(t * 3 + child.position.y * 10) * 0.5;
            child.material.transparent = true;
        }
    });

    updateLabels();
    renderer.render(scene, camera);
}

// ============ Events ============
function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onWorldClick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const allMeshes = [];
    agentWorkstations.forEach(({ mesh }) => {
        mesh.traverse(child => { if (child.isMesh) allMeshes.push(child); });
    });

    const intersects = raycaster.intersectObjects(allMeshes);
    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData.isAgent) obj = obj.parent;
        if (obj && obj.userData.agentId) {
            openAgentDetail(obj.userData.agentId);
        }
    }
}

function onWorldMouseMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const allMeshes = [];
    agentWorkstations.forEach(({ mesh }) => {
        mesh.traverse(child => { if (child.isMesh) allMeshes.push(child); });
    });

    const intersects = raycaster.intersectObjects(allMeshes);
    const tooltip = document.getElementById('agent-tooltip');

    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData.isAgent) obj = obj.parent;
        if (obj && obj.userData.agentId) {
            const agent = agents.find(a => a.id === obj.userData.agentId);
            if (agent) {
                const isActive = browserInstances.some(
                    bi => bi.status === 'running' && (bi.agent_id === agent.id || (agent.allowed_profiles && agent.allowed_profiles.includes(bi.profile)))
                );
                document.getElementById('tooltip-name').textContent = agent.name;
                document.getElementById('tooltip-desc').textContent = isActive ? '🟢 Working — browsing' : '💤 Idle';
                tooltip.style.display = 'flex';
                tooltip.style.left = event.clientX + 'px';
                tooltip.style.top = (event.clientY - 60) + 'px';
                document.body.style.cursor = 'pointer';
                hoveredAgent = agent;
                return;
            }
        }
    }

    tooltip.style.display = 'none';
    document.body.style.cursor = 'default';
    hoveredAgent = null;
}

// ============ API Layer ============
async function api(path, method = 'GET', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    try {
        const res = await fetch(`${API_BASE}${path}`, opts);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(err.detail || res.statusText);
        }
        return res.json();
    } catch (e) {
        if (e.message.includes('Failed to fetch')) {
            throw new Error('Cannot connect to TubeCreate API. Is the app running?');
        }
        throw e;
    }
}

// ============ Data Fetching ============
async function fetchAgents() {
    try {
        const data = await api('/agents');
        agents = data.agents || [];
        placeAgentsInWorld();
        updateStats();
    } catch (e) {
        showToast('⚠️ ' + e.message, 'error');
    }
}

async function fetchMissions() {
    try {
        const data = await api('/missions');
        missions = data.missions || [];
        renderMissions();
        updateStats();
    } catch (e) { console.warn('Missions fetch failed:', e.message); }
}

async function fetchBrowserInstances() {
    try {
        const data = await api('/browser/list');
        browserInstances = data.instances || [];
        renderBrowserInstances();
        updateStats();
        // Re-check activity status
        updateAgentActivity();
    } catch (e) { console.warn('Browser instances fetch failed:', e.message); }
}

function updateAgentActivity() {
    agentWorkstations.forEach(ws => {
        const wasActive = ws.isActive;
        ws.isActive = browserInstances.some(bi => {
            if (bi.status !== 'running') return false;
            // Precise match by agent_id
            if (bi.agent_id && bi.agent_id === ws.agent.id) return true;
            // Fallback: match by profile name
            return ws.agent.allowed_profiles && ws.agent.allowed_profiles.includes(bi.profile);
        });
        // Update screen if status changed
        if (ws.isActive && !wasActive) {
            const color = resolveColor(ws.agent.avatar_color || 'blue');
            setScreenActive(ws.screenMesh, color);
            ws.padMat.opacity = 0.1;
            ws.borderMat.opacity = 0.18;
        } else if (!ws.isActive && wasActive) {
            ws.screenMesh.material.dispose();
            ws.screenMesh.material = new THREE.MeshBasicMaterial({ color: 0x0a1628 });
            ws.padMat.opacity = 0.04;
            ws.borderMat.opacity = 0.08;
            // Remove screen lines
            ws.workstationGroup.traverse(child => {
                if (child.userData && child.userData.screenLines) {
                    child.parent.remove(child);
                }
            });
        }
    });
}

async function refreshAll() {
    await Promise.all([fetchAgents(), fetchMissions(), fetchBrowserInstances()]);
}

// ============ Sidebar Rendering ============
function renderMissions() {
    const panel = document.getElementById('missions-list');
    document.getElementById('mission-count').textContent = missions.length;
    if (missions.length === 0) {
        panel.innerHTML = '<div class="empty-state-sm"><p>No missions</p></div>';
        return;
    }
    panel.innerHTML = missions.map(m => {
        const progress = m.target_count > 0 ? Math.round(((m.completed_count || 0) / m.target_count) * 100) : 0;
        const statusClass = `status-${m.status || 'pending'}`;
        return `
            <div class="mission-item ${statusClass}">
                <div class="mission-header">
                    <span class="mission-title">${escapeHtml(m.title)}</span>
                    <span class="mission-status-badge ${statusClass}">${m.status || 'pending'}</span>
                </div>
                <div class="mission-progress-bar"><div class="mission-progress-fill" style="width:${progress}%"></div></div>
                <div class="mission-meta"><span>${m.completed_count || 0}/${m.target_count}</span><span>${m.type || 'general'}</span></div>
                <div class="mission-actions">
                    <button class="btn-sm btn-reset" onclick="event.stopPropagation();resetMission('${m.id}')" title="Reset">↻</button>
                    <button class="btn-sm btn-delete" onclick="event.stopPropagation();deleteMission('${m.id}')" title="Delete">✕</button>
                </div>
            </div>`;
    }).join('');
}

function renderBrowserInstances() {
    const panel = document.getElementById('browser-list');
    const running = browserInstances.filter(i => i.status === 'running');
    document.getElementById('browser-count').textContent = running.length;
    if (running.length === 0) {
        panel.innerHTML = '<div class="empty-state-sm"><p>No active browsers</p></div>';
        return;
    }
    panel.innerHTML = running.map(inst => `
        <div class="browser-item">
            <div class="browser-indicator"></div>
            <div class="browser-info">
                <span class="browser-profile">${escapeHtml(inst.profile || 'Unknown')}</span>
                <span class="browser-action">${escapeHtml(inst.action || 'browse')}</span>
            </div>
            <button class="btn-sm btn-terminate" onclick="terminateBrowser('${inst.instance_id}')" title="Stop">■</button>
        </div>`).join('');
}

function updateStats() {
    const el = id => document.getElementById(id);
    if (el('stat-agents')) el('stat-agents').textContent = agents.length;
    if (el('stat-missions')) el('stat-missions').textContent = missions.length;
    if (el('stat-active')) el('stat-active').textContent = browserInstances.filter(i => i.status === 'running').length;
    if (el('stat-pending')) el('stat-pending').textContent = missions.filter(m => m.status === 'pending').length;
}

// ============ Agent Detail Modal ============
function openAgentDetail(agentId) {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    const isActive = browserInstances.some(
        bi => bi.status === 'running' && (bi.agent_id === agent.id || (agent.allowed_profiles && agent.allowed_profiles.includes(bi.profile)))
    );

    const modal = document.getElementById('agent-modal');
    const content = document.getElementById('modal-content');
    content.innerHTML = `
        <div class="modal-header">
            <div class="modal-header-left">
                <canvas id="modal-canvas" width="100" height="100"></canvas>
                <div>
                    <h2>${escapeHtml(agent.name)}</h2>
                    <p class="modal-desc">${isActive ? '🟢 Currently working' : '💤 Idle'} — ${escapeHtml(agent.description || 'No description')}</p>
                </div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-tabs">
            <button class="tab active" onclick="switchTab(this,'tab-overview')">Overview</button>
            <button class="tab" onclick="switchTab(this,'tab-persona')">Persona</button>
            <button class="tab" onclick="switchTab(this,'tab-config')">Config</button>
        </div>
        <div id="tab-overview" class="tab-panel active">
            <div class="detail-grid">
                <div class="detail-item"><label>Avatar</label><span>${agent.avatar_type || 'bot'} · ${agent.avatar_color || 'blue'}</span></div>
                <div class="detail-item"><label>Status</label><span>${isActive ? '🟢 Working' : '💤 Idle'}</span></div>
                <div class="detail-item"><label>AI Model</label><span>${agent.model || 'default'}</span></div>
                <div class="detail-item"><label>Browser AI</label><span>${agent.browser_ai_model || 'qwen:latest'}</span></div>
                <div class="detail-item"><label>Profiles</label><span>${agent.allowed_profiles?.length || 0} assigned</span></div>
                <div class="detail-item"><label>Proxy</label><span>${agent.proxy_config || 'None'}</span></div>
                <div class="detail-item"><label>Timezone</label><span>${agent.timezone || 'Default'}</span></div>
                <div class="detail-item"><label>Created</label><span>${formatDate(agent.created_at)}</span></div>
            </div>
        </div>
        <div id="tab-persona" class="tab-panel">
            <div class="detail-section"><h4>System Prompt</h4><pre class="code-block">${escapeHtml(agent.system_prompt || 'None')}</pre></div>
            <div class="detail-section"><h4>Persona</h4><pre class="code-block">${JSON.stringify(agent.persona || {}, null, 2)}</pre></div>
            <div class="detail-section"><h4>Routine</h4><pre class="code-block">${JSON.stringify(agent.routine || {}, null, 2)}</pre></div>
        </div>
        <div id="tab-config" class="tab-panel">
            <div class="detail-section"><h4>Integrations</h4>
                <div class="detail-grid">
                    <div class="detail-item"><label>Telegram</label><span>${agent.telegram_token ? '✅ Connected' : '—'}</span></div>
                    <div class="detail-item"><label>Messenger</label><span>${agent.messenger_page_id ? '✅ Connected' : '—'}</span></div>
                </div>
            </div>
            <div class="detail-section"><h4>Proxy Provider</h4><pre class="code-block">${JSON.stringify(agent.proxy_provider || {}, null, 2)}</pre></div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-danger" onclick="deleteAgent('${agent.id}')">Delete Agent</button>
        </div>`;
    modal.classList.add('open');

    setTimeout(() => {
        const mc = document.getElementById('modal-canvas');
        if (mc) initCharacterScene(mc, agent.avatar_type || 'bot', agent.avatar_color || 'blue', 100);
    }, 100);
}

function closeModal() { document.getElementById('agent-modal').classList.remove('open'); }
function switchTab(btn, tabId) {
    btn.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}
function toggleSidebar() { document.getElementById('hud-sidebar').classList.toggle('collapsed'); }

// ============ Actions ============
async function deleteAgent(agentId) {
    if (!confirm('Delete this agent?')) return;
    try { await api(`/agents/${agentId}`, 'DELETE'); showToast('Agent deleted', 'success'); closeModal(); fetchAgents(); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function resetMission(missionId) {
    try { await api(`/missions/${missionId}/reset`, 'POST'); showToast('Mission reset', 'success'); fetchMissions(); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function deleteMission(missionId) {
    if (!confirm('Delete this mission?')) return;
    try { await api(`/missions/${missionId}`, 'DELETE'); showToast('Mission deleted', 'success'); fetchMissions(); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function terminateBrowser(instanceId) {
    try { await api(`/browser/terminate/${instanceId}`, 'POST'); showToast('Browser terminated', 'success'); fetchBrowserInstances(); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ============ Utilities ============
function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
function formatDate(s) { if (!s) return 'N/A'; try { return new Date(s).toLocaleDateString('vi-VN', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); } catch { return s; } }
function showToast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`; t.textContent = msg; c.appendChild(t);
    setTimeout(() => t.classList.add('visible'), 50);
    setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ============ Health Check ============
async function checkHealth() {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    try { await api('/health'); dot.classList.add('online'); dot.classList.remove('offline'); text.textContent = 'Connected'; }
    catch { dot.classList.add('offline'); dot.classList.remove('online'); text.textContent = 'Disconnected'; }
}

// ============ Init ============
document.addEventListener('DOMContentLoaded', async () => {
    initWorld();
    await checkHealth();
    await refreshAll();
    setInterval(async () => { await fetchBrowserInstances(); await checkHealth(); }, 2000);
    setInterval(() => refreshAll(), 30000);
});
