"use strict";

var gl;
var points = [];
var colors = [];
var normals = [];
var emissive = [];

// Camera
var eye = [0.0, 0.8, 5.0];
var up = [0.0, 1.0, 0.0];
var angles = [0, 0, 0];

const SPEED = 0.1;
const ROT_SPEED = 2.0;

// Chunk system
const CHUNK_SIZE = 10;
let currentChunkX = null;
let currentChunkZ = null;

// Light: sun directly above (90 degrees elevation).
var lightDir = normalize([0.0, 1.0, 0.0]);
var sunPos = [0.0, 7.5, 0.0];
let sunCreated = false;

var program;

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

    regenerateTerrain();

    //sun generation
    if (sunCreated) {
        createSun(sunPos[0], sunPos[1], sunPos[2], 0.7);
    }
    if (!sunCreated) {
        sunPos = [0.0, 7.5, 0.0]; // fixed world position
        createSun(sunPos[0], sunPos[1], sunPos[2], 0.7);
        sunCreated = true;

        sendToGPU(); // update buffers to include sun
    }


    window.onkeydown = function(event) {
        const key = event.key; // use modern key property

        // WASD movement (forward/back/left/right)
        if (key === "w" || key === "W") eye[2] -= SPEED;
        if (key === "s" || key === "S") eye[2] += SPEED;
        if (key === "a" || key === "A") eye[0] -= SPEED;
        if (key === "d" || key === "D") eye[0] += SPEED;

       

        // Arrow keys move the whole scene (up/down = Y, left/right = X)
        if (key === "ArrowUp") eye[1] += SPEED;    // scene up
        if (key === "ArrowDown") eye[1] -= SPEED;  // scene down
        if (key === "ArrowLeft") eye[0] -= SPEED;  // scene left
        if (key === "ArrowRight") eye[0] += SPEED; // scene right
    };

    render();
};

//================= CAMERA MOVEMENT =================
let cameraPos = [0, 1.5, 0]; // starting camera position
let cameraTarget = [0, 1.5, -1]; // forward direction
let cameraUp = [0, 1, 0];

const camSpeed = 0.15; // adjust movement speed

document.addEventListener('keydown', function(e) {
    let forward = [
        cameraTarget[0] - cameraPos[0],
        cameraTarget[1] - cameraPos[1],
        cameraTarget[2] - cameraPos[2]
    ];
    let right = [
        forward[2], 0, -forward[0] // perpendicular in XZ plane
    ];
    
    // normalize vectors
    forward = normalize(forward);
    right = normalize(right);

    if (e.key === "ArrowUp") {
        // move camera up
        cameraPos[1] += camSpeed;
        cameraTarget[1] += camSpeed;
    }
    if (e.key === "ArrowDown") {
        // move camera down
        cameraPos[1] -= camSpeed;
        cameraTarget[1] -= camSpeed;
    }
    if (e.key === "ArrowLeft") {
        // move camera left
        cameraPos[0] -= right[0] * camSpeed;
        cameraPos[2] -= right[2] * camSpeed;
        cameraTarget[0] -= right[0] * camSpeed;
        cameraTarget[2] -= right[2] * camSpeed;
    }
    if (e.key === "ArrowRight") {
        // move camera right
        cameraPos[0] += right[0] * camSpeed;
        cameraPos[2] += right[2] * camSpeed;
        cameraTarget[0] += right[0] * camSpeed;
        cameraTarget[2] += right[2] * camSpeed;
    }
});
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

// ================= WORLD =================

function generateWorld() {
    // Not used anymore but kept for structure
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

function regenerateTerrain() {

    let newChunkX = Math.floor(eye[0] / CHUNK_SIZE);
    let newChunkZ = Math.floor(eye[2] / CHUNK_SIZE);

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

    // Add the sun as a visible scene object and use same position for lighting.
    //sunPos = [currentChunkX * CHUNK_SIZE, 7.5, currentChunkZ * CHUNK_SIZE];
    //createSun(sunPos[0], sunPos[1], sunPos[2], 0.7);

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
    let size = 0.08 + pseudoRandom(x, z) * 0.18; // bigger variation
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
        pushTri(a,b,top,n1,[0.35,0.35,0.35]);
        pushTri(b,a,bottom,n2,[0.3,0.3,0.3]);
    }
}

// ================= TREE =================

function createTree(cx, cy, cz) {
    let trunkH = 0.5 + pseudoRandom(cx, cz) * 0.4; // varied height
    let trunkR = 0.04 + pseudoRandom(cx+1, cz+1) * 0.06; // varied radius

    let brown = [0.35, 0.22, 0.12];
    let green = [0.15, 0.55, 0.2];

    let sides = 10;
    for (let i = 0; i < sides; i++) {
        let a = (i / sides) * Math.PI * 2;
        let b = ((i + 1) / sides) * Math.PI * 2;
        let p1 = [cx + Math.cos(a)*trunkR, cy, cz + Math.sin(a)*trunkR];
        let p2 = [cx + Math.cos(b)*trunkR, cy, cz + Math.sin(b)*trunkR];
        let p3 = [cx + Math.cos(a)*trunkR, cy + trunkH, cz + Math.sin(a)*trunkR];
        let p4 = [cx + Math.cos(b)*trunkR, cy + trunkH, cz + Math.sin(b)*trunkR];

        pushTri(p1, p2, p3, computeNormal(p1,p2,p3), brown);
        pushTri(p2, p4, p3, computeNormal(p2,p4,p3), brown);
    }

    let layers = 3 + Math.floor(pseudoRandom(cx+2, cz+2)*2); // varied layers
    for (let l = 0; l < layers; l++) {
        let y = cy + trunkH + l * 0.18;
        let r = 0.35 - l * 0.08;
        for (let i = 0; i < sides; i++) {
            let a = (i / sides) * Math.PI * 2;
            let b = ((i + 1) / sides) * Math.PI * 2;
            let p1 = [cx + Math.cos(a)*r, y, cz + Math.sin(a)*r];
            let p2 = [cx + Math.cos(b)*r, y, cz + Math.sin(b)*r];
            let tip = [cx, y + 0.25, cz];
            pushTri(p1,p2,tip,computeNormal(p1,p2,tip),green);
        }
    }

    createTreeShadow(cx, cy, cz, 0.30);
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

            // Outer shell for visible glow/aura.
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

// ================= NORMAL =================

function computeNormal(a, b, c) {

    let u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
    let v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];

    return normalize([
        u[1]*v[2] - u[2]*v[1],
        u[2]*v[0] - u[0]*v[2],
        u[0]*v[1] - u[1]*v[0]
    ]);
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
    gl.bufferData(gl.ARRAY_BUFFER, flatten(emissive), gl.STATIC_DRAW);

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

    regenerateTerrain();

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    let p = perspective(45, 1.33, 0.1, 100.0);

    let mv = lookAt(
        eye,
        [eye[0], eye[1] - 0.1, eye[2] - 1.5],
        up
    )
    //mouse

    mv = mult(mv, rotateX(angles[0]));
    mv = mult(mv, rotateY(angles[1]));

    gl.uniformMatrix4fv(gl.getUniformLocation(program, "modelViewMatrix"), false, flatten(mv));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(p));

    gl.uniform1f(gl.getUniformLocation(program, "fogDensity"), 0.12);
    let sunLoc = gl.getUniformLocation(program, "sunPos");
    if (sunLoc) gl.uniform3fv(sunLoc, flatten(sunPos));

    gl.drawArrays(gl.TRIANGLES, 0, points.length);

    requestAnimFrame(render);
}
