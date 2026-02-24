/**
 * BotJob 3D Game World Dashboard
 * Each agent has its own workstation area with desk, monitor, and activity
 */

// Configurable Nexus URL via parameter or localStorage
let NEXUS_URL = 'https://zero.tubecreate.com/';
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('nexus')) {
    NEXUS_URL = urlParams.get('nexus');
    localStorage.setItem('botsjob_nexus_url', NEXUS_URL);
} else if (localStorage.getItem('botsjob_nexus_url')) {
    NEXUS_URL = localStorage.getItem('botsjob_nexus_url');
}

// Remove trailing slash if present
if (NEXUS_URL.endsWith('/')) {
    NEXUS_URL = NEXUS_URL.slice(0, -1);
}

// ============ State ============
let activeServers = [];
let serverOffsets = new Map(); // server.id -> x offset

let agents = [];
let missions = [];
let browserInstances = [];

// ============ Multiplayer (WebSockets) ============
let ws;
const myViewerId = 'viewer-' + Math.random().toString(36).substr(2, 9);
const otherViewers = new Map(); // id -> Mesh

// Particles
const sparks = [];

// 3D World
let scene, camera, renderer, controls;
let raycaster, mouse;
let agentWorkstations = []; // { mesh, agent, label, desk, monitor, screenMesh, isActive }
let groundPlane;
let hoveredAgent = null;
let clock;

// Landmark Interactives arrays (for multiple buildings)
let energyCubes = [];
let repairArms = [];

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

    // Create environment for each server
    if (activeServers.length === 0) {
        setupEnvironment(0, "Local Nexus");
    } else {
        activeServers.forEach((server, index) => {
            const offsetX = index * 40; // 40 units apart
            serverOffsets.set(server.id, offsetX);
            setupEnvironment(offsetX, server.name);
        });
    }

    window.addEventListener('resize', onResize);
    
    // Use Pointer Events for unified Mouse and Touch support
    let pointerDownPos = { x: 0, y: 0 };
    
    canvas.addEventListener('pointerdown', (e) => {
        pointerDownPos.x = e.clientX;
        pointerDownPos.y = e.clientY;
    });

    canvas.addEventListener('pointerup', (e) => {
        const dx = e.clientX - pointerDownPos.x;
        const dy = e.clientY - pointerDownPos.y;
        // If the pointer moved less than 10 pixels total, count it as a "Click/Tap"
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
            onWorldClick(e);
        }
    });

    canvas.addEventListener('pointermove', onWorldMouseMove);

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
    sun.shadow.camera.far = 150; // Increased far plane for wide maps
    const d = 50; // Increased sun coverage map
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
    // Huge ground plane to accommodate multiple servers
    const groundGeo = new THREE.PlaneGeometry(400, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x10121c, roughness: 0.9, metalness: 0.1 });
    groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // Main grid
    const grid = new THREE.GridHelper(400, 400, 0x1a1e30, 0x1a1e30);
    grid.position.y = 0.01;
    grid.material.opacity = 0.35;
    grid.material.transparent = true;
    scene.add(grid);

    // Accent grid
    const accentGrid = new THREE.GridHelper(400, 80, 0xf43f5e, 0xa855f7);
    accentGrid.position.y = 0.02;
    accentGrid.material.opacity = 0.06;
    accentGrid.material.transparent = true;
    scene.add(accentGrid);
}

// ============ Environment (buildings, server rack, etc.) ============
function setupEnvironment(offsetX = 0, serverName = "Unknown Server") {
    const envGroup = new THREE.Group();
    envGroup.position.x = offsetX;
    scene.add(envGroup);

    const bldgMat = new THREE.MeshStandardMaterial({ color: 0x161928, roughness: 0.7, metalness: 0.15 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0e1018, roughness: 0.8 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xf43f5e, emissiveIntensity: 0.2, roughness: 0.4 });

    // Central server tower
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 1.5), bldgMat);
    tower.position.set(0, 1.5, 0);
    tower.castShadow = true;
    tower.receiveShadow = true;
    envGroup.add(tower);

    // Server lights
    for (let y = 0.5; y < 2.8; y += 0.4) {
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.02),
            new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0x22c55e : 0x3b82f6 })
        );
        light.position.set(0.76, y, 0);
        envGroup.add(light);
        // Other side
        const light2 = light.clone();
        light2.position.set(-0.76, y + 0.2, 0);
        envGroup.add(light2);
    }

    // Tower accent ring
    const ringGeo = new THREE.TorusGeometry(1.2, 0.03, 8, 6);
    const ring = new THREE.Mesh(ringGeo, accentMat);
    ring.position.set(0, 3.1, 0);
    ring.rotation.x = Math.PI / 2;
    envGroup.add(ring);

    // Corner structures
    const corners = [[-12, -12], [12, -12]];
    corners.forEach(([cx, cz]) => {
        const h = 1 + Math.random() * 2;
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 1.2), darkMat);
        b.position.set(cx, h / 2, cz);
        b.castShadow = true;
        envGroup.add(b);
    });

    // Side walls (low)
    [-15, 15].forEach(pos => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 0.3, 0.15), darkMat);
        wall.position.set(0, 0.15, pos);
        envGroup.add(wall);
        const wall2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 30), darkMat);
        wall2.position.set(pos, 0.15, 0);
        envGroup.add(wall2);
    });

    // Border text signs
    function makeTextTexture(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 20;
        ctx.font = 'bold 64px Inter, Arial, sans-serif';
        ctx.fillStyle = '#f43f5e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }
    const brandTex = makeTextTexture(serverName.toUpperCase());
    const signMat = new THREE.MeshBasicMaterial({ map: brandTex, transparent: true, side: THREE.DoubleSide });

    // Place on all 4 walls
    const sign1 = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), signMat);
    sign1.position.set(0, 1.2, -14.9);
    envGroup.add(sign1);
    
    const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), signMat);
    sign2.position.set(0, 1.2, 14.9);
    sign2.rotation.y = Math.PI;
    envGroup.add(sign2);
    
    const sign3 = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), signMat);
    sign3.position.set(-14.9, 1.2, 0);
    sign3.rotation.y = Math.PI / 2;
    envGroup.add(sign3);
    
    const sign4 = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), signMat);
    sign4.position.set(14.9, 1.2, 0);
    sign4.rotation.y = -Math.PI / 2;
    envGroup.add(sign4);

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
    envGroup.add(new THREE.Points(pGeo, pMat));

    // 1. Charging Station
    const chargeStation = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.1, 16), new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.1 }));
    chargeStation.position.set(12, 0.05, 12);
    envGroup.add(chargeStation);
    const chargeLabel = new THREE.PointLight(0x22d3ee, 1.2, 10);
    chargeLabel.position.set(12, 2.5, 12);
    envGroup.add(chargeLabel);

    // Energy Crystal (Octahedron)
    const energyCube = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), new THREE.MeshStandardMaterial({ 
        color: 0x4ade80, emissive: 0x22c55e, emissiveIntensity: 2.5, roughness: 0.0, metalness: 1.0, transparent: true, opacity: 0.9
    }));
    energyCube.position.set(12, 1.5, 12);
    envGroup.add(energyCube);
    energyCubes.push({ mesh: energyCube, offsetX });
    
    // Holographic Base Rings
    for (let j = 1; j <= 2; j++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2 + j * 0.1, 0.01, 8, 32), new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.4 / j }));
        ring.position.set(12, 0.06, 12);
        ring.rotation.x = Math.PI / 2;
        envGroup.add(ring);
    }

    // 2. Repair Station
    const repairStation = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.1, 16), new THREE.MeshBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.1 }));
    repairStation.position.set(-12, 0.05, 12);
    envGroup.add(repairStation);
    const repairLabel = new THREE.PointLight(0xfb7185, 1.2, 10);
    repairLabel.position.set(-12, 2.5, 12);
    envGroup.add(repairLabel);
    
    // Holographic Base Rings
    for (let j = 1; j <= 2; j++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2 + j * 0.1, 0.01, 8, 32), new THREE.MeshBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.4 / j }));
        ring.position.set(-12, 0.06, 12);
        ring.rotation.x = Math.PI / 2;
        envGroup.add(ring);
    }

    // Robotic Arm
    const armGroup = new THREE.Group();
    armGroup.position.set(-13.2, 0, 13.2);
    
    const armMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.1 });
    const armBase = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.6, 8), armMat);
    armBase.position.y = 0.3;
    armGroup.add(armBase);
    
    const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.5), armMat);
    seg1.position.y = 0.75;
    const joint1 = new THREE.Group();
    joint1.position.y = 0.55;
    armGroup.add(joint1);
    joint1.add(seg1);
    
    const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.2), armMat);
    seg2.position.y = 0.6;
    const joint2 = new THREE.Group();
    joint2.position.y = 1.4;
    joint1.add(joint2);
    joint2.add(seg2);
    
    // Detailed Scanner head
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 }));
    headGroup.add(head);
    const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.7 }));
    laser.rotation.x = Math.PI / 2;
    headGroup.add(laser);
    joint2.add(headGroup);

    envGroup.add(armGroup);
    repairArms.push({ base: armGroup, segment1: joint1, segment2: joint2, offsetX });
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

    agents.forEach((agent) => {
        const serverAgents = agents.filter(a => a.serverId === agent.serverId);
        const i = serverAgents.indexOf(agent);
        const offsetX = serverOffsets.get(agent.serverId) || 0;
        
        const layout = WORKSTATION_LAYOUTS[i % WORKSTATION_LAYOUTS.length];
        const agentColor = resolveColor(agent.avatar_color || 'blue');

        // Build workstation
        const wsX = layout.x + offsetX;
        const ws = buildWorkstation(wsX, layout.z, layout.rot, agentColor);
        scene.add(ws.group);

        // Build 3D character
        const builder = CHARACTER_BUILDERS[agent.avatar_type] || CHARACTER_BUILDERS.bot;
        const character = builder(agentColor);

        // Position character at chair, FACING the monitor
        const localChairPos = new THREE.Vector3(0, 0, 0.55);
        localChairPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), layout.rot);
        character.position.set(
            wsX + localChairPos.x,
            0.15,
            layout.z + localChairPos.z
        );
        character.rotation.y = layout.rot + Math.PI;

        character.castShadow = true;
        character.traverse(child => {
            if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
        });

        // Check if agent has active browser
        const isActive = browserInstances.some(bi => {
            if (bi.status !== 'running') return false;
            if (bi.serverId && bi.serverId !== agent.serverId) return false;
            // Precise match by agent_id
            if (bi.agent_id && bi.agent_id === agent.id) return true;
            // Fallback: match by profile name
            return agent.allowed_profiles && agent.allowed_profiles.includes(bi.profile);
        });

        character.userData.agentId = agent.id;
        character.userData.serverId = agent.serverId;
        character.userData.isAgent = true;
        character.userData.baseRotY = layout.rot + Math.PI;
        character.userData.deskPos = character.position.clone();
        
        const hubDist = 2.5 + Math.random() * 0.5;
        const hubAngle = (i / serverAgents.length) * Math.PI * 2;
        character.userData.hubPos = new THREE.Vector3(offsetX + Math.sin(hubAngle) * hubDist, 0.15, Math.cos(hubAngle) * hubDist);
        character.userData.movementState = isActive ? 'WORKING' : 'IDLE';
        character.userData.lerpFactor = 0;
        character.userData.baseSpeed = 0.004 + Math.random() * 0.002; // Requested speed range
        character.userData.stateTimer = 0;

        scene.add(character);

        // CSS label
        const label = document.createElement('div');
        label.className = 'agent-label-3d';
        label.innerHTML = `<span class="label-name">${escapeHtml(agent.name)}</span>`;
        label.dataset.name = agent.name;
        document.body.appendChild(label);

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
            browserCount: browserInstances.filter(bi => bi.status === 'running' && (bi.agent_id === agent.id || (agent.allowed_profiles && agent.allowed_profiles.includes(bi.profile)))).length,
            idleTime: 0,
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

// ============ Updates Labels (3D → 2D projection) ============
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
            if (isActive) {
                label.innerHTML = `<span class="label-name">🟢 ${escapeHtml(label.dataset.name || '')}</span>`;
            }
        }
    });
}

// ============ Multiplayer (WebSockets) ============
function initMultiplayer() {
    try {
        const wsUrl = NEXUS_URL.replace('http', 'ws');
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log("Connected to Botsjob Nexus WebSocket");
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'viewers_state') {
                    updateViewers(data.viewers);
                }
            } catch (e) {}
        };
        
        // Broadcast my position
        setInterval(() => {
            if (ws.readyState === WebSocket.OPEN && camera) {
                ws.send(JSON.stringify({
                    type: 'position_update',
                    id: myViewerId,
                    x: camera.position.x,
                    y: camera.position.y,
                    z: camera.position.z,
                    rotation: camera.rotation.y
                }));
            }
        }, 100);
    } catch (e) {
        console.warn("Could not connect to WebSocket", e);
    }
}

function updateViewers(viewersData) {
    const currentIds = new Set(viewersData.map(v => v.id));
    
    // Remove disconnected viewers
    for (const [id, mesh] of otherViewers.entries()) {
        if (!currentIds.has(id)) {
            scene.remove(mesh);
            otherViewers.delete(id);
        }
    }

    // Update or add viewers
    viewersData.forEach(v => {
        if (v.id === myViewerId) return;

        let mesh = otherViewers.get(v.id);
        if (!mesh) {
            mesh = new THREE.Group();
            
            const dome = new THREE.Mesh(
                new THREE.SphereGeometry(0.3, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2),
                new THREE.MeshPhysicalMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.6, roughness: 0.1, transmission: 0.9 })
            );
            dome.position.y = 0.1;
            
            const base = new THREE.Mesh(
                new THREE.CylinderGeometry(0.5, 0.4, 0.2, 16),
                new THREE.MeshStandardMaterial({ color: 0x161928, metalness: 0.8 })
            );
            
            const glow = new THREE.PointLight(0x22d3ee, 0.5, 5);
            
            mesh.add(dome);
            mesh.add(base);
            mesh.add(glow);
            
            // Add a label for the viewer
            const labelGeo = new THREE.PlaneGeometry(2, 0.5);
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#22d3ee';
            ctx.font = 'bold 36px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('Viewer ' + v.id.substring(v.id.length - 4), 128, 48);
            
            const tex = new THREE.CanvasTexture(canvas);
            const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
            const labelMesh = new THREE.Mesh(labelGeo, labelMat);
            labelMesh.position.y = 0.8;
            mesh.add(labelMesh);
            
            scene.add(mesh);
            otherViewers.set(v.id, mesh);
        }
        
        mesh.userData.targetPos = new THREE.Vector3(v.x, v.y, v.z);
        mesh.userData.targetRot = v.rotation;
        
        if (!mesh.position.lengthSq()) {
            mesh.position.set(v.x, v.y, v.z);
        }
    });
}

// ============ Animation Loop ============
function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    controls.update();

    // Animate agents — body, head, and ARMS with state machine
    agentWorkstations.forEach(({ mesh, isActive, layoutIndex }, i) => {
        const phase = i * 0.8;
        const state = mesh.userData.movementState || 'IDLE';
        const deskPos = mesh.userData.deskPos;
        const hubPos = mesh.userData.hubPos;
        const baseRot = mesh.userData.baseRotY || 0;

        // State Machine
        if (state === 'WORKING' || state === 'IDLE' || state === 'AT_STATION' || state === 'OBSERVING') {
            // Static positions or relative small movements
            mesh.position.y = 0.15 + Math.sin(t * 1.5 + phase) * 0.025;
            
            if (state === 'WORKING') {
                mesh.rotation.y = baseRot + Math.sin(t * 1.2 + phase) * 0.04;
                agentWorkstations[i].idleTime = 0;
            } else if (state === 'IDLE') {
                mesh.rotation.y = baseRot + Math.sin(t * 0.3 + phase) * 0.15;
                agentWorkstations[i].idleTime += 0.016; // Approx inc per frame
                
                // Trigger transition to random idle behavior after 15-30s
                if (agentWorkstations[i].idleTime > 15 + Math.random() * 15) {
                    const rand = Math.random();
                    if (rand < 0.3) {
                        mesh.userData.movementState = 'TO_STATION';
                        mesh.userData.stationType = 'CHARGING';
                        mesh.userData.lerpFactor = 0;
                        mesh.userData.startPos = mesh.position.clone();
                    } else if (rand < 0.6) {
                        mesh.userData.movementState = 'TO_STATION';
                        mesh.userData.stationType = 'REPAIR';
                        mesh.userData.lerpFactor = 0;
                        mesh.userData.startPos = mesh.position.clone();
                    } else {
                        // Find a working colleague to observe
                        const colleagues = agentWorkstations.filter((ws, idx) => idx !== i && ws.isActive);
                        if (colleagues.length > 0) {
                            const targetWs = colleagues[Math.floor(Math.random() * colleagues.length)];
                            mesh.userData.movementState = 'TO_OBSERVE';
                            // Position slightly behind and LATERALLY OFFSET (left or right)
                            const sideOffset = (Math.random() > 0.5 ? 0.8 : -0.8);
                            const offset = new THREE.Vector3(sideOffset, 0, 1.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), targetWs.workstationGroup.rotation.y);
                            mesh.userData.targetPos = targetWs.workstationGroup.position.clone().add(offset);
                            mesh.userData.observeTarget = targetWs.workstationGroup.position;
                            mesh.userData.lerpFactor = 0;
                            mesh.userData.startPos = mesh.position.clone();
                        }
                    }
                    agentWorkstations[i].idleTime = 0;
                }
            } else if (state === 'AT_STATION') {
                // Determine rotation: face the center of the station
                const offsetX = serverOffsets.get(mesh.userData.serverId) || 0;
                const center = mesh.userData.stationType === 'CHARGING' ? new THREE.Vector3(12 + offsetX, 0.15, 12) : new THREE.Vector3(-12 + offsetX, 0.15, 12);
                center.y = mesh.position.y; // Keep them standing upright!
                mesh.lookAt(center);

                // Charging VFX (Lightning)
                if (mesh.userData.stationType === 'CHARGING' && Math.random() < 0.25) { // Frequent flashes
                    const startY = 0.5 + Math.random() * 1.5;
                    const angle = Math.random() * Math.PI * 2;
                    const radius = 0.2 + Math.random() * 0.4; // Spread around the agent body
                    const lPos = mesh.position.clone().add(new THREE.Vector3(Math.cos(angle)*radius, startY, Math.sin(angle)*radius));
                    
                    const height = 1.0 + Math.random() * 2.0;
                    const thickness = 0.05 + Math.random() * 0.05;
                    const pMesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, thickness), new THREE.MeshBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.9 }));
                    pMesh.position.copy(lPos);
                    pMesh.rotation.x = (Math.random() - 0.5) * (Math.PI / 2);
                    pMesh.rotation.z = (Math.random() - 0.5) * (Math.PI / 2);
                    scene.add(pMesh);
                    sparks.push({ mesh: pMesh, velocity: new THREE.Vector3(), life: 0.4 }); // Flash duration
                }
            } else if (state === 'OBSERVING') {
                if (mesh.userData.observeTarget) {
                    const lookTarget = mesh.userData.observeTarget.clone();
                    lookTarget.y = mesh.position.y;
                    mesh.lookAt(lookTarget);
                }
                // If the observed agent stops working, go back home
                const colleagues = agentWorkstations.filter((ws, idx) => idx !== i);
                const stillWorking = colleagues.some(ws => ws.workstationGroup.position.distanceTo(mesh.userData.targetPos) < 2 && ws.isActive);
                if (!stillWorking && Math.random() < 0.01) {
                    mesh.userData.movementState = 'TO_DESK';
                    mesh.userData.lerpFactor = 0;
                    mesh.userData.startPos = mesh.position.clone();
                }
            }
        } else if (state === 'TO_HUB' || state === 'TO_DESK' || state === 'TO_STATION' || state === 'TO_OBSERVE') {
            // Movement logic
            mesh.userData.lerpFactor += mesh.userData.baseSpeed || 0.008; // Dynamic movement speed
            const f = mesh.userData.lerpFactor;
            const start = mesh.userData.startPos;
            
            // Queue Calculation for STATION
            let target = deskPos;
            if (state === 'TO_HUB') target = hubPos;
            else if (state === 'TO_STATION') {
                const sType = mesh.userData.stationType;
                const offsetX = serverOffsets.get(mesh.userData.serverId) || 0;
                const base = sType === 'CHARGING' ? new THREE.Vector3(12 + offsetX, 0.15, 12) : new THREE.Vector3(-12 + offsetX, 0.15, 12);
                const dir = sType === 'CHARGING' ? new THREE.Vector3(1, 0, 1) : new THREE.Vector3(-1, 0, 1);
                
                const inQueue = agentWorkstations.filter(w => w.mesh.userData.serverId === mesh.userData.serverId && (w.mesh.userData.movementState === 'TO_STATION' || w.mesh.userData.movementState === 'AT_STATION'))
                    .filter(w => w.mesh.userData.stationType === sType)
                    .sort((a, b) => a.layoutIndex - b.layoutIndex); // Stable sort based on their fixed index
                
                const idx = inQueue.findIndex(w => w.mesh === mesh);
                const qIdx = idx === -1 ? inQueue.length : idx;
                
                // Distribute agents in a circle around the station pad so they don't overlap
                if (qIdx === 0) {
                    target = base.clone(); // First agent gets dead center
                } else {
                    const angle = qIdx * ((Math.PI * 2) / 6); // 6 agents around the ring
                    const ringRadius = 0.9 + Math.floor((qIdx - 1) / 6) * 0.8; // Expand rings if > 7 agents
                    target = base.clone().add(new THREE.Vector3(Math.cos(angle) * ringRadius, 0, Math.sin(angle) * ringRadius));
                }
            } else if (state === 'TO_OBSERVE') target = mesh.userData.targetPos;
            
            if (start && target) {
                mesh.position.lerpVectors(start, target, Math.min(f, 1));
                // Walking bob
                mesh.position.y = 0.15 + Math.abs(Math.sin(f * 25)) * 0.15;
                
                // Look at target
                const lookTarget = target.clone();
                lookTarget.y = mesh.position.y;
                mesh.lookAt(lookTarget);
            }

            if (f >= 1) {
                if (state === 'TO_HUB') {
                    mesh.userData.movementState = 'AT_HUB';
                    mesh.userData.stateTimer = t + 2; // Pause for 2s
                } else if (state === 'TO_STATION') {
                    mesh.userData.movementState = 'AT_STATION';
                    mesh.userData.queueStartTime = t;
                    mesh.userData.stateTimer = t + 10 + Math.random() * 15;
                } else if (state === 'TO_OBSERVE') {
                    mesh.userData.movementState = 'OBSERVING';
                } else {
                    // Reached desk: check if we should start working
                    const ws = agentWorkstations[i];
                    if (ws && ws.isActive) {
                        mesh.userData.movementState = 'WORKING';
                        const color = resolveColor(ws.agent.avatar_color || 'blue');
                        setScreenActive(ws.screenMesh, color);
                        ws.padMat.opacity = 0.1;
                        ws.borderMat.opacity = 0.18;
                    } else {
                        mesh.userData.movementState = 'IDLE';
                    }
                    mesh.rotation.y = baseRot;
                    mesh.position.copy(deskPos);
                }
            }
        } else if (state === 'AT_HUB') {
            // Receiving mission pause
            mesh.position.y = 0.15 + Math.sin(t * 1.5 + phase) * 0.025;
            // Look at central tower
            const offsetX = serverOffsets.get(mesh.userData.serverId) || 0;
            const towerPos = new THREE.Vector3(offsetX, 0.15, 0);
            mesh.lookAt(towerPos);

            if (t > mesh.userData.stateTimer) {
                mesh.userData.movementState = 'TO_DESK';
                mesh.userData.lerpFactor = 0;
                mesh.userData.startPos = mesh.position.clone();
            }
        } else if (state === 'AT_STATION') {
            // Stay at station for a long time (60-120s) or until new mission kicks in
            if (t > mesh.userData.stateTimer) {
                mesh.userData.movementState = 'TO_DESK';
                mesh.userData.lerpFactor = 0;
                mesh.userData.startPos = mesh.position.clone();
            }
        }

        // Arm animation logic based on state
        const leftArm = mesh.userData.leftArm;
        const rightArm = mesh.userData.rightArm;

        if (leftArm && rightArm) {
            if (state === 'WORKING') {
                // TYPING: arms reach forward, forearms alternate rapid up/down
                leftArm.rotation.x = -1.0 + Math.sin(t * 0.5 + phase) * 0.05;
                rightArm.rotation.x = -1.0 + Math.sin(t * 0.5 + phase + 1) * 0.05;
                const leftForearm = leftArm.userData.forearmPivot;
                const rightForearm = rightArm.userData.forearmPivot;
                if (leftForearm) leftForearm.rotation.x = -0.3 + Math.sin(t * 12 + phase) * 0.15;
                if (rightForearm) rightForearm.rotation.x = -0.3 + Math.sin(t * 12 + phase + Math.PI) * 0.15;
            } else if (state === 'TO_HUB' || state === 'TO_DESK' || state === 'TO_STATION' || state === 'TO_OBSERVE') {
                // WALKING: arms swing
                const swing = Math.sin(mesh.userData.lerpFactor * 40);
                leftArm.rotation.x = -0.3 + swing * 0.6;
                rightArm.rotation.x = -0.3 - swing * 0.6;
                if (leftArm.userData.forearmPivot) leftArm.userData.forearmPivot.rotation.x = -0.4;
                if (rightArm.userData.forearmPivot) rightArm.userData.forearmPivot.rotation.x = -0.4;
            } else {
                // IDLE, AT_HUB, AT_STATION, OBSERVING: arms resting
                leftArm.rotation.x = -0.7 + Math.sin(t * 0.4 + phase) * 0.05;
                rightArm.rotation.x = -0.7 + Math.sin(t * 0.4 + phase + 1) * 0.05;
                const leftForearm = leftArm.userData.forearmPivot;
                const rightForearm = rightArm.userData.forearmPivot;
                if (leftForearm) leftForearm.rotation.x = -0.5;
                if (rightForearm) rightForearm.rotation.x = -0.5;
            }
        }
    });

    // Landmark Animations
    energyCubes.forEach(({ mesh }) => {
        if (mesh) {
            mesh.rotation.y += 0.02;
            mesh.rotation.x += 0.01;
            mesh.position.y = 1.6 + Math.sin(t * 2) * 0.2;
        }
    });

    repairArms.forEach(({ base, segment1, segment2, offsetX }) => {
        if (base) {
            // Find serverId for this offsetX
            let serverId = null;
            for (let [id, val] of serverOffsets.entries()) {
                if (val === offsetX) { serverId = id; break; }
            }
            // Robotic arm logic: move if someone is in repair queue for THIS server
            const inRepair = agentWorkstations.filter(w => w.mesh.userData.serverId === serverId && w.mesh.userData.movementState === 'AT_STATION' && w.mesh.userData.stationType === 'REPAIR')
                .sort((a, b) => (a.mesh.userData.queueStartTime || 0) - (b.mesh.userData.queueStartTime || 0));
            
            if (inRepair.length > 0) {
                // Aim robotic arm at the working agent
                const targetAgent = inRepair[0].mesh;
                const targetPos = targetAgent.position.clone();
                targetPos.y += 0.8; // Target torso

                // Point base at agent
                const dir = targetPos.clone().sub(base.position).normalize();
                base.rotation.y = Math.atan2(-dir.z, dir.x) - Math.PI/2;
                
                // Bob arm rapidly to simulate "welding/working"
                segment1.rotation.z = Math.sin(t * 15) * 0.1 - 0.3;
                segment2.rotation.z = Math.cos(t * 15) * 0.1 + 0.8;

                // Spawning welding sparks from the agent's body (where the arm touches)
                if (Math.random() < 0.4) {
                    const sparkPos = targetPos.add(new THREE.Vector3((Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3));
                    const pMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
                    pMesh.position.copy(sparkPos);
                    scene.add(pMesh);
                    sparks.push({
                        mesh: pMesh,
                        velocity: new THREE.Vector3((Math.random()-0.5)*0.1, -Math.random()*0.1, (Math.random()-0.5)*0.1),
                        life: 1.0
                    });
                }
            } else {
                // Idle arm animation
                segment1.rotation.z = -0.1 + Math.sin(t * 0.5) * 0.05;
                segment2.rotation.z = 0.2 + Math.sin(t * 0.8) * 0.1;
            }
        }
    });

    // Update particles (Sparks & Lightning)
    for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.mesh.position.add(p.velocity);
        p.life -= 0.03;
        p.mesh.scale.setScalar(Math.max(0.01, p.life));
        if (p.life <= 0) {
            scene.remove(p.mesh);
            sparks.splice(i, 1);
        }
    }

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

    // Lerp viewer avatars
    otherViewers.forEach(mesh => {
        if (mesh.userData.targetPos) {
            mesh.position.lerp(mesh.userData.targetPos, 0.1);
            
            // Add floating bob
            mesh.position.y += Math.sin(t * 3) * 0.05 - 0.025;
            // Add spin to the base
            mesh.children[1].rotation.y += 0.05;
            // Always face camera for label
            if (mesh.children[3]) mesh.children[3].lookAt(camera.position);
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
    let clientX = event.clientX;
    let clientY = event.clientY;

    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

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
async function api(path, baseUrl = null, method = 'GET', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    try {
        const url = baseUrl ? `${baseUrl}/api/v1${path}` : `${NEXUS_URL}${path}`;
        const res = await fetch(url, opts);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(err.detail || res.statusText);
        }
        return res.json();
    } catch (e) {
        console.warn(`API Error for ${baseUrl || NEXUS_URL}${path}:`, e.message);
        throw e;
    }
}

// ============ Data Fetching (Nexus Universe Push Model) ============
async function fetchUniverseState() {
    try {
        const data = await api('/universe-state');
        
        // 1. Update Servers
        activeServers = data.servers || [];
        updateServerNavigatorUI();

        // 2. Update Agents
        const newAgents = data.agents || [];
        const currentIds = agents.map(a => a.id).sort().join(',');
        const newIds = newAgents.map(a => a.id).sort().join(',');
        
        if (currentIds !== newIds || agents.length !== newAgents.length) {
            agents = newAgents;
            placeAgentsInWorld();
        } else {
            agents = newAgents;
            agentWorkstations.forEach(ws => {
                const refreshed = agents.find(a => a.id === ws.agent.id);
                if (refreshed) ws.agent = refreshed;
            });
        }

        // 3. Update Missions
        missions = data.missions || [];
        renderMissions();

        // 4. Update Browsers
        browserInstances = data.browsers || [];
        renderBrowserInstances();
        
        // 5. Update Activity & Stats
        updateStats();
        updateAgentActivity();

    } catch (e) {
        showToast('⚠️ Nexus Disconnected', 'error');
        document.getElementById('status-dot').className = 'status-dot offline';
        document.getElementById('status-text').textContent = 'Nexus Disconnected';
        initWorld();
    }
}

// Polling handled in DOMContentLoaded

function updateAgentActivity() {
    agentWorkstations.forEach(ws => {
        const wasActive = ws.isActive;
        const lastCount = ws.browserCount || 0;
        
        const activeBrowsers = browserInstances.filter(bi => {
            if (bi.status !== 'running') return false;
            // Precise match by agent_id
            if (bi.agent_id && bi.agent_id === ws.agent.id) return true;
            // Fallback: match by profile name
            return ws.agent.allowed_profiles && ws.agent.allowed_profiles.includes(bi.profile);
        });

        ws.isActive = activeBrowsers.length > 0;
        ws.browserCount = activeBrowsers.length;

        // Update visual status if activity changed OR more browsers added
        if (ws.browserCount > lastCount) {
            // TRIGGER MISSION PICKUP SEQUENCE (Go to hub first)
            ws.mesh.userData.movementState = 'TO_HUB';
            ws.mesh.userData.lerpFactor = 0;
            ws.mesh.userData.startPos = ws.mesh.position.clone();
        } else if (ws.browserCount === 0 && lastCount > 0) {
            // WORK FINISHED: Turn off screen, but REMAIN where we are (no teleport)
            ws.screenMesh.material.dispose();
            ws.screenMesh.material = new THREE.MeshBasicMaterial({ color: 0x0a1628 });
            ws.padMat.opacity = 0.04;
            ws.borderMat.opacity = 0.08;
            // Remove screen lines
            ws.workstationGroup.traverse(child => {
                if (child.userData && child.userData.screenLines) {
                    if (child.parent) child.parent.remove(child);
                }
            });
            
            // Transition from WORKING to IDLE seated at desk (if they were there)
            if (ws.mesh.userData.movementState === 'WORKING') {
                ws.mesh.userData.movementState = 'IDLE';
                ws.mesh.position.copy(ws.mesh.userData.deskPos); 
                ws.mesh.rotation.y = ws.mesh.userData.baseRotY;
            }
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

// ============ Server Navigator (Observer Mode) ============
function toggleServerDropdown() {
    document.getElementById('server-dropdown').classList.toggle('open');
}

function updateServerNavigatorUI() {
    const nav = document.getElementById('server-navigator');
    const dropdown = document.getElementById('server-dropdown');
    
    if (activeServers.length > 0) {
        nav.style.display = 'flex';
    } else {
        nav.style.display = 'none';
        return;
    }
    
    dropdown.innerHTML = '';
    
    const allView = document.createElement('div');
    allView.className = 'server-entry';
    allView.innerHTML = `<span>🌍 All Servers</span>`;
    allView.onclick = () => jumpToServer('all');
    dropdown.appendChild(allView);

    activeServers.forEach(server => {
        const entry = document.createElement('div');
        entry.className = 'server-entry';
        entry.innerHTML = `<span>🏢 ${server.name}</span>`;
        entry.onclick = () => jumpToServer(server.id);
        dropdown.appendChild(entry);
    });
}

function jumpToServer(serverId) {
    document.getElementById('server-dropdown').classList.remove('open');
    if (!serverId || serverId === 'all') {
        document.getElementById('current-server-label').textContent = '🌍 All Servers View';
        controls.target.x = 0;
        camera.position.x = 14;
        return;
    }
    
    const server = activeServers.find(s => s.id === serverId);
    if (!server) return;
    
    document.getElementById('current-server-label').textContent = `🏢 ${server.name}`;
    const targetX = serverOffsets.get(serverId) || 0;
    
    controls.target.x = targetX;
    camera.position.x = targetX + 14;
}

function jumpToRandomServer() {
    if (activeServers.length === 0) return;
    const randomServer = activeServers[Math.floor(Math.random() * activeServers.length)];
    jumpToServer(randomServer.id);
}

// ============ Actions ============
function getServerUrl(serverId) {
    if (serverId === 'local') return 'http://localhost:5295';
    const server = activeServers.find(s => s.id === serverId);
    return server ? server.url : null;
}

async function deleteAgent(agentId) {
    if (!confirm('Delete this agent?')) return;
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;
    const url = getServerUrl(agent.serverId);
    if (!url) return showToast('Server offline', 'error');
    
    try { await api(`/agents/${agentId}`, url, 'DELETE'); showToast('Agent deleted', 'success'); closeModal(); fetchAgents(); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function resetMission(missionId) {
    const mission = missions.find(m => m.id === missionId);
    if (!mission) return;
    const url = getServerUrl(mission.serverId);
    if (!url) return showToast('Server offline', 'error');

    try { await api(`/missions/${missionId}/reset`, url, 'POST'); showToast('Mission reset', 'success'); fetchMissions(); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function deleteMission(missionId) {
    if (!confirm('Delete this mission?')) return;
    const mission = missions.find(m => m.id === missionId);
    if (!mission) return;
    const url = getServerUrl(mission.serverId);
    if (!url) return showToast('Server offline', 'error');

    try { await api(`/missions/${missionId}`, url, 'DELETE'); showToast('Mission deleted', 'success'); fetchMissions(); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function terminateBrowser(instanceId) {
    const instance = browserInstances.find(i => i.instance_id === instanceId);
    if (!instance) return;
    const url = getServerUrl(instance.serverId);
    if (!url) return showToast('Server offline', 'error');

    try { await api(`/browser/terminate/${instanceId}`, url, 'POST'); showToast('Browser terminated', 'success'); fetchBrowserInstances(); }
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
    try { 
        await api('/health'); // Pings Nexus
        dot.classList.add('online'); dot.classList.remove('offline'); 
        text.textContent = `Nexus: ${activeServers.length} Servers`; 
    }
    catch { 
        dot.classList.add('offline'); dot.classList.remove('online'); 
        text.textContent = 'Nexus Disconnected'; 
    }
}

// ============ Init ============
document.addEventListener('DOMContentLoaded', async () => {
    // Pre-fetch servers before building the 3D world so it can draw all buildings
    try {
        const data = await api('/universe-state');
        activeServers = data.servers || [];
    } catch (e) {
        console.warn("Initial universe state fetch failed", e);
    }

    initWorld();
    initMultiplayer();
    
    // Initial fetch to place agents
    await fetchUniverseState();
    await checkHealth();
    
    // Polling interval
    setInterval(async () => {
        await fetchUniverseState();
        await checkHealth();
    }, 2000);
});
