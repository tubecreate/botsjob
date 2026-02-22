/**
 * Three.js Procedural 3D Characters for Agent Dashboard
 * Characters with animatable arms for typing at workstations
 */

const CHARACTER_BUILDERS = {
    bot: buildRobotCharacter,
    dog: buildDogCharacter,
    cat: buildCatCharacter,
    bird: buildBirdCharacter,
    turtle: buildTurtleCharacter,
    bear: buildBearCharacter,
    penguin: buildPenguinCharacter,
    shrimp: buildShrimpCharacter,
    capybara: buildCapybaraCharacter,
};

const COLOR_MAP = {
    blue: 0x60a5fa,
    red: 0xf87171,
    green: 0x4ade80,
    orange: 0xfb923c,
    purple: 0xc084fc,
    teal: 0x2dd4bf,
    pink: 0xf472b6,
    black: 0x555555,
    grey: 0x9ca3af,
    white: 0xe2e8f0,
};

function resolveColor(colorName) {
    return COLOR_MAP[colorName?.toLowerCase()] || COLOR_MAP.blue;
}

/**
 * Initialize a mini character scene for modal preview
 */
function initCharacterScene(canvas, avatarType, avatarColor, size = 200) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.2, 5);
    camera.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(3, 5, 4);
    scene.add(dirLight);
    scene.add(new THREE.DirectionalLight(0x8888ff, 0.4).translateX(-3).translateY(2));

    const color = resolveColor(avatarColor);
    const builder = CHARACTER_BUILDERS[avatarType] || CHARACTER_BUILDERS.bot;
    const character = builder(color);
    scene.add(character);

    const clock = new THREE.Clock();
    let animId;
    function animate() {
        animId = requestAnimationFrame(animate);
        const t = clock.getElapsedTime();
        character.position.y = Math.sin(t * 1.5) * 0.05;
        character.rotation.y = Math.sin(t * 0.5) * 0.3;
        renderer.render(scene, camera);
    }
    animate();

    return { scene, renderer, character, destroy() { cancelAnimationFrame(animId); renderer.dispose(); } };
}

// ============ Materials ============
function createBodyMaterial(color) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1 });
}

function createEyeMaterial() {
    return new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
}

function createHighlightMaterial(color) {
    const hsl = {};
    new THREE.Color(color).getHSL(hsl);
    const lighter = new THREE.Color().setHSL(hsl.h, hsl.s * 0.6, Math.min(hsl.l + 0.2, 0.9));
    return new THREE.MeshStandardMaterial({ color: lighter, roughness: 0.5, metalness: 0.05 });
}

/**
 * Helper: create animatable arms
 * Returns { leftArm, rightArm } — both are pivot groups that rotate at the shoulder
 */
function createArms(mat, highlightMat, config = {}) {
    const {
        shoulderWidth = 0.55,
        shoulderY = 0.75,
        armLength = 0.55,
        armWidth = 0.15,
        handSize = 0.08,
        forearmAngle = -0.8,  // resting angle toward keyboard
    } = config;

    function makeArm(side) {
        // Pivot at shoulder
        const pivot = new THREE.Group();
        pivot.position.set(side * shoulderWidth, shoulderY, 0);
        // Upper arm
        const upper = new THREE.Mesh(new THREE.BoxGeometry(armWidth, armLength * 0.5, armWidth), highlightMat);
        upper.position.y = -armLength * 0.25;
        pivot.add(upper);
        // Forearm pivot
        const forearmPivot = new THREE.Group();
        forearmPivot.position.y = -armLength * 0.5;
        pivot.add(forearmPivot);
        // Forearm
        const forearm = new THREE.Mesh(new THREE.BoxGeometry(armWidth * 0.85, armLength * 0.45, armWidth * 0.85), highlightMat);
        forearm.position.y = -armLength * 0.22;
        forearmPivot.add(forearm);
        // Hand
        const hand = new THREE.Mesh(new THREE.SphereGeometry(handSize, 8, 8), mat);
        hand.position.y = -armLength * 0.45;
        forearmPivot.add(hand);

        // Default pose: arm hanging forward slightly
        pivot.rotation.x = forearmAngle;
        forearmPivot.rotation.x = -0.4;

        pivot.userData.forearmPivot = forearmPivot;
        return pivot;
    }

    const leftArm = makeArm(-1);
    const rightArm = makeArm(1);
    return { leftArm, rightArm };
}

// ============ Character Builders ============
// All builders now attach leftArm/rightArm as group.userData for typing animation

function buildRobotCharacter(color) {
    const group = new THREE.Group();
    const mat = createBodyMaterial(color);
    const eyeMat = createEyeMaterial();
    const hlMat = createHighlightMaterial(color);

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.8), mat);
    body.position.y = 0.6;
    body.userData.isBody = true;
    group.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.7), mat);
    head.position.y = 1.6;
    head.userData.isBody = true;
    group.add(head);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.1, 16, 16);
    [-0.2, 0.2].forEach(ex => {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(ex, 1.65, 0.35);
        group.add(eye);
    });

    // Antenna
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4), hlMat);
    antenna.position.y = 2.2;
    group.add(antenna);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.08), hlMat);
    ball.position.y = 2.4;
    group.add(ball);

    // Arms (animatable)
    const { leftArm, rightArm } = createArms(mat, hlMat, {
        shoulderWidth: 0.6, shoulderY: 0.9, armLength: 0.6, armWidth: 0.18,
    });
    group.add(leftArm);
    group.add(rightArm);
    group.userData.leftArm = leftArm;
    group.userData.rightArm = rightArm;

    // Legs
    const legGeo = new THREE.BoxGeometry(0.25, 0.5, 0.25);
    [-0.25, 0.25].forEach(lx => {
        const leg = new THREE.Mesh(legGeo, hlMat);
        leg.position.set(lx, -0.25, 0);
        group.add(leg);
    });

    group.scale.setScalar(0.65);
    return group;
}

function buildDogCharacter(color) {
    const group = new THREE.Group();
    const mat = createBodyMaterial(color);
    const eyeMat = createEyeMaterial();
    const hlMat = createHighlightMaterial(color);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), mat);
    body.scale.set(1, 0.85, 0.8);
    body.position.y = 0.6;
    body.userData.isBody = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), mat);
    head.position.y = 1.4;
    head.userData.isBody = true;
    group.add(head);

    // Floppy ears
    const earGeo = new THREE.BoxGeometry(0.18, 0.45, 0.1);
    const lEar = new THREE.Mesh(earGeo, hlMat);
    lEar.position.set(-0.4, 1.65, 0); lEar.rotation.z = 0.2;
    group.add(lEar);
    const rEar = new THREE.Mesh(earGeo, hlMat);
    rEar.position.set(0.4, 1.65, 0); rEar.rotation.z = -0.2;
    group.add(rEar);

    // Snout + nose
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), hlMat);
    snout.position.set(0, 1.25, 0.4);
    group.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06), eyeMat);
    nose.position.set(0, 1.3, 0.6);
    group.add(nose);

    // Eyes
    [-0.18, 0.18].forEach(ex => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), eyeMat);
        eye.position.set(ex, 1.5, 0.38);
        group.add(eye);
    });

    // Arms
    const { leftArm, rightArm } = createArms(mat, hlMat, {
        shoulderWidth: 0.5, shoulderY: 0.75, armLength: 0.5, armWidth: 0.14, handSize: 0.07,
    });
    group.add(leftArm); group.add(rightArm);
    group.userData.leftArm = leftArm; group.userData.rightArm = rightArm;

    // Legs
    [-0.25, 0.25].forEach(lx => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5), hlMat);
        leg.position.set(lx, -0.05, 0);
        group.add(leg);
    });

    // Tail
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.4), mat);
    tail.position.set(0, 0.7, -0.6); tail.rotation.x = -0.8;
    tail.userData.isBody = true;
    group.add(tail);

    group.scale.setScalar(0.6);
    return group;
}

function buildCatCharacter(color) {
    const group = new THREE.Group();
    const mat = createBodyMaterial(color);
    const eyeMat = createEyeMaterial();
    const hlMat = createHighlightMaterial(color);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 16), mat);
    body.scale.set(1, 0.9, 0.8); body.position.y = 0.55; body.userData.isBody = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), mat);
    head.position.y = 1.35; head.userData.isBody = true;
    group.add(head);

    // Pointed ears
    const earGeo = new THREE.ConeGeometry(0.15, 0.35, 4);
    [[-0.3, 0.15], [0.3, -0.15]].forEach(([ex, rz]) => {
        const ear = new THREE.Mesh(earGeo, mat);
        ear.position.set(ex, 1.75, 0); ear.rotation.z = rz;
        ear.userData.isBody = true;
        group.add(ear);
    });

    // Cat eyes (glow)
    const catEyeMat = new THREE.MeshStandardMaterial({ color: 0x44ff88, emissive: 0x22aa44, emissiveIntensity: 0.5, roughness: 0.2 });
    [-0.16, 0.16].forEach(ex => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), catEyeMat);
        eye.position.set(ex, 1.4, 0.38);
        group.add(eye);
    });

    // Nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshStandardMaterial({ color: 0xff9999 }));
    nose.position.set(0, 1.3, 0.44);
    group.add(nose);

    // Arms
    const { leftArm, rightArm } = createArms(mat, hlMat, {
        shoulderWidth: 0.45, shoulderY: 0.7, armLength: 0.45, armWidth: 0.12, handSize: 0.06,
    });
    group.add(leftArm); group.add(rightArm);
    group.userData.leftArm = leftArm; group.userData.rightArm = rightArm;

    // Legs
    [-0.22, 0.22].forEach(lx => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.45), hlMat);
        leg.position.set(lx, -0.05, 0);
        group.add(leg);
    });

    // Tail
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.6), mat);
    tail.position.set(0, 0.5, -0.55); tail.rotation.x = -1.0;
    tail.userData.isBody = true;
    group.add(tail);

    group.scale.setScalar(0.65);
    return group;
}

function buildBirdCharacter(color) {
    const group = new THREE.Group();
    const mat = createBodyMaterial(color);
    const eyeMat = createEyeMaterial();
    const hlMat = createHighlightMaterial(color);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), mat);
    body.scale.set(0.8, 1, 0.7); body.position.y = 0.5; body.userData.isBody = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), mat);
    head.position.y = 1.2; head.userData.isBody = true;
    group.add(head);

    // Beak
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 4), new THREE.MeshStandardMaterial({ color: 0xffaa33 }));
    beak.position.set(0, 1.15, 0.4); beak.rotation.x = Math.PI / 2;
    group.add(beak);

    // Eyes
    [-0.14, 0.14].forEach(ex => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), eyeMat);
        eye.position.set(ex, 1.28, 0.28);
        group.add(eye);
    });

    // Wings as arms
    const { leftArm, rightArm } = createArms(mat, hlMat, {
        shoulderWidth: 0.4, shoulderY: 0.6, armLength: 0.4, armWidth: 0.12, handSize: 0.05,
    });
    group.add(leftArm); group.add(rightArm);
    group.userData.leftArm = leftArm; group.userData.rightArm = rightArm;

    // Feet
    const footMat = new THREE.MeshStandardMaterial({ color: 0xffaa33 });
    [-0.12, 0.12].forEach(fx => {
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.3), footMat);
        foot.position.set(fx, -0.1, 0);
        group.add(foot);
    });

    group.scale.setScalar(0.7);
    return group;
}

function buildTurtleCharacter(color) {
    const group = new THREE.Group();
    const mat = createBodyMaterial(color);
    const eyeMat = createEyeMaterial();
    const hlMat = createHighlightMaterial(color);

    // Shell
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), mat);
    shell.scale.set(1, 0.55, 0.85); shell.position.y = 0.5; shell.userData.isBody = true;
    group.add(shell);

    const shellTop = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 12), hlMat);
    shellTop.scale.set(0.95, 0.5, 0.8); shellTop.position.y = 0.55;
    group.add(shellTop);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), hlMat);
    head.position.set(0, 0.6, 0.7);
    group.add(head);

    // Eyes
    [-0.1, 0.1].forEach(ex => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
        eye.position.set(ex, 0.68, 0.9);
        group.add(eye);
    });

    // Arms
    const { leftArm, rightArm } = createArms(mat, hlMat, {
        shoulderWidth: 0.5, shoulderY: 0.45, armLength: 0.35, armWidth: 0.1, handSize: 0.06,
    });
    group.add(leftArm); group.add(rightArm);
    group.userData.leftArm = leftArm; group.userData.rightArm = rightArm;

    group.scale.setScalar(0.7);
    return group;
}

function buildBearCharacter(color) {
    const group = new THREE.Group();
    const mat = createBodyMaterial(color);
    const eyeMat = createEyeMaterial();
    const hlMat = createHighlightMaterial(color);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), mat);
    body.scale.set(1, 1.1, 0.85); body.position.y = 0.65; body.userData.isBody = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), mat);
    head.position.y = 1.5; head.userData.isBody = true;
    group.add(head);

    // Round ears
    [[-0.35, 0.15], [0.35, -0.15]].forEach(([ex]) => {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), mat);
        ear.position.set(ex, 1.85, 0); ear.userData.isBody = true;
        group.add(ear);
        const innerEar = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), new THREE.MeshStandardMaterial({ color: 0xff9999 }));
        innerEar.position.set(ex, 1.85, 0.08);
        group.add(innerEar);
    });

    // Snout
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), hlMat);
    snout.position.set(0, 1.38, 0.38);
    group.add(snout);

    // Eyes + nose
    [-0.16, 0.16].forEach(ex => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), eyeMat);
        eye.position.set(ex, 1.55, 0.35);
        group.add(eye);
    });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05), eyeMat);
    nose.position.set(0, 1.42, 0.55);
    group.add(nose);

    // Arms
    const { leftArm, rightArm } = createArms(mat, hlMat, {
        shoulderWidth: 0.55, shoulderY: 0.85, armLength: 0.55, armWidth: 0.16, handSize: 0.08,
    });
    group.add(leftArm); group.add(rightArm);
    group.userData.leftArm = leftArm; group.userData.rightArm = rightArm;

    // Legs
    [-0.25, 0.25].forEach(lx => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.45), hlMat);
        leg.position.set(lx, -0.05, 0);
        group.add(leg);
    });

    group.scale.setScalar(0.55);
    return group;
}

function buildPenguinCharacter(color) {
    const group = new THREE.Group();
    const mat = createBodyMaterial(color);
    const eyeMat = createEyeMaterial();
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.5 });
    const hlMat = createHighlightMaterial(color);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), mat);
    body.scale.set(0.85, 1.1, 0.75); body.position.y = 0.55; body.userData.isBody = true;
    group.add(body);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), whiteMat);
    belly.scale.set(0.7, 0.9, 0.4); belly.position.set(0, 0.5, 0.2);
    group.add(belly);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), mat);
    head.position.y = 1.3; head.userData.isBody = true;
    group.add(head);

    [-0.13, 0.13].forEach(ex => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), eyeMat);
        eye.position.set(ex, 1.35, 0.28);
        group.add(eye);
    });

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.15, 4), new THREE.MeshStandardMaterial({ color: 0xff9933 }));
    beak.position.set(0, 1.22, 0.35); beak.rotation.x = Math.PI / 2;
    group.add(beak);

    // Flipper arms
    const { leftArm, rightArm } = createArms(mat, hlMat, {
        shoulderWidth: 0.4, shoulderY: 0.65, armLength: 0.4, armWidth: 0.1, handSize: 0.05,
    });
    group.add(leftArm); group.add(rightArm);
    group.userData.leftArm = leftArm; group.userData.rightArm = rightArm;

    // Feet
    const footMat = new THREE.MeshStandardMaterial({ color: 0xff9933 });
    [-0.15, 0.15].forEach(fx => {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.2), footMat);
        foot.position.set(fx, -0.02, 0.05);
        group.add(foot);
    });

    group.scale.setScalar(0.65);
    return group;
}

function buildShrimpCharacter(color) {
    const group = new THREE.Group();
    const mat = createBodyMaterial(color);
    const eyeMat = createEyeMaterial();
    const hlMat = createHighlightMaterial(color);

    // Curved body segments
    for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(new THREE.SphereGeometry(0.25 - i * 0.03, 12, 12), mat);
        seg.scale.set(0.8, 0.65, 0.7);
        seg.position.y = 0.8 - i * 0.22;
        seg.position.z = Math.sin(i * 0.4) * 0.15;
        seg.userData.isBody = true;
        group.add(seg);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), mat);
    head.position.y = 1.1; head.userData.isBody = true;
    group.add(head);

    // Eye stalks
    [-0.15, 0.15].forEach(ex => {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2), mat);
        stalk.position.set(ex, 1.35, 0.1); stalk.userData.isBody = true;
        group.add(stalk);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06), eyeMat);
        eye.position.set(ex, 1.45, 0.1);
        group.add(eye);
    });

    // Arms (small claws)
    const { leftArm, rightArm } = createArms(mat, hlMat, {
        shoulderWidth: 0.35, shoulderY: 0.7, armLength: 0.35, armWidth: 0.08, handSize: 0.06,
    });
    group.add(leftArm); group.add(rightArm);
    group.userData.leftArm = leftArm; group.userData.rightArm = rightArm;

    // Antennae
    const antMat = createHighlightMaterial(color);
    [-0.1, 0.1].forEach((ax, i) => {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5), antMat);
        ant.position.set(ax, 1.5, 0.15);
        ant.rotation.z = i === 0 ? 0.4 : -0.4;
        ant.rotation.x = -0.3;
        group.add(ant);
    });

    group.scale.setScalar(0.65);
    return group;
}

function buildCapybaraCharacter(color) {
    const group = new THREE.Group();
    const mat = createBodyMaterial(color);
    const eyeMat = createEyeMaterial();
    const hlMat = createHighlightMaterial(color);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 16), mat);
    body.scale.set(1, 0.8, 0.9); body.position.y = 0.5; body.userData.isBody = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), mat);
    head.scale.set(1, 0.85, 1.1); head.position.y = 1.2; head.userData.isBody = true;
    group.add(head);

    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), hlMat);
    snout.scale.set(1, 0.7, 1.2); snout.position.set(0, 1.05, 0.4);
    group.add(snout);

    // Small ears
    [-0.3, 0.3].forEach(ex => {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), mat);
        ear.position.set(ex, 1.55, 0); ear.userData.isBody = true;
        group.add(ear);
    });

    // Eyes
    [-0.15, 0.15].forEach(ex => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
        eye.position.set(ex, 1.28, 0.33);
        group.add(eye);
    });

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04), eyeMat);
    nose.position.set(0, 1.1, 0.6);
    group.add(nose);

    // Arms
    const { leftArm, rightArm } = createArms(mat, hlMat, {
        shoulderWidth: 0.5, shoulderY: 0.6, armLength: 0.4, armWidth: 0.12, handSize: 0.06,
    });
    group.add(leftArm); group.add(rightArm);
    group.userData.leftArm = leftArm; group.userData.rightArm = rightArm;

    // Legs
    [-0.3, 0.3].forEach(lx => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.3), hlMat);
        leg.position.set(lx, -0.05, 0);
        group.add(leg);
    });

    group.scale.setScalar(0.6);
    return group;
}
