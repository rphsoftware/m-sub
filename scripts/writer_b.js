const { openSync, readSync, readFileSync, statSync, writeFileSync, appendFileSync, unlinkSync } = require('fs');
const fxp = require('fast-xml-parser');

let f = "base_3";
let rawdata = JSON.parse(readFileSync(f + ".json", "utf-8"));

writeFileSync(f + ".processed.mkv", Buffer.alloc(0));

const ebml_meta = readFileSync("ebml_matroska.xml", "utf-8");
const parser = new fxp.XMLParser({
    ignoreAttributes: false
});
const data = parser.parse(ebml_meta).EBMLSchema.element;

function serialize_raw_id(id) {
    let a = Buffer.alloc(Math.ceil(Math.log2(id) / 8));

    for (let i = a.length - 1; i >= 0; i--) {
        a[i] = id & 0xFF;
        id = id >> 8;
    }

    return a;
}

function serialize_vint(data) {
    let a = Buffer.alloc(Math.ceil(Math.log2(data + 1) / 7));

    // Write binary data for the numbre into the buffer
    for (let i = a.length - 1; i >= 0; i--) {
        a[i] = data & 0xff;
        data = data >> 8;
    }

    let byteCount = a.byteLength;
    let mask = 0x80 >> (byteCount - 1);

    a[0] = a[0] | mask;

    return a;
}

// Build the tree
const parsing_tree = {children:{}};
let fds = new Map();

function get_fd(path) {
    if (!fds.has(path)) {
        fds.set(path, openSync(path, "r"));
    }

    return fds.get(path);
}

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

function calculateSegmentWidth(path = [], data, includeSelf = false) {
    if (data === null) return 0;
    let currSize = 0;
    // Resolve info payload

    let p = parsing_tree;

    for (let a of path) {
        p = p.children[a];
    }

    let encodingInfo = p.children[data.name].payload;

    switch(encodingInfo.type) {
        case "master":
            // Recursively calculate sizes of children
            for (let child of data.children) {
                currSize += calculateSegmentWidth(path.concat(data.name), child, true);
            }
            break;
        case "uinteger":
            currSize += 8;
            break;
        case "string":
            currSize += Buffer.from(data.value, "ascii").byteLength;
            break;
        case "utf-8":
            currSize += Buffer.from(data.value, "utf-8").byteLength;
            break;
        case "binary":
            currSize += data.value.size;
            break;
        case "float":
            currSize += 8;
            break;
        case "integer":
            currSize += 8;
            break;
        default:
            throw new Error("Unknown type: " + encodingInfo.type);
    }

    if (includeSelf) {
        currSize += serialize_vint(currSize).byteLength;
        currSize += serialize_raw_id(encodingInfo.id).byteLength;
    }

    return currSize;
}

function write_segment(path = [], data, cPath) {
    if (data === null) return 0;
    let p = parsing_tree;

    for (let a of path) {
        p = p.children[a];
    }

    let encodingInfo = p.children[data.name].payload;

    appendFileSync(f + ".processed.mkv", serialize_raw_id(encodingInfo.id));
    appendFileSync(f + ".processed.mkv", serialize_vint(calculateSegmentWidth(path, data)));

    cPath = `${cPath}{${encodingInfo.name}}`;
    console.log("WRITE",encodingInfo.name,encodingInfo.type,calculateSegmentWidth(path,data), statSync(f + ".processed.mkv").size.toString(16), cPath);



    let ab, dv, fd, buf;
    switch(encodingInfo.type) {
        case "master":
            // Recursively write children
            let xx = 0;
            for (let child of data.children) {
                write_segment(path.concat(data.name), child, `${cPath}/${xx}`);
                xx++;
            }
            break;
        case "uinteger":
            ab = new ArrayBuffer(8);
            dv = new DataView(ab);
            dv.setBigUint64(0, BigInt(data.value));
            appendFileSync(f + ".processed.mkv", Buffer.from(ab));
            break;
        case "string":
            appendFileSync(f + ".processed.mkv", Buffer.from(data.value, "ascii"));
            break;
        case "utf-8":
            appendFileSync(f + ".processed.mkv", Buffer.from(data.value, "ascii"));
            break;
        case "binary":
            fd = get_fd(data.value.file);
            buf = Buffer.alloc(data.value.size);
            readSync(fd, buf, 0, data.value.size, data.value.offset);
            appendFileSync(f + ".processed.mkv", buf);
            break;
        case "integer":
            ab = new ArrayBuffer(8);
            dv = new DataView(ab);
            dv.setBigInt64(0, BigInt(data.value));
            appendFileSync(f + ".processed.mkv", Buffer.from(ab));
            break;
        case "float":
            ab = new ArrayBuffer(8);
            dv = new DataView(ab);
            dv.setFloat64(0, data.value);
            appendFileSync(f + ".processed.mkv", Buffer.from(ab));
            break;
        default:
            throw new Error("Unsupported segment type: " + encodingInfo.type);
    }

    console.log("WRITE DONE",encodingInfo.name,encodingInfo.type,calculateSegmentWidth(path,data), statSync(f + ".processed.mkv").size.toString(16));
}

let xx = 0;
for (let a of rawdata) {
    write_segment([], a, `/${xx}`);
    xx++;
}
//console.log(write_segment([], rawdata[0]));

serialize_vint(127);