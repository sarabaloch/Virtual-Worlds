"use strict";

var gl;
var points = [];
var colors = [];
var normals = [];
var emissive = [];

// Camera system for WASD + mouse look
var camera = {
    position: [0.0, 0.2, 5.0],
    yaw: -90.0,   // horizontal angle (degrees)
    pitch: 0.0,   // vertical angle (degrees)
    forward: [0, 0, -1],
    right: [1, 0, 0],
    up: [0, 1, 0]
};

// Movement state
var keys = {
    w: false, s: false, a: false, d: false,
    arrowUp: false, arrowDown: false, arrowLeft: false, arrowRight: false,
    space: false, ctrl: false
};

const MOVE_SPEED = 5.0;      // units per second
const VERTICAL_SPEED = 3.0;   // vertical movement speed
const MOUSE_SENSITIVITY = 0.2; // degrees per pixel

// Mouse capture state
var mouseLocked = false;

// Chunk system
const CHUNK_SIZE = 10;
let currentChunkX = null;
let currentChunkZ = null;

// Light: sun directly above (90 degrees elevation).
var lightDir = normalize([0.0, 1.0, 0.0]);
var sunPos = [camera.position[0], 7.5, camera.position[2]];
let sunCreated = false;
let sunVertexStart = 0; // Track where sun vertices start
let sunVertexCount = 0; // Track how many vertices the sun uses

var program;
var lastTimestamp = 0;

window.onload = function init() {
    var canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) { alert("WebGL isn't available"); }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.55, 0.75, 0.95, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // Generate initial terrain
    regenerateTerrain(false); // false = don't add sun yet

    // Create sun ONCE at initialization, keep it permanently
    if (!sunCreated) {
        // Keep sun centered above player
        sunPos = [camera.position[0], 7.5, camera.position[2]];
        sunVertexStart = points.length; // Record where sun starts
        createSun(sunPos[0], sunPos[1], sunPos[2], 0.7);
        sunVertexCount = points.length - sunVertexStart; // Count sun vertices
        sunCreated = true;
        sendToGPU();
    }

    // Setup keyboard event listeners
    window.addEventListener('keydown', function(event) {
        const key = event.key.toLowerCase();
        
        // WASD movement keys
        if (key === 'w') keys.w = true;
        if (key === 's') keys.s = true;
        if (key === 'a') keys.a = true;
        if (key === 'd') keys.d = true;
        
        // Arrow keys for looking around
        if (key === 'arrowup')    { keys.arrowUp    = true; event.preventDefault(); }
        if (key === 'arrowdown')  { keys.arrowDown  = true; event.preventDefault(); }
        if (key === 'arrowleft')  { keys.arrowLeft  = true; event.preventDefault(); }
        if (key === 'arrowright') { keys.arrowRight = true; event.preventDefault(); }

        // Vertical movement
        if (event.code === 'Space')   { keys.space = true;  event.preventDefault(); }
        if (key === 'control')        { keys.ctrl  = true;  event.preventDefault(); }
    });
    
    window.addEventListener('keyup', function(event) {
        const key = event.key.toLowerCase();
        if (key === 'w') keys.w = false;
        if (key === 's') keys.s = false;
        if (key === 'a') keys.a = false;
        if (key === 'd') keys.d = false;
        if (key === 'arrowup')    keys.arrowUp    = false;
        if (key === 'arrowdown')  keys.arrowDown  = false;
        if (key === 'arrowleft')  keys.arrowLeft  = false;
        if (key === 'arrowright') keys.arrowRight = false;
        if (event.code === 'Space') keys.space = false;
        if (key === 'control')      keys.ctrl  = false;
    });
    
    // Mouse look: capture and hide cursor on click
    canvas.addEventListener('click', function() {
        canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
        canvas.requestPointerLock();
    });
    
    // Handle pointer lock change
    document.addEventListener('pointerlockchange', lockChange);
    document.addEventListener('mozpointerlockchange', lockChange);
    
    function lockChange() {
        if (document.pointerLockElement === canvas) {
            mouseLocked = true;
            console.log("Mouse locked - move mouse to look around 360°");
            document.addEventListener('mousemove', onMouseMove);
        } else {
            mouseLocked = false;
            console.log("Mouse unlocked - click canvas to re-enable");
            document.removeEventListener('mousemove', onMouseMove);
        }
    }
    
    function onMouseMove(e) {
        if (!mouseLocked) return;
        
        // Get mouse movement
        var deltaX = e.movementX || e.mozMovementX || 0;
        var deltaY = e.movementY || e.mozMovementY || 0;
        
        // Update yaw (horizontal rotation) and pitch (vertical rotation)
        camera.yaw += deltaX * MOUSE_SENSITIVITY;
        camera.pitch -= deltaY * MOUSE_SENSITIVITY;
        
        // Clamp pitch to prevent looking upside down
        if (camera.pitch > 89.0) camera.pitch = 89.0;
        if (camera.pitch < -89.0) camera.pitch = -89.0;
        
        // Update forward and right vectors based on new angles
        updateCameraVectors();
    }
    
    // Initialize camera vectors
    updateCameraVectors();
    
    // Start render loop with time-based movement
    lastTimestamp = performance.now();
    render();
};

function flattenScalars(arr) {
    return new Float32Array(arr);
}

// Update camera direction vectors based on yaw and pitch
function updateCameraVectors() {
    // Convert to radians
    var yawRad = camera.yaw * Math.PI / 180;
    var pitchRad = camera.pitch * Math.PI / 180;
    
    // Calculate forward vector
    camera.forward[0] = Math.cos(yawRad) * Math.cos(pitchRad);
    camera.forward[1] = Math.sin(pitchRad);
    camera.forward[2] = Math.sin(yawRad) * Math.cos(pitchRad);
    
    // Normalize forward
    var len = Math.sqrt(camera.forward[0]*camera.forward[0] + 
                        camera.forward[1]*camera.forward[1] + 
                        camera.forward[2]*camera.forward[2]);
    camera.forward[0] /= len;
    camera.forward[1] /= len;
    camera.forward[2] /= len;
    
    // Calculate right vector (cross product of forward and global up)
    camera.right[0] = camera.forward[2];
    camera.right[1] = 0;
    camera.right[2] = -camera.forward[0];
    len = Math.sqrt(camera.right[0]*camera.right[0] + camera.right[2]*camera.right[2]);
    if (len > 0) {
        camera.right[0] /= len;
        camera.right[2] /= len;
    }
}

// Update camera position based on WASD and arrow key input (time-based movement)
function updateMovement(deltaTime) {
    var speed = (MOVE_SPEED * 0.5) * deltaTime; // Slower movement speed as requested
    var moveDelta = [0, 0, 0];
    
    // W = forward, S = backward (relative to look direction, XZ only)
    if (keys.w) {
        moveDelta[0] += camera.forward[0] * speed;
        moveDelta[2] += camera.forward[2] * speed;
    }
    if (keys.s) {
        moveDelta[0] -= camera.forward[0] * speed;
        moveDelta[2] -= camera.forward[2] * speed;
    }
    // A = strafe right, D = strafe left
    if (keys.a) {
        moveDelta[0] += camera.right[0] * speed;
        moveDelta[2] += camera.right[2] * speed;
    }
    if (keys.d) {
        moveDelta[0] -= camera.right[0] * speed;
        moveDelta[2] -= camera.right[2] * speed;
    }

    // Vertical movement — Space = up, Ctrl = down
    var vSpeed = VERTICAL_SPEED * deltaTime;
    if (keys.space) moveDelta[1] += vSpeed;
    if (keys.ctrl)  moveDelta[1] -= vSpeed;
    
    // Apply movement
    let newX = camera.position[0] + moveDelta[0];
    let newY = camera.position[1] + moveDelta[1];
    let newZ = camera.position[2] + moveDelta[2];
    
    // Get terrain height at new position
    let terrainHeight = getHeight(newX, newZ);
    
    // Prevent going below the surface (keep camera at least 0.5 units above ground)
    if (newY < terrainHeight + 0.5) {
        newY = terrainHeight + 0.5;
    }
    
    camera.position[0] = newX;
    camera.position[1] = newY;
    camera.position[2] = newZ;
}

// ================= HEIGHT =================
function getHeight(x, z) {
    return (
        Math.sin(x * 1.2) * Math.cos(z * 1.2) * 0.22 +
        Math.sin(x * 2.5 + z * 1.5) * 0.05 +
        Math.sin(x * 6.0) * Math.cos(z * 6.0) * 0.015
    ) - 0.5;
}

// ================= FIXED RANDOM =================
function pseudoRandom(x, z) {
    return Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
}

// ================= TERRAIN =================
function generateTerrain(chunkX, chunkZ) {
    const SIZE = 40;
    const STEP = 0.25;

    let offsetX = chunkX * CHUNK_SIZE;
    let offsetZ = chunkZ * CHUNK_SIZE;

    for (let i = -SIZE/2; i < SIZE/2; i++) {
        for (let j = -SIZE/2; j < SIZE/2; j++) {
            let x = offsetX + i * STEP;
            let z = offsetZ + j * STEP;
            
            let a = [x, getHeight(x, z), z];
            let b = [x + STEP, getHeight(x + STEP, z), z];
            let c = [x, getHeight(x, z + STEP), z + STEP];
            let d = [x + STEP, getHeight(x + STEP, z + STEP), z + STEP];
            
            let n1 = computeNormal(a, b, c);
            let n2 = computeNormal(b, d, c);
            
            let h = getHeight(x, z);
            let shade = 0.25 + h * 0.15;
            
            let baseColor = [
                0.10 + shade * 0.2,
                0.30 + shade * 0.6,
                0.10 + shade * 0.2
            ];
            
            pushTri(a, b, c, n1, baseColor);
            pushTri(b, d, c, n2, baseColor);
            
            let r = pseudoRandom(x, z);
            
            if (r < 0.05) {
                createTree(x, getHeight(x, z), z);
            }
            
            if (r > 0.93) {
                createRock(x, getHeight(x, z), z);
            }
        }
    }
}

// ================= REGENERATE =================
function regenerateTerrain(skipSun) {
    let newChunkX = Math.floor(camera.position[0] / CHUNK_SIZE);
    let newChunkZ = Math.floor(camera.position[2] / CHUNK_SIZE);
    
    if (newChunkX === currentChunkX && newChunkZ === currentChunkZ) return;
    
    currentChunkX = newChunkX;
    currentChunkZ = newChunkZ;
    
    // Clear everything
    points = [];
    colors = [];
    normals = [];
    emissive = [];
    
    // Generate new terrain
    for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
            generateTerrain(currentChunkX + dx, currentChunkZ + dz);
        }
    }
    
    // Always rebuild sun at current camera position
    if (sunCreated && !skipSun || sunCreated) {
        sunPos = [camera.position[0], 7.5, camera.position[2]];
        sunVertexStart = points.length;
        createSun(sunPos[0], sunPos[1], sunPos[2], 0.7);
        sunVertexCount = points.length - sunVertexStart;
    }
    
    sendToGPU();
}

// ================= TRI =================
function pushTri(a, b, c, n, col, emitStrength) {
    let e = (emitStrength === undefined) ? 0.0 : emitStrength;
    points.push(a, b, c);
    normals.push(n, n, n);
    colors.push(col, col, col);
    emissive.push(e, e, e);
}

// ================= ROCK =================
function createRock(x, y, z) {
    let size = 0.08 + pseudoRandom(x, z) * 0.18;
    let sides = 10;
    let verts = [];
    for (let i = 0; i < sides; i++) {
        let theta = (i / sides) * Math.PI * 2;
        let phi = pseudoRandom(x+i, z) * Math.PI;
        verts.push([
            x + Math.sin(phi) * Math.cos(theta) * size,
            y + Math.cos(phi) * size,
            z + Math.sin(phi) * Math.sin(theta) * size
        ]);
    }
    let top = [x, y + size * 1.2, z];
    let bottom = [x, y - size * 0.8, z];
    
    for (let i = 0; i < sides; i++) {
        let a = verts[i];
        let b = verts[(i+1)%sides];
        let n1 = computeNormal(a,b,top);
        let n2 = computeNormal(b,a,bottom);
        pushTri(a,b,top,n1,[0.18,0.18,0.20]);
        pushTri(b,a,bottom,n2,[0.13,0.13,0.15]);
    }
}

// ================= TREE =================
function createTree(cx, cy, cz) {
    let rand1 = pseudoRandom(cx, cz);
    let rand2 = pseudoRandom(cx+1, cz+1);
    let rand3 = pseudoRandom(cx+2, cz+2);
    let rand4 = pseudoRandom(cx+3, cz+3);
    let rand5 = pseudoRandom(cx+4, cz+4);

    let brown = [0.28 + rand3*0.14, 0.16 + rand3*0.10, 0.07 + rand3*0.06];
    let sides = 8;

    // Pick tree archetype from 3 shapes
    let archetype = Math.floor(rand5 * 3); // 0=spire, 1=bushy, 2=twisted

    let trunkH, trunkR, layers, baseRadius, coneH, overlap, tipSharpness, radiusCurve;

    if (archetype === 0) {
        // SPIRE — tall, narrow, many tight layers, sharp tips
        trunkH      = 0.8 + rand1 * 0.6;
        trunkR      = 0.035 + rand2 * 0.025;
        layers      = 6 + Math.floor(rand4 * 3);
        baseRadius  = 0.22 + rand1 * 0.08;
        coneH       = 0.22 + rand2 * 0.06;
        overlap     = 0.10;
        tipSharpness = 0.70; // radius shrinks fast toward top
        radiusCurve  = 1.0;  // linear
    } else if (archetype === 1) {
        // BUSHY — short, wide, fewer layers that flare outward at the bottom
        trunkH      = 0.35 + rand1 * 0.25;
        trunkR      = 0.06 + rand2 * 0.05;
        layers      = 3 + Math.floor(rand4 * 2);
        baseRadius  = 0.55 + rand1 * 0.20;
        coneH       = 0.38 + rand2 * 0.10;
        overlap     = 0.18;
        tipSharpness = 0.40; // stays wide all the way up
        radiusCurve  = 0.7;  // flattened falloff
    } else {
        // TWISTED — lopsided, asymmetric offsets per layer, medium height
        trunkH      = 0.55 + rand1 * 0.45;
        trunkR      = 0.045 + rand2 * 0.04;
        layers      = 4 + Math.floor(rand4 * 3);
        baseRadius  = 0.30 + rand1 * 0.18;
        coneH       = 0.28 + rand2 * 0.12;
        overlap     = 0.08;
        tipSharpness = 0.55;
        radiusCurve  = 1.0;
    }

    // Trunk
    for (let i = 0; i < sides; i++) {
        let a  = (i / sides) * Math.PI * 2;
        let b  = ((i+1) / sides) * Math.PI * 2;
        let p1 = [cx + Math.cos(a)*trunkR,       cy,          cz + Math.sin(a)*trunkR];
        let p2 = [cx + Math.cos(b)*trunkR,       cy,          cz + Math.sin(b)*trunkR];
        let p3 = [cx + Math.cos(a)*trunkR*0.7,   cy + trunkH, cz + Math.sin(a)*trunkR*0.7];
        let p4 = [cx + Math.cos(b)*trunkR*0.7,   cy + trunkH, cz + Math.sin(b)*trunkR*0.7];
        pushTri(p1, p2, p3, computeNormal(p1,p2,p3), brown);
        pushTri(p2, p4, p3, computeNormal(p2,p4,p3), brown);
    }

    // Canopy layers
    for (let l = 0; l < layers; l++) {
        let t       = l / (layers - 1);
        let layerY  = cy + trunkH + l * (coneH - overlap);
        let r       = baseRadius * (1.0 - Math.pow(t, radiusCurve) * tipSharpness);
        let tipY    = layerY + coneH;

        // Twisted trees: offset each layer's tip slightly for a leaning look
        let offX = 0, offZ = 0;
        if (archetype === 2) {
            offX = pseudoRandom(cx + l*7.3, cz + l*2.1) * 0.12 - 0.06;
            offZ = pseudoRandom(cx + l*3.7, cz + l*8.9) * 0.12 - 0.06;
        }
        let tip = [cx + offX, tipY, cz + offZ];

        let brightness  = 0.76 + t * 0.24;
        let greenShift  = rand3 * 0.10;
        // Bushy trees lean more yellow-green, spires more blue-green
        let blueShift   = (archetype === 0) ? 0.06 : 0.0;
        let layerColor  = [
            (0.09 + greenShift) * brightness,
            (0.46 + rand1*0.13) * brightness,
            (0.13 + greenShift + blueShift) * brightness
        ];
        let underColor  = [layerColor[0]*0.48, layerColor[1]*0.50, layerColor[2]*0.48];

        for (let i = 0; i < sides; i++) {
            let a  = (i / sides) * Math.PI * 2;
            let b  = ((i+1) / sides) * Math.PI * 2;
            let p1 = [cx + Math.cos(a)*r, layerY, cz + Math.sin(a)*r];
            let p2 = [cx + Math.cos(b)*r, layerY, cz + Math.sin(b)*r];
            pushTri(p1, p2, tip, computeNormal(p1, p2, tip), layerColor);
            let center = [cx, layerY, cz];
            pushTri(p2, p1, center, computeNormal(p2, p1, center), underColor);
        }
    }

    createTreeShadow(cx, cy, cz, baseRadius * 0.85);
}

function createTreeShadow(x, y, z, radius) {
    let shadowColor = [0.06, 0.07, 0.06];
    let yOffset = y + 0.012;
    let sides = 12;
    let center = [x, yOffset, z];
    
    for (let i = 0; i < sides; i++) {
        let a0 = (i / sides) * Math.PI * 2.0;
        let a1 = ((i + 1) / sides) * Math.PI * 2.0;
        
        let p1 = [x + Math.cos(a0) * radius, yOffset, z + Math.sin(a0) * radius];
        let p2 = [x + Math.cos(a1) * radius, yOffset, z + Math.sin(a1) * radius];
        
        pushTri(center, p1, p2, [0, 1, 0], shadowColor);
    }
}

function createSun(cx, cy, cz, radius) {
    let latSteps = 8;
    let lonSteps = 12;
    let sunColor = [1.0, 0.92, 0.55];
    let haloColor = [1.0, 0.75, 0.35];
    
    for (let lat = 0; lat < latSteps; lat++) {
        let t0 = (lat / latSteps) * Math.PI;
        let t1 = ((lat + 1) / latSteps) * Math.PI;
        
        for (let lon = 0; lon < lonSteps; lon++) {
            let p0 = (lon / lonSteps) * 2.0 * Math.PI;
            let p1 = ((lon + 1) / lonSteps) * 2.0 * Math.PI;
            
            let a = [
                cx + radius * Math.sin(t0) * Math.cos(p0),
                cy + radius * Math.cos(t0),
                cz + radius * Math.sin(t0) * Math.sin(p0)
            ];
            let b = [
                cx + radius * Math.sin(t1) * Math.cos(p0),
                cy + radius * Math.cos(t1),
                cz + radius * Math.sin(t1) * Math.sin(p0)
            ];
            let c = [
                cx + radius * Math.sin(t1) * Math.cos(p1),
                cy + radius * Math.cos(t1),
                cz + radius * Math.sin(t1) * Math.sin(p1)
            ];
            let d = [
                cx + radius * Math.sin(t0) * Math.cos(p1),
                cy + radius * Math.cos(t0),
                cz + radius * Math.sin(t0) * Math.sin(p1)
            ];
            
            pushTri(a, b, c, computeNormal(a, b, c), sunColor, 1.0);
            pushTri(a, c, d, computeNormal(a, c, d), sunColor, 1.0);
            
            // Outer shell for visible glow/aura
            let g = 2.8;
            let ag = [cx + (a[0] - cx) * g, cy + (a[1] - cy) * g, cz + (a[2] - cz) * g];
            let bg = [cx + (b[0] - cx) * g, cy + (b[1] - cy) * g, cz + (b[2] - cz) * g];
            let cg = [cx + (c[0] - cx) * g, cy + (c[1] - cy) * g, cz + (c[2] - cz) * g];
            let dg = [cx + (d[0] - cx) * g, cy + (d[1] - cy) * g, cz + (d[2] - cz) * g];
            
            pushTri(ag, bg, cg, computeNormal(ag, bg, cg), haloColor, 0.35);
            pushTri(ag, cg, dg, computeNormal(ag, cg, dg), haloColor, 0.35);
        }
    }
    createSunRays(cx, cy, cz, radius * 1.2, radius * 5.0, 18);
}

function createSunRays(cx, cy, cz, innerR, outerR, rayCount) {
    let rayColor = [1.0, 0.82, 0.32];
    
    for (let i = 0; i < rayCount; i++) {
        let a0 = (i / rayCount) * Math.PI * 2.0;
        let a1 = ((i + 0.42) / rayCount) * Math.PI * 2.0;
        
        let yTilt0 = 0.15 * Math.sin(i * 2.4);
        let yTilt1 = 0.15 * Math.cos(i * 2.1);
        
        let inner = [
            cx + Math.cos(a0) * innerR,
            cy + yTilt0 * innerR,
            cz + Math.sin(a0) * innerR
        ];
        
        let outerA = [
            cx + Math.cos(a0) * outerR,
            cy + yTilt0 * outerR,
            cz + Math.sin(a0) * outerR
        ];
        
        let outerB = [
            cx + Math.cos(a1) * (outerR * 0.72),
            cy + yTilt1 * (outerR * 0.72),
            cz + Math.sin(a1) * (outerR * 0.72)
        ];
        
        let n = computeNormal(inner, outerA, outerB);
        pushTri(inner, outerA, outerB, n, rayColor, 0.22);
    }
}

// ================= GPU =================
function sendToGPU() {
    let cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);
    
    let vColor = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);
    
    let vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);
    
    let vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);
    
    let nBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normals), gl.STATIC_DRAW);
    
    let vNormal = gl.getAttribLocation(program, "vNormal");
    gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vNormal);
    
    let eBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, eBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flattenScalars(emissive), gl.STATIC_DRAW);
    
    let vEmissive = gl.getAttribLocation(program, "vEmissive");
    gl.vertexAttribPointer(vEmissive, 1, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vEmissive);
    
    let lightLoc = gl.getUniformLocation(program, "lightDir");
    if (lightLoc) gl.uniform3fv(lightLoc, flatten(lightDir));
    
    let sunLoc = gl.getUniformLocation(program, "sunPos");
    if (sunLoc) gl.uniform3fv(sunLoc, flatten(sunPos));
}

// ================= RENDER =================

function render() {
    let now = performance.now();
    let deltaTime = Math.min(0.033, (now - lastTimestamp) / 1000);
    lastTimestamp = now;

    // Arrow keys: look up/down (pitch) and look left/right (yaw)
    const rotationSpeed = 50.0 * deltaTime; // Degrees per second
    if (keys.arrowUp)    camera.pitch += rotationSpeed;
    if (keys.arrowDown)  camera.pitch -= rotationSpeed;
    if (keys.arrowLeft)  camera.yaw   -= rotationSpeed;
    if (keys.arrowRight) camera.yaw   += rotationSpeed;

    // Keep pitch clamped
    camera.pitch = Math.max(-89, Math.min(89, camera.pitch));

    updateCameraVectors();
    sunPos = [camera.position[0], 40, camera.position[2]];
    
    // Update movement based on pressed keys
    updateMovement(deltaTime);
    
    // Regenerate terrain based on new camera position (preserving sun)
    regenerateTerrain(true);
    
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    let p = perspective(75, gl.canvas.width / gl.canvas.height, 0.1, 100.0);
    
    // Create view matrix from camera orientation
    let target = [
        camera.position[0] + camera.forward[0],
        camera.position[1] + camera.forward[1],
        camera.position[2] + camera.forward[2]
    ];
    
    let mv = lookAt(camera.position, target, camera.up);
    
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "modelViewMatrix"), false, flatten(mv));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(p));
    
    gl.uniform1f(gl.getUniformLocation(program, "fogDensity"), 0.12);
    let sunLoc = gl.getUniformLocation(program, "sunPos");
    if (sunLoc) gl.uniform3fv(sunLoc, flatten(sunPos));
    
    gl.drawArrays(gl.TRIANGLES, 0, points.length);
    
    requestAnimFrame(render);
}