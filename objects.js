function createRock(x, y, z) {
    let size = 0.08 + pseudoRandom(x, z) * 0.18; //size variation between rocks
    let sides = 10;
    let verts = [];

    for (let i = 0; i < sides; i++) {  //kind of like a irregular circular shape
        let theta = (i / sides) * Math.PI * 2;
        let phi = pseudoRandom(x+i, z) * Math.PI;

        verts.push([
            x + Math.sin(phi) * Math.cos(theta) * size,
            y + Math.cos(phi) * size,
            z + Math.sin(phi) * Math.sin(theta) * size
        ]);
    }

    let top = [x, y + size * 1.2, z];   //close the rock between top and bottom points
    let bottom = [x, y - size * 0.8, z];
 
    for (let i = 0; i < sides; i++) {   //triangle faces around the rock
        let a = verts[i];
        let b = verts[(i+1)%sides];

        let n1 = computeNormal(a,b,top);
        let n2 = computeNormal(b,a,bottom);

        pushTri(a,b,top,n1,[0.18,0.18,0.20]);  //upper faces
        pushTri(b,a,bottom,n2,[0.13,0.13,0.15]);  //lower faces
    } 
}

function createTree(cx, cy, cz) {
    let rand1 = pseudoRandom(cx, cz);   //different random values to shape different aspects of the tree
    let rand2 = pseudoRandom(cx+1, cz+1);
    let rand3 = pseudoRandom(cx+2, cz+2);
    let rand4 = pseudoRandom(cx+3, cz+3);
    let rand5 = pseudoRandom(cx+4, cz+4);

    let brown = [0.28 + rand3*0.14, 0.16 + rand3*0.10, 0.07 + rand3*0.06];  //variation of brown across tree trunks
    let sides = 8;

    let archetype = Math.floor(rand5 * 3); // 0=spire, 1=bushy, 2=twisted

    let trunkH, trunkR, layers, baseRadius, coneH, overlap, tipSharpness, radiusCurve; //parameters to define trunk behavior

    if (archetype === 0) {   //spire tall tree
        trunkH      = 0.8 + rand1 * 0.6;
        trunkR      = 0.035 + rand2 * 0.025;
        layers      = 6 + Math.floor(rand4 * 3);
        baseRadius  = 0.22 + rand1 * 0.08;
        coneH       = 0.22 + rand2 * 0.06;
        overlap     = 0.10;
        tipSharpness = 0.70;
        radiusCurve  = 1.0;  
    } else if (archetype === 1) {   //bushy compact tree
        trunkH      = 0.35 + rand1 * 0.25;
        trunkR      = 0.06 + rand2 * 0.05;
        layers      = 3 + Math.floor(rand4 * 2);
        baseRadius  = 0.55 + rand1 * 0.20;
        coneH       = 0.38 + rand2 * 0.10;
        overlap     = 0.18;
        tipSharpness = 0.40; 
        radiusCurve  = 0.7;  
    } else {                  //twisted tree
        trunkH      = 0.55 + rand1 * 0.45;
        trunkR      = 0.045 + rand2 * 0.04;
        layers      = 4 + Math.floor(rand4 * 3);
        baseRadius  = 0.30 + rand1 * 0.18;
        coneH       = 0.28 + rand2 * 0.12;
        overlap     = 0.08;
        tipSharpness = 0.55;
        radiusCurve  = 1.0;
    }

    for (let i = 0; i < sides; i++) {     //constructing the trunk
        let a  = (i / sides) * Math.PI * 2;
        let b  = ((i+1) / sides) * Math.PI * 2;
        let p1 = [cx + Math.cos(a)*trunkR,       cy,          cz + Math.sin(a)*trunkR];
        let p2 = [cx + Math.cos(b)*trunkR,       cy,          cz + Math.sin(b)*trunkR];
        let p3 = [cx + Math.cos(a)*trunkR*0.7,   cy + trunkH, cz + Math.sin(a)*trunkR*0.7];
        let p4 = [cx + Math.cos(b)*trunkR*0.7,   cy + trunkH, cz + Math.sin(b)*trunkR*0.7];
        pushTri(p1, p2, p3, computeNormal(p1,p2,p3), brown);
        pushTri(p2, p4, p3, computeNormal(p2,p4,p3), brown);
    }

    for (let l = 0; l < layers; l++) {   //foliage layers
        let t       = l / (layers - 1);
        let layerY  = cy + trunkH + l * (coneH - overlap);  //vertical stacking of cone layers
        let r       = baseRadius * (1.0 - Math.pow(t, radiusCurve) * tipSharpness);
        let tipY    = layerY + coneH;

        let offX = 0, offZ = 0;  //distortion for twisted trees
        if (archetype === 2) {
            offX = pseudoRandom(cx + l*7.3, cz + l*2.1) * 0.12 - 0.06;
            offZ = pseudoRandom(cx + l*3.7, cz + l*8.9) * 0.12 - 0.06;
        }
        let tip = [cx + offX, tipY, cz + offZ];

        let brightness  = 0.76 + t * 0.24;      //colour variation in layers
        let greenShift  = rand3 * 0.10;
        let blueShift   = (archetype === 0) ? 0.06 : 0.0;
        let layerColor  = [
            (0.09 + greenShift) * brightness,
            (0.46 + rand1*0.13) * brightness,
            (0.13 + greenShift + blueShift) * brightness
        ];
        let underColor  = [layerColor[0]*0.48, layerColor[1]*0.50, layerColor[2]*0.48];

        for (let i = 0; i < sides; i++) {      //cone segments for foliage layers
            let a  = (i / sides) * Math.PI * 2;
            let b  = ((i+1) / sides) * Math.PI * 2;
            let p1 = [cx + Math.cos(a)*r, layerY, cz + Math.sin(a)*r];
            let p2 = [cx + Math.cos(b)*r, layerY, cz + Math.sin(b)*r];
            pushTri(p1, p2, tip, computeNormal(p1, p2, tip), layerColor);
            let center = [cx, layerY, cz];
            pushTri(p2, p1, center, computeNormal(p2, p1, center), underColor);
        }
    }

    createTreeShadow(cx, cy, cz, baseRadius * 0.85);  //shadows under the tree
}

function createTreeShadow(x, y, z, radius) {
    let shadowColor = [0.06, 0.07, 0.06];
    let yOffset = y + 0.012;         //slightly lifted
    let sides = 12;
    let center = [x, yOffset, z];
    
    for (let i = 0; i < sides; i++) {    //simple circular shadow fan
        let a0 = (i / sides) * Math.PI * 2.0;
        let a1 = ((i + 1) / sides) * Math.PI * 2.0;
        
        let p1 = [x + Math.cos(a0) * radius, yOffset, z + Math.sin(a0) * radius];
        let p2 = [x + Math.cos(a1) * radius, yOffset, z + Math.sin(a1) * radius];
        
        pushTri(center, p1, p2, [0, 1, 0], shadowColor);
    }
}

function createCloud(cx, cy, cz) {
    let parts = 6 + Math.floor(pseudoRandom(cx, cz) * 6);  //diff num of cloud puffs for diff clouds for randomness

    for (let i = 0; i < parts; i++) {   //scattered puff placement
        let offsetX = (pseudoRandom(cx + i, cz) - 0.5) * 1.5;
        let offsetZ = (pseudoRandom(cx, cz + i) - 0.5) * 1.5;
        let offsetY = (pseudoRandom(cx + i * 2, cz + i * 3)) * 0.4;

        let size = 0.6 + pseudoRandom(cx + i * 5, cz) * 0.8;

        createCloudPuff(
            cx + offsetX,
            cy + offsetY,
            cz + offsetZ,
            size
        );
    }
}

function createCloudPuff(x, y, z, size) {
    let sides = 10;
    let color = [0.95, 0.96, 0.98];

    for (let i = 0; i < sides; i++) {   //circular puff geometry 
        let a = (i / sides) * Math.PI * 2;
        let b = ((i + 1) / sides) * Math.PI * 2;

        let p1 = [x + Math.cos(a) * size, y, z + Math.sin(a) * size];
        let p2 = [x + Math.cos(b) * size, y, z + Math.sin(b) * size];
        let top = [x, y + size * 0.6, z];

        let n = computeNormal(p1, p2, top);

        pushTri(p1, p2, top, n, color, 0.2); //fade factor for softness
    }
}
