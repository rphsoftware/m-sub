const { statSync, readdirSync, unlinkSync } = require('fs');

let centisecondsPerFile = 4;
let a = {
	"name": "TrackEntry",
	"children": [
		{
			"name": "TrackNumber",
			"value": "3"
		},
		{
			"name": "TrackUID",
			"value": "0"
		},
		{
			"name": "TrackType",
			"value": "17"
		},
		{
			"name": "CodecID",
			"value": "S_TEXT/ASS"
		},
		{
			"name": "FlagForced",
			"value": 1
		},
		{
			"name": "FlagLacing",
			"value": 0
		},
		{
			"name":"CodecPrivate",
			"value": {
				"file":"subs/head.ass",
				"offset":0,
				"size": statSync("subs/head.ass").size
			}
		},
		{
			"name": "ContentEncodings",
			"children": [
				{
					"name": "ContentEncoding",
					"children": [
						{
							"name": "ContentCompression",
							"children": []
						}
					]
				}
			]
		}
	]
};

let aeae =      {
	"name": "Attachments",
	"children": [
		{
			"name": "AttachedFile",
			"children": [
				{
					"name": "FileName",
					"value": "BrailleBlockRegular_0.ttf"
				},
				{
					"name": "FileMimeType",
					"value": "font/ttf"
				},
				{
					"name": "FileData",
					"value": {
						"offset": 0,
						"size": statSync("BrailleBlockRegular.ttf").size,
						"file": "BrailleBlockRegular.ttf"
					}
				},
				{
					"name": "FileUID",
					"value": "308042706288487229"
				},
				{
					"name": "FileDescription",
					"value": "Embedded ass font"
				}
			]
		}
	]
};

const { readFileSync, writeFileSync } = require('fs');

let file = JSON.parse(readFileSync('base.json', 'utf-8'));
let tn = 3;
function parseAll(data, cPath, parent, index) {
	cPath = `${cPath}{${data.name}}`;

	if (/^\/\[1]{Segment}$/.test(cPath)) {
		data.children = data.children.map(a => {
			if (a.name === "Tracks") {
				return [a, aeae];
			} else {
				return [a];
			}
		}).flat();
	}

	if (/^\/\[1]{Segment}\/\[\d+]{Tracks}$/.test(cPath)) {
		a.children[0].value = data.children.length + 1;
		tn = data.children.length + 1;
		data.children.push(a);
	}

	if (/^\/\[1]{Segment}\/\[\d+]{Info}\/\[\d+]{MuxingApp}$/.test(cPath)) {
		data.value = "Rph's Bad MKV Muxer/1.0";
	}

	if (/^\/\[1]{Segment}\/\[\d+]{Info}\/\[\d+]{WritingApp}$/.test(cPath)) {
		data.value = "Video to Subtitle/2.0";
	}

	if (/^\/\[1]{Segment}\/\[\d+]{Cluster}$/.test(cPath)) {
		let lower = Math.ceil(parseInt(data.children.filter(a => a.name === "Timestamp")[0].value) / 10);
		let realCt = parseInt(data.children.filter(a => a.name === "Timestamp")[0].value);

		let upper = Number.MAX_VALUE;
		console.log("Kluster");
		if (parent.children[index + 1].name === "Cluster") {
			upper = Math.ceil(parseInt(parent.children[index + 1].children.filter(a => a.name === "Timestamp")[0].value) / 10);
		}

		console.log("Lower", lower, "Upper", upper);

		let b = readdirSync("subs");
		let c = b
			.filter(a => a.endsWith("_0.ass.zlib"))
			.map(a => parseInt(a))
			.sort((a,b)=>a-b)
			.filter((a) => {
				if ((a * centisecondsPerFile) < lower) {
					return false;
				}
				return (a * centisecondsPerFile) < upper;

			});
		let nc = [];
		for (let frame of c) {
			let realTimestamp = (frame * centisecondsPerFile) * 10;
			let timeOffset = realTimestamp - realCt;

			let fileName = `subs/${frame}_0.ass.zlib`;
			let blockRaw = readFileSync(fileName);
			let blockSuffix = new ArrayBuffer(4);
			let blockSuffixDv = new DataView(blockSuffix);

			blockSuffixDv.setUint8(0, 0x80 + tn);
			blockSuffixDv.setInt16(1, timeOffset);
			blockSuffixDv.setUint8(3, 0);

			writeFileSync(`subs/${frame}_0.content`, Buffer.concat([Buffer.from(blockSuffix), blockRaw]));

			fileName = `subs/${frame}_1.ass.zlib`;
			let blockRaw2 = readFileSync(fileName);
			writeFileSync(`subs/${frame}_1.content`, Buffer.concat([Buffer.from(blockSuffix), blockRaw2]));

			// unlinkSync(fileName);

			nc.push({
				"name":"BlockGroup",
				"children":[
					{
						"name":"Block",
						"value":{
							"file":`subs/${frame}_0.content`,
							"offset":0,
							"size": blockRaw.byteLength + 4
						}
					},
					{
						"name":"BlockDuration",
						"value":40
					}
				]
			})

			nc.push({
				"name":"BlockGroup",
				"children":[
					{
						"name":"Block",
						"value":{
							"file":`subs/${frame}_1.content`,
							"offset":0,
							"size": blockRaw2.byteLength + 4
						}
					},
					{
						"name":"BlockDuration",
						"value":40
					}
				]
			})
		}
		let tsb = data.children.filter(a => a.name === "Timestamp");
		let ntsb = data.children.filter(a => a.name !== "Timestamp");

		data.children = [tsb, nc, ntsb].flat();
	}

	if (/^\/\[1]{Segment}\/\[\d]{SeekHead}$/.test(cPath) || /^\/\[1]{Segment}\/\[\d]{Tags}$/.test(cPath)) {
		delete parent.children[index];
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

writeFileSync("base_2.json", JSON.stringify(file, null, 4));