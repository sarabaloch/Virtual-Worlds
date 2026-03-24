"use strict";

var gl;
var points = [];
var colors = [];

// Movement and Looking State [cite: 17, 21]
var eye = [0.0, 0.5, 5.0]; // Positioned slightly up and back 
var at = [0.0, 0.0, 0.0];  // Looking toward the center
var up = [0.0, 1.0, 0.0];
var angles = [0, 0, 0];    // Pitch, Yaw, Roll [cite: 18]

const SPEED = 0.1;
const ROT_SPEED = 2.0;

window.onload = function init() {
    var canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) { alert("WebGL isn't available"); }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.05, 0.1, 0.1, 1.0); // Misty dark teal [cite: 5]
    gl.enable(gl.DEPTH_TEST);

    var program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // 1. Generate the solid grid terrain [cite: 10]
    generateProperTerrain();

    // 2. Buffer data to GPU [cite: 64]
    sendToGPU(program);

    // 3. Movement Controls [cite: 30, 31]
    window.onkeydown = function(event) {
        switch(event.keyCode) {
            case 87: eye[2] -= SPEED; break; // W: Forward
            case 83: eye[2] += SPEED; break; // S: Backward
            case 65: eye[0] -= SPEED; break; // A: Left
            case 68: eye[0] += SPEED; break; // D: Right
            case 38: angles[0] -= ROT_SPEED; break; // Up: Pitch Up [cite: 18]
            case 40: angles[0] += ROT_SPEED; break; // Down: Pitch Down
            case 37: angles[1] -= ROT_SPEED; break; // Left: Yaw Left
            case 39: angles[1] += ROT_SPEED; break; // Right: Yaw Right
        }
    };

    render(program);
};

function generateProperTerrain() {
    const RES = 40;
    const STEP = 0.2;
    for(let i = -RES/2; i < RES/2; i++) {
        for(let j = -RES/2; j < RES/2; j++) {
            let x = i * STEP;
            let z = j * STEP;
            
            // Define 4 corners for a solid "Quad" [cite: 9]
            let a = [x, getH(x,z), z];
            let b = [x + STEP, getH(x + STEP, z), z];
            let c = [x, getH(x, z + STEP), z + STEP];
            let d = [x + STEP, getH(x + STEP, z + STEP), z + STEP];

            let col = [0.1, 0.25, 0.22]; // Forest Teal
            
            // Push two triangles to form one floor tile
            points.push(a, b, c, b, c, d); 
            for(let k=0; k<6; k++) colors.push(col);
        }
    }
}

// Organic hill heights [cite: 11]
function getH(x, z) {
    return Math.sin(x * 2.0) * Math.cos(z * 2.0) * 0.1 - 0.5; 
}

function sendToGPU(program) {
    var cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);
    var vColor = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);

    var vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);
    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);
}

function render(program) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Perspective: 45 degree FOV, 800/600 aspect ratio [cite: 16]
    let p = perspective(45, 1.33, 0.1, 100.0);
    
    // View: Camera position (eye) + Rotation (angles) [cite: 15, 17]
    let mv = lookAt(eye, [eye[0], eye[1], eye[2] - 1.0], up);
    mv = mult(mv, rotateX(angles[0]));
    mv = mult(mv, rotateY(angles[1]));

    gl.uniformMatrix4fv(gl.getUniformLocation(program, "modelViewMatrix"), false, flatten(mv));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(p));

    gl.drawArrays(gl.TRIANGLES, 0, points.length);
    requestAnimFrame(() => render(program));
}

// --- Matrix Math Helpers (Missing from common.js) ---

function flatten(v) {
    var result = new Float32Array(v.length * v[0].length);
    for (var i = 0; i < v.length; i++) 
        for (var j = 0; j < v[0].length; j++) 
            result[i * v[0].length + j] = v[i][j];
    return result;
}

function perspective(fovy, aspect, near, far) {
    var f = 1.0 / Math.tan((fovy * Math.PI / 180.0) / 2);
    var d = far - near;
    return [
        [f/aspect, 0, 0, 0], [0, f, 0, 0],
        [0, 0, -(near+far)/d, -1], [0, 0, -2*near*far/d, 0]
    ];
}

function lookAt(eye, at, up) {
    var z = normalize([eye[0]-at[0], eye[1]-at[1], eye[2]-at[2]]);
    var x = normalize([up[1]*z[2]-up[2]*z[1], up[2]*z[0]-up[0]*z[2], up[0]*z[1]-up[1]*z[0]]);
    var y = [z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];
    return [
        [x[0], y[0], z[0], 0], [x[1], y[1], z[1], 0], [x[2], y[2], z[2], 0],
        [-x[0]*eye[0]-x[1]*eye[1]-x[2]*eye[2], -y[0]*eye[0]-y[1]*eye[1]-y[2]*eye[2], -z[0]*eye[0]-z[1]*eye[1]-z[2]*eye[2], 1]
    ];
}

function mult(m, n) {
    var out = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
    for(var i=0; i<4; i++) for(var j=0; j<4; j++) for(var k=0; k<4; k++) out[i][j] += m[i][k] * n[k][j];
    return out;
}

function rotateX(d) {
    var c = Math.cos(d * Math.PI/180), s = Math.sin(d * Math.PI/180);
    return [[1,0,0,0], [0,c,s,0], [0,-s,c,0], [0,0,0,1]];
}

function rotateY(d) {
    var c = Math.cos(d * Math.PI/180), s = Math.sin(d * Math.PI/180);
    return [[c,0,-s,0], [0,1,0,0], [s,0,c,0], [0,0,0,1]];
}

function normalize(v) {
    var d = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    return [v[0]/d, v[1]/d, v[2]/d];
}