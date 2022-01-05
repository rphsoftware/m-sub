const { openSync, readSync, readFileSync, fstatSync, writeFileSync } = require('fs');
const fxp = require('fast-xml-parser');
// Open the file
let f = process.argv[2] || "oilprices";
const file = openSync(f + '.mkv', 'r');
let offset = 0;

function read_vint(cutHeader = false, bigInt = true, specialLengthTreatment = false) {
    let buf = Buffer.alloc(1);
    let len = 0;
    readSync(file, buf, 0, 1, offset);

    if (specialLengthTreatment) {
        if (buf[0] === 0xFF) {
            return -1;
        }
    }

    for (let i = 1; i <= 8; i++) {
        let a = (buf[0] >> (8 - i)) & 1;
        if (a === 1) {
            len = i;
            break;
        }
    }

    buf = Buffer.alloc(len);
    readSync(file, buf, 0, len, offset);
    offset += len;

    if (cutHeader) {
        buf[0] = ((buf[0] << len) & 0xFF) >> len;
    }

    if (bigInt) {
        let result = 0n;
        for (let i = 0; i < len; i++) {
            result = result << 8n;
            result = result | BigInt(buf[i]);
        }

        return result;
    } else {
        let result = 0;
        for (let i = 0; i < len; i++) {
            result = result << 8;
            result = result | buf[i];
        }

        return result;
    }
}


const ebml_meta = readFileSync("ebml_matroska.xml", "utf-8");
const parser = new fxp.XMLParser({
    ignoreAttributes: false
});
const data = parser.parse(ebml_meta).EBMLSchema.element;

// Build the tree
const parsing_tree = {children:{}};

for (const element of data) {

    const pathComponents = element["@_path"].split(/\\/g).filter(a => a.length > 0);
    let p = parsing_tree;

    for (const component of pathComponents) {
        if (!p.children[component]) {
            p.children[component] = {children:{}, payload:null};
        }
        p = p.children[component];
    }

    let cleanElement = {};
    for (const key in element) {
        if (key.startsWith("@_")) {
            cleanElement[key.substr(2)] = element[key];
        }
    }
    cleanElement["id"] = parseInt(cleanElement["id"]);
    p.payload = cleanElement;
}
parsing_tree.children["EBML"].payload = {
    name: "EBML",
    path: "\\EBML",
    id: 0x1A45DFA3,
    minOccurs: 1,
    maxOccurs: 1,
    type: "master",
    description: "Set the EBML characteristics of the data to follow. Each EBML Document has to start with this."
}

parsing_tree.children["EBML"].children["EBMLVersion"] = {
    children: {},
    payload: {
        name: "EBMLVersion",
        path: "\\EBML\\EBMLVersion",
        id: 0x4286,
        minOccurs: 1,
        maxOccurs: 1,
        type: "uinteger",
        description: "The version of EBML specifications used to create the file."
    }
};

parsing_tree.children["EBML"].children["EBMLReadVersion"] = {
    children: {},
    payload: {
        name: "EBMLReadVersion",
        path: "\\EBML\\EBMLReadVersion",
        id: 0x42f7,
        minOccurs: 1,
        maxOccurs: 1,
        type: "uinteger",
        description: "The minimum EBML version an EBML Reader has to support to read this EBML Document."
    }
};

parsing_tree.children["EBML"].children["DocType"] = {
    children: {},
    payload: {
        name: "DocType",
        path: "\\EBML\\DocType",
        id: 0x4282,
        minOccurs: 1,
        maxOccurs: 1,
        type: "string",
        description: "A string that describes and identifies the content of the EBML Body."
    }
};

parsing_tree.children["EBML"].children["DocTypeVersion"] = {
    children: {},
    payload: {
        name: "DocTypeVersion",
        path: "\\EBML\\DocTypeVersion",
        id: 0x4287,
        minOccurs: 1,
        maxOccurs: 1,
        type: "uinteger",
        description: "The version of DocType interpreter used to create the EBML Document"
    }
};

parsing_tree.children["EBML"].children["DocTypeReadVersion"] = {
    children: {},
    payload: {
        name: "DocTypeReadVersion",
        path: "\\EBML\\DocTypeReadVersion",
        id: 0x4285,
        minOccurs: 1,
        maxOccurs: 1,
        type: "uinteger",
        description: "The minimum DocType version an EBML Reader has to support to read this EBML"
    }
};

function read_element(currentPath = []) {
    const id = read_vint(false, false);
    const size = read_vint(true, false, true);

    if (size === -1) throw new Error("Unimplemented");

    // Look for the ID in the parsing tree, given the current context
    let p = parsing_tree;
    for (let el of currentPath) {
        p = p.children[el];
    }

    let strId = null;
    let meta = null;
    for (let child in p.children) {
        if (p.children[child].payload.id === id) {
            strId = child;
            meta = p.children[child].payload;
        }
    }

    if (id === 0xEC) {
        strId = 'void';
        meta = {
            type: 'binary'
        }
    }
    if (id === 0xBF) {
        offset += 4;
        return {
            name: 'bf',
            offset: 0,
            size: 0,
            file: f + '.mkv'
        }
    }
    if (!strId) throw new Error("Unknown ID: " + id.toString(16) + " " + offset);

    let data;
    let result;
    let dv;
    switch (meta.type) {
        case "master":
            let readStart = offset;
            let children = [];
            while (offset - readStart < size) {
                const child = read_element(currentPath.concat(strId));
                if (child.name === "bf") continue;
                if (child.name === "void") continue;
                children.push(child);
            }
            return {
                name: strId,
                children
            }
        case "uinteger":
            data = Buffer.alloc(8);
            readSync(file, data, 8 - size, size, offset);
            offset += size;

            dv = new DataView(data.buffer, data.byteOffset, data.byteLength);


            return {
                name: strId,
                value: dv.getBigUint64(0, false)
            }
        case "integer":
            data = Buffer.alloc(8);
            readSync(file, data, 8 - size, size, offset);
            offset += size;

            dv = new DataView(data.buffer, data.byteOffset, data.byteLength);

            return {
                name: strId,
                value: dv.getBigInt64(0, false)
            };
        case "string":
            data = Buffer.alloc(size);
            readSync(file, data, 0, size, offset);
            offset += size;

            return {
                name: strId,
                value: data.toString("ascii")
            }
        case "utf-8":
            data = Buffer.alloc(size);
            readSync(file, data, 0, size, offset);
            offset += size;

            return {
                name: strId,
                value: data.toString("utf-8")
            }
        case "date":
            data = Buffer.alloc(8);
            readSync(file, data, 8 - size, size, offset);
            offset += size;

            dv = new DataView(data.buffer, data.byteOffset, data.byteLength);

            return {
                name: strId,
                value: dv.getBigInt64(0, false)
            };
        case "float":
            data = Buffer.alloc(size);
            if (![0,4,8].includes(size)) throw new Error("Invalid float size!");
            if (size === 0) {
                return {
                    name: strId, value: 0
                }
            }
            readSync(file, data, 0, size, offset);
            offset += size;
            result = 0;
            if (size === 4) {
                result = (new DataView(data.buffer, data.byteOffset, data.byteLength)).getFloat32(0);
            } else {
                result = (new DataView(data.buffer, data.byteOffset, data.byteLength)).getFloat64(0);
            }

            return {
                name: strId,
                value: result
            };
        case "binary":
            let of = offset;
            offset += size;
            return {
                name: strId,
                value: {
                    offset: of,
                    size,
                    file: f + ".mkv"
                }
            }
        default:
            throw new Error("Unknown type: " + meta.type);
    }
}


let resultTree = [];

while(offset < fstatSync(file).size) {
    resultTree.push(read_element());
}

writeFileSync(f + ".json", JSON.stringify(resultTree, (k, v) => {if(typeof v === 'bigint') { return v.toString(10);} else { return v; }}, 2));