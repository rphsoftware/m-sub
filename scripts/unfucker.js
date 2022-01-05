// Block ordering fixer
const { statSync, readdirSync, unlinkSync, openSync, readSync } = require('fs');
const { readFileSync, writeFileSync } = require('fs');

let file = JSON.parse(readFileSync('base_2.json', 'utf-8'));
let fds = new Map();

function get_fd(path) {
	if (!fds.has(path)) {
		fds.set(path, openSync(path, "r"));
	}

	return fds.get(path);
}

function parseAll(data, cPath, parent, index) {
	if (data === null) return;
	cPath = `${cPath}{${data.name}}`;

	if (/^\/\[1]{Segment}\/\[\d+]{Cluster}$/.test(cPath)) {
		console.log("Kluster");

		let children = data.children;
		let nbChildren = children.map((v,i) => {
			if (v.name !== "BlockGroup" && v.name !== "SimpleBlock") return [v,i];
			else return null;
		}).filter(v => v !== null);
		if (nbChildren.length > 1) throw new Error("Bäd Klüster");
		if (nbChildren.length === 1) {
			if (nbChildren[0][1] !== 0) throw new Error("Bäd Klüster");
		}

		let ts = nbChildren[0][0];
		let boChildren = children.filter(a => a.name === "BlockGroup" || a.name === "SimpleBlock");

		// Create auxiliary data
		let tracks = new Map();
		for (let child of boChildren) {
			let binPrefs = null;
			if (child.name === "SimpleBlock") {
				binPrefs = child.value;
			}
			if (child.name === "BlockGroup") {
				for (let grandchild of child.children) {
					if (grandchild.name === "Block") binPrefs = grandchild.value;
				}
			}
			if (binPrefs === null) {
				console.log(child);
				throw new Error("Bäd Blöcc");
			}

			let fd = get_fd(binPrefs.file);
			let blockBuf = Buffer.alloc(binPrefs.size);
			readSync(fd, blockBuf, 0, binPrefs.size, binPrefs.offset);

			if (blockBuf[0] < 0x81) throw new Error("Fuck off with your 62727 track file");
			let tid = blockBuf[0] - 0x80;

			let tsAb = new ArrayBuffer(2);
			let tsUa = new Uint8Array(tsAb);
			tsUa[0] = blockBuf[1];
			tsUa[1] = blockBuf[2];
			let ts = new DataView(tsAb).getInt16(0);

			child._aux_ts = ts;
			child._tid = tid;

			if (!tracks.has(tid)) tracks.set(tid, {highestTs: Number.MIN_SAFE_INTEGER, groups: []});

			let track = tracks.get(tid);
			if (ts > track.highestTs) {
				track.highestTs = ts;
				track.groups.push([child]);
			} else {
				track.groups[track.groups.length-1].push(child);
			}
		}

		let tgs = [];
		// Assign startTs to each track group
		for (let track of tracks.values()) {
			for (let group of track.groups) {
				let ts = Number.MAX_SAFE_INTEGER;
				for (let child of group) {
					if (child._aux_ts < ts) ts = child._aux_ts;
				}

				tgs.push([ts, group]);
			}
		}

		tgs = tgs.sort((a, b) => a[0] - b[0]).map(a => a[1]).flat().map(a => {
			delete a._aux_ts;
			delete a._tid;
			return a;
		});

		data.children = [nbChildren[0][0], ...tgs];
		return;
	}

	if (data.children) {
		let b = 0;
		data.children.forEach(child => {
			parseAll(child, `${cPath}/[${b}]`, data, b);
			b++;
		});
	}
}

let b = 0;
for (let a of file) {
	parseAll(a, `/[${b}]`, file, b);
	b++;
}

writeFileSync("base_3.json", JSON.stringify(file, null, 4));