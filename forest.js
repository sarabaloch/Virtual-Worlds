"use strict";

var gl;
var points = [];
var colors = [];
var normals = [];

// Camera
var eye = [0.0, 0.8, 5.0];
var up = [0.0, 1.0, 0.0];
var angles = [0, 0, 0];

const SPEED = 0.1;
const ROT_SPEED = 2.0;

// Light
var lightDir = normalize([0.3, 1.0, 0.2]);

window.onload = function init() {

    var canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) { alert("WebGL isn't available"); }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.55, 0.75, 0.95, 1.0);
    gl.enable(gl.DEPTH_TEST);

    var program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    generateWorld();
    sendToGPU(program);

    window.onkeydown = function(event) {
        switch(event.keyCode) {
            case 87: eye[2] -= SPEED; break;
            case 83: eye[2] += SPEED; break;
            case 65: eye[0] -= SPEED; break;
            case 68: eye[0] += SPEED; break;

            case 38: angles[0] -= ROT_SPEED; break;
            case 40: angles[0] += ROT_SPEED; break;
            case 37: angles[1] -= ROT_SPEED; break;
            case 39: angles[1] += ROT_SPEED; break;
        }
    };

    render(program);
};

// ================= WORLD =================

function generateWorld() {
    generateTerrain();
}

// ================= HEIGHT =================

function getHeight(x, z) {
    return (
        Math.sin(x * 1.2) * Math.cos(z * 1.2) * 0.22 +
        Math.sin(x * 2.5 + z * 1.5) * 0.05 +
        Math.sin(x * 6.0) * Math.cos(z * 6.0) * 0.015
    ) - 0.5;
}

// ================= TERRAIN =================

function generateTerrain() {

    const SIZE = 40;
    const STEP = 0.25;

    for (let i = -SIZE/2; i < SIZE/2; i++) {
        for (let j = -SIZE/2; j < SIZE/2; j++) {

            let x = i * STEP;
            let z = j * STEP;

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

            let r = Math.random();

            // TREE (TRUE 3D)
            if (r < 0.05) {
                createTree(x, getHeight(x, z), z);
            }

            // ROCK (TRUE 3D)
            if (r > 0.93) {
                createRock(x, getHeight(x, z), z);
            }
        }
    }
}

function pushTri(a, b, c, n, col) {
    points.push(a, b, c);
    normals.push(n, n, n);
    colors.push(col, col, col);
}

// ================= TRUE 3D ROCK =================

function createRock(x, y, z) {

    let size = 0.12 + Math.random() * 0.1;
    let sides = 10;

    let center = [x, y, z];

    let verts = [];

    for (let i = 0; i < sides; i++) {

        let theta = (i / sides) * Math.PI * 2;
        let phi = Math.random() * Math.PI;

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
        let b = verts[(i + 1) % sides];

        pushTri(a, b, top, [0,1,0], [0.35,0.35,0.35]);
        pushTri(b, a, bottom, [0,1,0], [0.3,0.3,0.3]);
    }
}

// ================= TRUE 3D TREE =================

function createTree(cx, cy, cz) {

    let trunkH = 0.6;
    let trunkR = 0.05;

    let brown = [0.35, 0.22, 0.12];
    let green = [0.15, 0.55, 0.2];

    let sides = 10;

    // trunk cylinder
    for (let i = 0; i < sides; i++) {

        let a = (i / sides) * Math.PI * 2;
        let b = ((i + 1) / sides) * Math.PI * 2;

        let p1 = [cx + Math.cos(a)*trunkR, cy, cz + Math.sin(a)*trunkR];
        let p2 = [cx + Math.cos(b)*trunkR, cy, cz + Math.sin(b)*trunkR];

        let p3 = [cx + Math.cos(a)*trunkR, cy + trunkH, cz + Math.sin(a)*trunkR];
        let p4 = [cx + Math.cos(b)*trunkR, cy + trunkH, cz + Math.sin(b)*trunkR];

        pushTri(p1, p2, p3, [0,1,0], brown);
        pushTri(p2, p4, p3, [0,1,0], brown);
    }

    // foliage cone layers
    let layers = 4;

    for (let l = 0; l < layers; l++) {

        let y = cy + trunkH + l * 0.18;
        let r = 0.35 - l * 0.08;

        for (let i = 0; i < sides; i++) {

            let a = (i / sides) * Math.PI * 2;
            let b = ((i + 1) / sides) * Math.PI * 2;

            let p1 = [cx + Math.cos(a)*r, y, cz + Math.sin(a)*r];
            let p2 = [cx + Math.cos(b)*r, y, cz + Math.sin(b)*r];
            let tip = [cx, y + 0.25, cz];

            pushTri(p1, p2, tip, [0,1,0], green);
        }
    }
}

// ================= NORMAL =================

function computeNormal(a, b, c) {

    let u = [
        b[0]-a[0],
        b[1]-a[1],
        b[2]-a[2]
    ];

    let v = [
        c[0]-a[0],
        c[1]-a[1],
        c[2]-a[2]
    ];

    return normalize([
        u[1]*v[2] - u[2]*v[1],
        u[2]*v[0] - u[0]*v[2],
        u[0]*v[1] - u[1]*v[0]
    ]);
}

// ================= GPU =================

function sendToGPU(program) {

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

    gl.uniform3fv(gl.getUniformLocation(program, "lightDir"), flatten(lightDir));
}

// ================= RENDER =================

function render(program) {

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    let p = perspective(45, 1.33, 0.1, 100.0);

    let mv = lookAt(
        eye,
        [eye[0], eye[1] - 0.1, eye[2] - 1.5],
        up
    );

    mv = mult(mv, rotateX(angles[0]));
    mv = mult(mv, rotateY(angles[1]));

    gl.uniformMatrix4fv(gl.getUniformLocation(program, "modelViewMatrix"), false, flatten(mv));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(p));

    gl.uniform1f(gl.getUniformLocation(program, "fogDensity"), 0.12);

    gl.drawArrays(gl.TRIANGLES, 0, points.length);

    requestAnimFrame(() => render(program));
}

