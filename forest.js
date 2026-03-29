"use strict";

// global variables
var gl;
var points = [];
var colors = [];
var normals = [];
var emissive = [];

// camera state
var camera = {
    position: [0.0, 0.2, 5.0], // start slightly above ground to avoid immediate collision
    yaw: -90.0,   // facing towards negative Z
    pitch: 0.0, // level with horizon
    forward: [0, 0, -1], // will be calculated from yaw/pitch
    right: [1, 0, 0], // will be calculated from forward
    up: [0, 1, 0] // world up is always Y-axis
};

// input keys
var keys = {
    w: false, s: false, a: false, d: false,
    arrowUp: false, arrowDown: false, arrowLeft: false, arrowRight: false,
    space: false, ctrl: false
};

// movement parameters
const MOVE_SPEED = 5.0; // how fast u move forward/back
const VERTICAL_SPEED = 3.0; // how fast u move up or down
const MOUSE_SENSITIVITY = 0.2; // how fast camera rotates based on mouse movement

var mouseLocked = false;
const CHUNK_SIZE = 10; // how big each terrain chunk is in world units
let currentChunkX = null; // which chunk the camera is currently in (used for terrain generation)
let currentChunkZ = null; 

var lightDir = normalize([0.0, 1.0, 0.0]); // default light direction (overridden by presets)
var program; 
var lastTimestamp = 0; // for tracking time between frames

// precompute a few lighting presets for different times of day
window.onload = function init() { // initialize WebGL context, set up event listeners, and start render loop
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

    regenerateTerrain(false); 

    // set up keyboard input listeners for movement and looking around
    window.addEventListener('keydown', function(event) {
        const key = event.key.toLowerCase();
        
        if (key === 'w') keys.w = true;
        if (key === 's') keys.s = true;
        if (key === 'a') keys.a = true;
        if (key === 'd') keys.d = true;
        
        if (key === 'arrowup')    { keys.arrowUp    = true; event.preventDefault(); }
        if (key === 'arrowdown')  { keys.arrowDown  = true; event.preventDefault(); }
        if (key === 'arrowleft')  { keys.arrowLeft  = true; event.preventDefault(); }
        if (key === 'arrowright') { keys.arrowRight = true; event.preventDefault(); }

        if (event.code === 'Space')   { keys.space = true;  event.preventDefault(); }
        if (key === 'control')        { keys.ctrl  = true;  event.preventDefault(); }
    });
    
    // release keys on keyup
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
    
    // set up mouse click listener to lock pointer for camera control
    canvas.addEventListener('click', function() {
        canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock; 
        canvas.requestPointerLock(); // this will trigger pointerlockchange event when done
    });
    
    // listen for pointer lock changes to enable/disable mouse movement tracking
    document.addEventListener('pointerlockchange', lockChange);
    document.addEventListener('mozpointerlockchange', lockChange); // (things added for firefox support)
    
    // function to handle pointer lock state changes - when locked, we track mouse movement for camera control; when unlocked, we stop tracking
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

    // function to handle mouse movement events when pointer is locked - updates camera yaw and pitch based on mouse movement, with sensitivity scaling. also clamps pitch to prevent flipping over
    function onMouseMove(e) {
        if (!mouseLocked) return;
        
        var deltaX = e.movementX || e.mozMovementX || 0;
        var deltaY = e.movementY || e.mozMovementY || 0;
        
        camera.yaw += deltaX * MOUSE_SENSITIVITY;
        camera.pitch -= deltaY * MOUSE_SENSITIVITY;
        
        if (camera.pitch > 89.0) camera.pitch = 89.0;
        if (camera.pitch < -89.0) camera.pitch = -89.0;
        
        updateCameraVectors();
    }
    
    updateCameraVectors();
    
    lastTimestamp = performance.now();
    render();
};

// function to flatten array of vec3 into float32array for webGL buffer data
function flattenScalars(arr) {
    return new Float32Array(arr);
}

// function to update camera forward and right vectors based on current yaw and pitch angles. calculates forward vector from spherical coordinates, then derives right vector as perpendicular to forward and world up. also normalizes both vectors to ensure consistent movement speed in all directions.
function updateCameraVectors() {
    var yawRad = camera.yaw * Math.PI / 180;
    var pitchRad = camera.pitch * Math.PI / 180;
    
    camera.forward[0] = Math.cos(yawRad) * Math.cos(pitchRad);
    camera.forward[1] = Math.sin(pitchRad);
    camera.forward[2] = Math.sin(yawRad) * Math.cos(pitchRad);
    
    var len = Math.sqrt(camera.forward[0]*camera.forward[0] + 
                        camera.forward[1]*camera.forward[1] + 
                        camera.forward[2]*camera.forward[2]);
    camera.forward[0] /= len;
    camera.forward[1] /= len;
    camera.forward[2] /= len;
    
    camera.right[0] = camera.forward[2];
    camera.right[1] = 0;
    camera.right[2] = -camera.forward[0];
    len = Math.sqrt(camera.right[0]*camera.right[0] + camera.right[2]*camera.right[2]);
    if (len > 0) {
        camera.right[0] /= len;
        camera.right[2] /= len;
    }
}

// function to update camera position based on currently pressed movement keys (WASD for horizontal movement, space/ctrl for vertical). calculates movement based on camera forward and right vectors, applies speed scaling and deltatime for frame rate independence. also checks terrain height at new position to prevent sinking below ground level.
function updateMovement(deltaTime) {
    var speed = (MOVE_SPEED * 0.5) * deltaTime;
    var moveDelta = [0, 0, 0];
    
    if (keys.w) {
        moveDelta[0] += camera.forward[0] * speed;
        moveDelta[2] += camera.forward[2] * speed;
    }
    if (keys.s) {
        moveDelta[0] -= camera.forward[0] * speed;
        moveDelta[2] -= camera.forward[2] * speed;
    }
    if (keys.a) {
        moveDelta[0] += camera.right[0] * speed;
        moveDelta[2] += camera.right[2] * speed;
    }
    if (keys.d) {
        moveDelta[0] -= camera.right[0] * speed;
        moveDelta[2] -= camera.right[2] * speed;
    }

    var vSpeed = VERTICAL_SPEED * deltaTime;
    if (keys.space) moveDelta[1] += vSpeed;
    if (keys.ctrl)  moveDelta[1] -= vSpeed;
    
    let newX = camera.position[0] + moveDelta[0];
    let newY = camera.position[1] + moveDelta[1];
    let newZ = camera.position[2] + moveDelta[2];
    
    let terrainHeight = getHeight(newX, newZ);
    
    if (newY < terrainHeight + 0.5) {
        newY = terrainHeight + 0.5;
    }
    
    camera.position[0] = newX;
    camera.position[1] = newY;
    camera.position[2] = newZ;
}

// procedural height function that generates terrain height based on a combination of sine and cosine waves at different frequencies and amplitudes. this creates a varied landscape with hills and valleys. the final result is offset downwards to ensure the terrain is mostly below y=0, allowing the camera to start above ground level. (asked ai for help with this)
function getHeight(x, z) {
    return (
        Math.sin(x * 1.2) * Math.cos(z * 1.2) * 0.22 +
        Math.sin(x * 2.5 + z * 1.5) * 0.05 +
        Math.sin(x * 6.0) * Math.cos(z * 6.0) * 0.015
    ) - 0.5;
}

// simple pseudo-random function based on sine of a combination of x and z coordinates. this is used to add random variation to tree placement and rock generation while still being deterministic (the same x,z will always produce the same random value). the output is a value between 0 and 1.
function pseudoRandom(x, z) {
    return Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
}

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

function regenerateTerrain(skipSun) {
    let newChunkX = Math.floor(camera.position[0] / CHUNK_SIZE);
    let newChunkZ = Math.floor(camera.position[2] / CHUNK_SIZE);
    
    if (newChunkX === currentChunkX && newChunkZ === currentChunkZ) return;
    
    currentChunkX = newChunkX;
    currentChunkZ = newChunkZ;
    
    points = [];
    colors = [];
    normals = [];
    emissive = [];
    
    for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
            generateTerrain(currentChunkX + dx, currentChunkZ + dz);
        }
    }
    
    sendToGPU();
}

function pushTri(a, b, c, n, col, emitStrength) {
    let e = (emitStrength === undefined) ? 0.0 : emitStrength;
    points.push(a, b, c);
    normals.push(n, n, n);
    colors.push(col, col, col);
    emissive.push(e, e, e);
}

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

function createTree(cx, cy, cz) {
    let rand1 = pseudoRandom(cx, cz);
    let rand2 = pseudoRandom(cx+1, cz+1);
    let rand3 = pseudoRandom(cx+2, cz+2);
    let rand4 = pseudoRandom(cx+3, cz+3);
    let rand5 = pseudoRandom(cx+4, cz+4);

    let brown = [0.28 + rand3*0.14, 0.16 + rand3*0.10, 0.07 + rand3*0.06];
    let sides = 8;

    let archetype = Math.floor(rand5 * 3); // 0=spire, 1=bushy, 2=twisted

    let trunkH, trunkR, layers, baseRadius, coneH, overlap, tipSharpness, radiusCurve;

    if (archetype === 0) {
        trunkH      = 0.8 + rand1 * 0.6;
        trunkR      = 0.035 + rand2 * 0.025;
        layers      = 6 + Math.floor(rand4 * 3);
        baseRadius  = 0.22 + rand1 * 0.08;
        coneH       = 0.22 + rand2 * 0.06;
        overlap     = 0.10;
        tipSharpness = 0.70;
        radiusCurve  = 1.0;  
    } else if (archetype === 1) {
        trunkH      = 0.35 + rand1 * 0.25;
        trunkR      = 0.06 + rand2 * 0.05;
        layers      = 3 + Math.floor(rand4 * 2);
        baseRadius  = 0.55 + rand1 * 0.20;
        coneH       = 0.38 + rand2 * 0.10;
        overlap     = 0.18;
        tipSharpness = 0.40; 
        radiusCurve  = 0.7;  
    } else {
        trunkH      = 0.55 + rand1 * 0.45;
        trunkR      = 0.045 + rand2 * 0.04;
        layers      = 4 + Math.floor(rand4 * 3);
        baseRadius  = 0.30 + rand1 * 0.18;
        coneH       = 0.28 + rand2 * 0.12;
        overlap     = 0.08;
        tipSharpness = 0.55;
        radiusCurve  = 1.0;
    }

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

    for (let l = 0; l < layers; l++) {
        let t       = l / (layers - 1);
        let layerY  = cy + trunkH + l * (coneH - overlap);
        let r       = baseRadius * (1.0 - Math.pow(t, radiusCurve) * tipSharpness);
        let tipY    = layerY + coneH;

        let offX = 0, offZ = 0;
        if (archetype === 2) {
            offX = pseudoRandom(cx + l*7.3, cz + l*2.1) * 0.12 - 0.06;
            offZ = pseudoRandom(cx + l*3.7, cz + l*8.9) * 0.12 - 0.06;
        }
        let tip = [cx + offX, tipY, cz + offZ];

        let brightness  = 0.76 + t * 0.24;
        let greenShift  = rand3 * 0.10;
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
    
}

var lightingPresets = {
    daytime: {
        lightDir:     [0.2,  1.0, -1.8],
        sunTintHigh:  [1.28, 1.15, 0.82],
        sunTintMid:   [0.95, 0.98, 0.88],
        sunTintShadow:[0.55, 0.72, 1.0],
        ambientColor: [0.38, 0.52, 0.62],
        fogColor:     [0.62, 0.74, 0.82],
        fogA: 0.004, fogB: 0.04,
        darkness: 1.0, shadowDepth: 0.32,
        skyColor:     [0.55, 0.75, 0.95]
    },
    goldenHour: {
        lightDir:     [1.6,  0.3, -1.0],
        sunTintHigh:  [1.5,  1.1,  0.55],
        sunTintMid:   [1.2,  0.85, 0.45],
        sunTintShadow:[0.35, 0.30, 0.55],
        ambientColor: [0.6,  0.35, 0.20],
        fogColor:     [0.90, 0.60, 0.30],
        fogA: 0.006, fogB: 0.06,
        darkness: 1.0, shadowDepth: 0.25,
        skyColor:     [0.95, 0.65, 0.25]
    },
    blueHour: {
        lightDir:     [0.3,  0.15,-1.2],
        sunTintHigh:  [0.65, 0.75, 1.10],
        sunTintMid:   [0.50, 0.60, 0.95],
        sunTintShadow:[0.25, 0.30, 0.65],
        ambientColor: [0.30, 0.38, 0.70],
        fogColor:     [0.30, 0.38, 0.65],
        fogA: 0.007, fogB: 0.07,
        darkness: 0.75, shadowDepth: 0.20,
        skyColor:     [0.18, 0.22, 0.52]
    },
    sunrise: {
        lightDir:     [-1.8, 0.25,-0.4],
        sunTintHigh:  [1.55, 0.95, 0.55],
        sunTintMid:   [1.1,  0.70, 0.45],
        sunTintShadow:[0.30, 0.28, 0.55],
        ambientColor: [0.55, 0.32, 0.22],
        fogColor:     [1.0,  0.72, 0.50],
        fogA: 0.008, fogB: 0.07,
        darkness: 0.90, shadowDepth: 0.22,
        skyColor:     [1.0,  0.60, 0.30]
    },
    sunset: {
        lightDir:     [1.8,  0.18, 0.5],
        sunTintHigh:  [1.6,  0.80, 0.35],
        sunTintMid:   [1.2,  0.60, 0.30],
        sunTintShadow:[0.28, 0.22, 0.50],
        ambientColor: [0.55, 0.28, 0.18],
        fogColor:     [0.95, 0.50, 0.25],
        fogA: 0.009, fogB: 0.08,
        darkness: 0.88, shadowDepth: 0.20,
        skyColor:     [0.90, 0.40, 0.15]
    },
    nighttime: {
        lightDir:     [0.2,  1.0, -0.5],
        sunTintHigh:  [0.30, 0.35, 0.60],
        sunTintMid:   [0.18, 0.22, 0.45],
        sunTintShadow:[0.08, 0.10, 0.25],
        ambientColor: [0.15, 0.18, 0.40],
        fogColor:     [0.04, 0.05, 0.15],
        fogA: 0.01,  fogB: 0.09,
        darkness: 0.38, shadowDepth: 0.10,
        skyColor:     [0.03, 0.04, 0.12]
    }
};

var currentPreset = lightingPresets.daytime;

function setPreset(name) {
    currentPreset = lightingPresets[name];
    let sc = currentPreset.skyColor;
    gl.clearColor(sc[0], sc[1], sc[2], 1.0);

    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    let btn = document.getElementById('btn-' + name);
    if (btn) btn.classList.add('active');
}

function applyLightingUniforms() {
    let p = currentPreset;
    let u = (name) => gl.getUniformLocation(program, name);
    gl.uniform3fv(u('uLightDir'),      new Float32Array(p.lightDir));
    gl.uniform3fv(u('uSunTintHigh'),   new Float32Array(p.sunTintHigh));
    gl.uniform3fv(u('uSunTintMid'),    new Float32Array(p.sunTintMid));
    gl.uniform3fv(u('uSunTintShadow'), new Float32Array(p.sunTintShadow));
    gl.uniform3fv(u('uAmbientColor'),  new Float32Array(p.ambientColor));
    gl.uniform3fv(u('uFogColor'),      new Float32Array(p.fogColor));
    gl.uniform1f(u('uFogA'),           p.fogA);
    gl.uniform1f(u('uFogB'),           p.fogB);
    gl.uniform1f(u('uDarkness'),       p.darkness);
    gl.uniform1f(u('uShadowDepth'),    p.shadowDepth);
}

function render() {
    let now = performance.now();
    let deltaTime = Math.min(0.033, (now - lastTimestamp) / 1000);
    lastTimestamp = now;

    const rotationSpeed = 50.0 * deltaTime; 
    if (keys.arrowUp)    camera.pitch += rotationSpeed;
    if (keys.arrowDown)  camera.pitch -= rotationSpeed;
    if (keys.arrowLeft)  camera.yaw   -= rotationSpeed;
    if (keys.arrowRight) camera.yaw   += rotationSpeed;

    camera.pitch = Math.max(-89, Math.min(89, camera.pitch));

    updateCameraVectors();
    
    updateMovement(deltaTime);
    
    regenerateTerrain(true);
    
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    let p = perspective(75, gl.canvas.width / gl.canvas.height, 0.1, 100.0);
    
    let target = [
        camera.position[0] + camera.forward[0],
        camera.position[1] + camera.forward[1],
        camera.position[2] + camera.forward[2]
    ];
    
    let mv = lookAt(camera.position, target, camera.up);
    
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "modelViewMatrix"), false, flatten(mv));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(p));
    
    applyLightingUniforms();
    gl.uniform1f(gl.getUniformLocation(program, "fogDensity"), 0.12);
    
    gl.drawArrays(gl.TRIANGLES, 0, points.length);
    
    requestAnimFrame(render);
}
