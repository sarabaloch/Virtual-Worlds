// global variables
var gl;
var points = [];
var colors = [];
var normals = []; //stores normals per vertwx for lighting
var emissive = []; //stores emission values per vertex for glow

//buffers
var vBuffer, cBuffer, nBuffer, eBuffer;
var wBuffer; //for wireframe
var vPosition, vColor, vNormal, vEmissive;

// camera state
var camera = {
    position: [0.0, 0.2, 5.0], // start slightly above ground to avoid immediate collision
    yaw: -90.0,   // facing towards negative Z
    pitch: 0.0,   // level with horizon
    roll: 0.0,    // rotation around forward axis (Q/E keys)
    forward: [0, 0, -1], // will be calculated from yaw/pitch
    right: [1, 0, 0],    // will be calculated from forward
    up: [0, 1, 0]        // will be calculated from forward + roll
};

// input keys
var keys = {
    w: false, s: false, a: false, d: false,
    q: false, e: false,
    arrowUp: false, arrowDown: false, arrowLeft: false, arrowRight: false,
    space: false, ctrl: false
};

// movement parameters
const MOVE_SPEED = 5.0; // how fast u move forward/back
const VERTICAL_SPEED = 3.0; // how fast u move up or down
const CHUNK_SIZE = 10; // how big each terrain chunk is in world units
let currentChunkX = null; // which chunk the camera is currently in (used for terrain generation)
let currentChunkZ = null;

// runtime-adjustable view and movement settings
var viewFOV = 75;       // field of view in degrees
var viewFar = 100.0;    // far clipping plane
var viewNear = 0.1;     // near clipping plane
var moveSpeedMult = 1.0; // movement speed multiplier (adjusted via UI slider)

var program; 
var lastTimestamp = 0; // for tracking time between frames

//for switching between shading modes
var shadingMode = 2;
var wirePoints = []; 
//0 = wireframe, 1 = flat, 2 = smooth (default)

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

    regenerateTerrain(); //generates terrain around camera position

    //set up keyboard input listeners for movement and looking around
    window.addEventListener('keydown', function(event) {
        const key = event.key.toLowerCase();
        
        if (key === 'w') keys.w = true;
        if (key === 's') keys.s = true;
        if (key === 'a') keys.a = true;
        if (key === 'd') keys.d = true;
        if (key === 'q') keys.q = true;
        if (key === 'e') keys.e = true;
        
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
        if (key === 'q') keys.q = false;
        if (key === 'e') keys.e = false;
        if (key === 'arrowup')    keys.arrowUp    = false;
        if (key === 'arrowdown')  keys.arrowDown  = false;
        if (key === 'arrowleft')  keys.arrowLeft  = false;
        if (key === 'arrowright') keys.arrowRight = false;
        if (event.code === 'Space') keys.space = false;
        if (key === 'control')      keys.ctrl  = false;
    });
    
    updateCameraVectors();
    
    lastTimestamp = performance.now();
    render();
};

// function to flatten array of vec3 into float32array for webGL buffer data
function flattenScalars(arr) {
    return new Float32Array(arr);
}

// Rebuilds camera.forward, camera.right, and camera.up from current yaw, pitch, and roll.
// forward comes from spherical coords (yaw+pitch).
// right is perpendicular to forward in the world-horizontal plane, then rolled.
// up is derived by rotating the world-up vector around the forward axis by roll.
function updateCameraVectors() {
    var yawRad   = camera.yaw   * Math.PI / 180;
    var pitchRad = camera.pitch * Math.PI / 180;
    var rollRad  = camera.roll  * Math.PI / 180;

    // forward vector from yaw + pitch
    camera.forward[0] = Math.cos(yawRad) * Math.cos(pitchRad);
    camera.forward[1] = Math.sin(pitchRad);
    camera.forward[2] = Math.sin(yawRad) * Math.cos(pitchRad);

    var len = Math.sqrt(camera.forward[0]*camera.forward[0] +
                        camera.forward[1]*camera.forward[1] +
                        camera.forward[2]*camera.forward[2]);
    camera.forward[0] /= len;
    camera.forward[1] /= len;
    camera.forward[2] /= len;

    // world-up reference vector
    var worldUp = [0, 1, 0];

    // base right = forward x worldUp, then normalise
    var baseRight = [
        camera.forward[1]*worldUp[2] - camera.forward[2]*worldUp[1],
        camera.forward[2]*worldUp[0] - camera.forward[0]*worldUp[2],
        camera.forward[0]*worldUp[1] - camera.forward[1]*worldUp[0]
    ];
    len = Math.sqrt(baseRight[0]*baseRight[0] + baseRight[1]*baseRight[1] + baseRight[2]*baseRight[2]);
    if (len > 0) { baseRight[0] /= len; baseRight[1] /= len; baseRight[2] /= len; }

    // base up = right x forward (perpendicular to both)
    var baseUp = [
        baseRight[1]*camera.forward[2] - baseRight[2]*camera.forward[1],
        baseRight[2]*camera.forward[0] - baseRight[0]*camera.forward[2],
        baseRight[0]*camera.forward[1] - baseRight[1]*camera.forward[0]
    ];

    // apply roll: rotate baseRight and baseUp around forward axis by rollRad
    var cosR = Math.cos(rollRad), sinR = Math.sin(rollRad);
    camera.right[0] = cosR * baseRight[0] + sinR * baseUp[0];
    camera.right[1] = cosR * baseRight[1] + sinR * baseUp[1];
    camera.right[2] = cosR * baseRight[2] + sinR * baseUp[2];

    camera.up[0] = -sinR * baseRight[0] + cosR * baseUp[0];
    camera.up[1] = -sinR * baseRight[1] + cosR * baseUp[1];
    camera.up[2] = -sinR * baseRight[2] + cosR * baseUp[2];
}

// function to update camera position based on currently pressed movement keys (WASD for horizontal movement, space/ctrl for vertical). calculates movement based on camera forward and right vectors, applies speed scaling and deltatime for frame rate independence. also checks terrain height at new position to prevent sinking below ground level.
function updateMovement(deltaTime) {
    var speed = (MOVE_SPEED * 0.5) * moveSpeedMult * deltaTime;
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
        moveDelta[0] -= camera.right[0] * speed;
        moveDelta[2] -= camera.right[2] * speed;
    }
    if (keys.d) {
        moveDelta[0] += camera.right[0] * speed;
        moveDelta[2] += camera.right[2] * speed;
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
            
            if (shadingMode === 2) {
                pushTriSmooth(a, b, c, baseColor);
                pushTriSmooth(b, d, c, baseColor);
            } else {
                pushTri(a, b, c, n1, baseColor);
                pushTri(b, d, c, n2, baseColor);
            }
            
            let r = pseudoRandom(x, z);
            
            if (r < 0.05) {
                createTree(x, getHeight(x, z), z);
            }
            
            if (r > 0.93) {
                createRock(x, getHeight(x, z), z);
            }

            let cloudChance = pseudoRandom(x * 0.08, z * 0.08);

            if (cloudChance > 0.995) {
                createCloud(x, 3.5 + pseudoRandom(x, z) * 1.5, z);
            }
        }
    }
}

//for infinite terrain effect
function regenerateTerrain() {
    let newChunkX = Math.floor(camera.position[0] / CHUNK_SIZE);
    let newChunkZ = Math.floor(camera.position[2] / CHUNK_SIZE);
    
    if (newChunkX === currentChunkX && newChunkZ === currentChunkZ) return;
    
    currentChunkX = newChunkX;
    currentChunkZ = newChunkZ;
    
    points = [];
    colors = [];
    normals = [];
    emissive = [];
    wirePoints = [];
    
    for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
            generateTerrain(currentChunkX + dx, currentChunkZ + dz);
        }
    }
    
    sendToGPU();
}

function pushTri(a, b, c, n, col, emitStrength) {
    let e = (emitStrength === undefined) ? 0.0 : emitStrength;

    // triangles
    points.push(a, b, c);
    normals.push(n, n, n);
    colors.push(col, col, col);
    emissive.push(e, e, e);

    //edges (wireframe)
    wirePoints.push(a, b, b, c, c, a);
}

function pushTriSmooth(a, b, c, col) {
    points.push(a, b, c);

    normals.push(
        getNormal(a[0], a[2]),
        getNormal(b[0], b[2]),
        getNormal(c[0], c[2])
    );

    //color per vertex
    colors.push(col, col, col);

    emissive.push(0, 0, 0);
}

function sendToGPU() {
    //we are declaring buffers and all as global 
    //because when the wireframe shading was done 
    //the edges were showing in smooth and flat as well
    //therefore the global declaration ensured that in switching
    // between modes nothing from the previous was still
    //stored in the buffer
    vPosition = gl.getAttribLocation(program, "vPosition");
    vColor    = gl.getAttribLocation(program, "vColor");
    vNormal   = gl.getAttribLocation(program, "vNormal");
    vEmissive = gl.getAttribLocation(program, "vEmissive");

    // positions
    vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);
    gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    // colors
    cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);
    gl.vertexAttribPointer(vColor, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);

    // normals
    nBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normals), gl.STATIC_DRAW);
    gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vNormal);

    // emissive
    eBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, eBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flattenScalars(emissive), gl.STATIC_DRAW);
    gl.vertexAttribPointer(vEmissive, 1, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vEmissive);

    // wireframe
    wBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, wBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(wirePoints), gl.STATIC_DRAW);
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

function setShading(mode) {
    shadingMode = mode;
    let buttons = document.querySelectorAll('.shading-btn');
    buttons.forEach(b => b.classList.remove('active'));
    buttons[mode].classList.add('active');
}

// called by HTML sliders to update runtime view/speed settings
function setFOV(val) {
    viewFOV = parseFloat(val);
    document.getElementById('fov-val').textContent = Math.round(val) + '°';
}
function setFar(val) {
    viewFar = parseFloat(val);
    document.getElementById('far-val').textContent = Math.round(val);
}
function setNear(val) {
    viewNear = parseFloat(val);
    document.getElementById('near-val').textContent = parseFloat(val).toFixed(2);
}
function setMoveSpeed(val) {
    moveSpeedMult = parseFloat(val);
    document.getElementById('speed-val').textContent = parseFloat(val).toFixed(1) + 'x';
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
    gl.uniform1i(gl.getUniformLocation(program, "uShadingMode"), shadingMode);
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
    if (keys.q)          camera.roll  -= rotationSpeed;
    if (keys.e)          camera.roll  += rotationSpeed;

    camera.pitch = Math.max(-89, Math.min(89, camera.pitch));

    updateCameraVectors();
    
    updateMovement(deltaTime);
    
    regenerateTerrain(true);
    
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    let p = perspective(viewFOV, gl.canvas.width / gl.canvas.height, viewNear, viewFar);
    
    let target = [
        camera.position[0] + camera.forward[0],
        camera.position[1] + camera.forward[1],
        camera.position[2] + camera.forward[2]
    ];
    
    let mv = lookAt(camera.position, target, camera.up);
    
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "modelViewMatrix"), false, flatten(mv));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(p));
    
    applyLightingUniforms();

    if (shadingMode === 0) {
        // Wireframe mode
        gl.bindBuffer(gl.ARRAY_BUFFER, wBuffer);
        gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);

        // disable unused attributes
        gl.disableVertexAttribArray(vColor);
        gl.disableVertexAttribArray(vNormal);
        gl.disableVertexAttribArray(vEmissive);

        gl.drawArrays(gl.LINES, 0, wirePoints.length);

    } 
    else {
        // Flat/Smooth rendering
        // positions
        gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
        gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vPosition);

        // colors
        gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
        gl.vertexAttribPointer(vColor, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vColor);

        // normals
        gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
        gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vNormal);

        // emissive
        gl.bindBuffer(gl.ARRAY_BUFFER, eBuffer);
        gl.vertexAttribPointer(vEmissive, 1, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vEmissive);

        gl.drawArrays(gl.TRIANGLES, 0, points.length);
    }
    
    requestAnimFrame(render);
}