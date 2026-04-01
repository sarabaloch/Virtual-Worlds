function vec2(x, y) {
    // verify correct no of components
    if (arguments.length !== 2) {
        console.log(`vec2 requires exactly 2 arguments`);
        return;
    }

    const v = [x, y];
    return v;
}

function vec3(x, y, z) {
    // verify correct no of components
    if (arguments.length !== 3) {
        console.log(`vec3 requires exactly 3 arguments`);
        return;
    }

    const v = [x, y, z];
    return v;
}

function vec4(x, y, z, w) {
    // verify correct no of components
    if (arguments.length !== 4) {
        console.log(`vec4 requires exactly 4 arguments`);
        return;
    }
    
    const v = [x, y, z, w];
    return v;
}

function mat2(m00, m01, m10, m11) {
    // verify correct no of components
    if (arguments.length !== 4) {
        console.log(`mat2 requires exactly 4 arguments`);
        return;
    }
    
    const m = [
        [m00, m01],
        [m10, m11]
    ];
    return m;
}

function mat3(m00, m01, m02, m10, m11, m12, m20, m21, m22) {
    // verify correct no of components
    if (arguments.length !== 9) {
        console.log(`mat3 requires exactly 9 arguments`);
        return;
    }

    const m = [
        [m00, m01, m02],
        [m10, m11, m12],
        [m20, m21, m22]
    ];
    return m;
}

function mat4(m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33) {
    // verify correct no of components
    if (arguments.length !== 16) {
        console.log(`mat4 requires exactly 16 arguments`);
        return;
    }
    
    const m = [
        [m00, m01, m02, m03],
        [m10, m11, m12, m13],
        [m20, m21, m22, m23],
        [m30, m31, m32, m33]
    ];
    return m;
}

// helper functions
function vectorLength(v) {
    let sum = 0;
    for (let i = 0; i < v.length; i++) {
        sum += v[i] * v[i];
    }
    return Math.sqrt(sum);
}

function normalizeVector(v) {
    const len = vectorLength(v);
    if (len === 0){
        console.log("cannot normalize zero-length vector");
        return;
    }
    const result = [];
    for (let i = 0; i < v.length; i++) {
        result.push(v[i] / len);
    }
    return result;
}

function addVectors(v1, v2) {
    const result = [];
    for (let i = 0; i < v1.length; i++) {
        result.push(v1[i] + v2[i]);
    }
    return result;
}

function subtractVectors(v1, v2) {
    const result = [];
    for (let i = 0; i < v1.length; i++) {
        result.push(v1[i] - v2[i]);
    }
    return result;
}

function dotProduct(v1, v2) {
    let sum = 0;
    for (let i = 0; i < v1.length; i++) {
        sum += v1[i] * v2[i];
    }
    return sum;
}

function crossProduct(v1, v2) {
    if (v1.length !== 3 || v2.length !== 3) {
        console.log("cross product only defined for 3D vectors");
        return;
    }
    return [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0]
    ];
}

function vectorsEqual(v1, v2) {
    if (v1.length !== v2.length) return false;
    for (let i = 0; i < v1.length; i++) {
        // if (v1[i] !== v2[i]) {
        //     return false;
        // }
        if (Math.abs(v1[i] - v2[i]) > 0.0001) {
            return false;
        } // the above was not working due to tolerance issues so ive ensured the difference is small enough rather than 0
    }
    return true;
}

function lerp(P, Q, alpha) {
    // P and Q must have the same dimension
    if (P.length !== Q.length) {
        console.log("Error: P and Q must have same dimension");
        return;
    }
    
    // alpha should be between 0 and 1
    if (alpha < 0 || alpha > 1) {
        console.log("Error: alpha should be between 0 and 1");
        return;
    }
    
    const result = [];
    for (let i = 0; i < P.length; i++) {
        result.push((1 - alpha) * P[i] + alpha * Q[i]);
    }
    return result;
}

// task 2
function map_point(P, Q, A, B, X) {
    // find alpha from ANY coordinate (pick first non-zero difference)
    let alpha;
    
    for (let i = 0; i < P.length; i++) {
        const diff = Q[i] - P[i];
        if (Math.abs(diff) > 0.000001) {
            alpha = (X[i] - P[i]) / diff;
            break;  // use this alpha
        }
    }
    
    // if we never found a non-zero difference, P = Q
    if (alpha === undefined) {
        return A.slice();  // Map to A
    }
    
    // map using this alpha
    return lerp(A, B, alpha);
}

function normalize(v){
    let d = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
    return [v[0]/d, v[1]/d, v[2]/d];
}

function flatten(v){
    let r=[];
    for(let i=0;i<v.length;i++)
        for(let j=0;j<v[0].length;j++)
            r.push(v[i][j]);
    return new Float32Array(r);
}

// MATRICES

function perspective(fovy, aspect, near, far) {
    var f = 1.0 / Math.tan((fovy * Math.PI / 180.0) / 2);
    var d = far - near;

    return [
        [f/aspect, 0, 0, 0],
        [0, f, 0, 0],
        [0, 0, -(near+far)/d, -1],
        [0, 0, -2*near*far/d, 0]
    ];
}

function lookAt(eye, at, up) {
    var z = normalize([eye[0]-at[0], eye[1]-at[1], eye[2]-at[2]]);
    var x = normalize([up[1]*z[2]-up[2]*z[1], up[2]*z[0]-up[0]*z[2], up[0]*z[1]-up[1]*z[0]]);
    var y = [z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];

    return [
        [x[0], y[0], z[0], 0],
        [x[1], y[1], z[1], 0],
        [x[2], y[2], z[2], 0],
        [-x[0]*eye[0]-x[1]*eye[1]-x[2]*eye[2],
         -y[0]*eye[0]-y[1]*eye[1]-y[2]*eye[2],
         -z[0]*eye[0]-z[1]*eye[1]-z[2]*eye[2], 1]
    ];
}

function mult(m,n){
    var out = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
    for(var i=0;i<4;i++)
        for(var j=0;j<4;j++)
            for(var k=0;k<4;k++)
                out[i][j]+=m[i][k]*n[k][j];
    return out;
}

function rotateX(d){var c=Math.cos(d*Math.PI/180),s=Math.sin(d*Math.PI/180);
return[[1,0,0,0],[0,c,s,0],[0,-s,c,0],[0,0,0,1]];}

function rotateY(d){var c=Math.cos(d*Math.PI/180),s=Math.sin(d*Math.PI/180);
return[[c,0,-s,0],[0,1,0,0],[s,0,c,0],[0,0,0,1]];}

//normal for pushtri
function computeNormal(a, b, c) {
    let u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
    let v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
    
    return normalize([
        u[1]*v[2] - u[2]*v[1],
        u[2]*v[0] - u[0]*v[2],
        u[0]*v[1] - u[1]*v[0]
    ]);
}

//normal for pushtrismooth
//for smooth shading
function getNormal(x, z) {
    let eps = 0.01;

    let hL = getHeight(x - eps, z);
    let hR = getHeight(x + eps, z);
    let hD = getHeight(x, z - eps);
    let hU = getHeight(x, z + eps);

    let nx = hL - hR;
    let ny = 2.0;
    let nz = hD - hU;

    let len = Math.sqrt(nx*nx + ny*ny + nz*nz);
    return [nx/len, ny/len, nz/len];
}
