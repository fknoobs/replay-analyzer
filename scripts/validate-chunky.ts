import { readFileSync } from "fs";
import { stripReplayMetadata } from "../src/index";
import { ReplayStream } from "../src/replay-stream";

function validate(label: string, path: string) {
    const body = stripReplayMetadata(new Uint8Array(readFileSync(path)));
    const stream = new ReplayStream(body);
    stream.seek(76);
    const problems: string[] = [];

    const enter = () => {
        const pos = stream.position;
        const sig = stream.readASCIIStr(12);
        if (sig !== "Relic Chunky") {
            stream.seek(pos);
            return false;
        }
        stream.skip(4);
        const ver = stream.readUInt32();
        if (ver !== 3) {
            problems.push(`chunky ver ${ver} at ${pos}`);
            stream.seek(pos);
            return false;
        }
        stream.skip(4);
        const length = stream.readUInt32();
        stream.skip(length - 28);
        return true;
    };

    const walk = (end: number, depth: number): void => {
        while (stream.position + 8 <= end) {
            const start = stream.position;
            const type = stream.readASCIIStr(8);
            if (!(type.startsWith("FOLD") || type.startsWith("DATA"))) {
                stream.seek(start);
                return;
            }
            const ver = stream.readUInt32();
            const len = stream.readUInt32();
            const nameLen = stream.readUInt32();
            stream.skip(8);
            if (nameLen > 0) {
                if (stream.position + nameLen > body.length) {
                    problems.push(`${type} name OOB`);
                    return;
                }
                stream.skip(nameLen);
            }
            const dataStart = stream.position;
            const dataEnd = dataStart + len;
            if (dataEnd > body.length) {
                problems.push(
                    `${type} v${ver} len ${len} ends at ${dataEnd} > ${body.length}`,
                );
                return;
            }
            if (dataEnd > end + 0) {
                // nested must fit parent — soft check
            }
            if (type.startsWith("FOLD")) {
                walk(dataEnd, depth + 1);
                if (stream.position !== dataEnd) {
                    problems.push(
                        `${type} walk ended at ${stream.position}, expected ${dataEnd} (delta ${stream.position - dataEnd})`,
                    );
                    stream.seek(dataEnd);
                }
            } else {
                stream.seek(dataEnd);
            }
        }
    };

    for (let i = 0; i < 2; i++) {
        if (!enter()) {
            problems.push(`chunky ${i} missing at ${stream.position}`);
            break;
        }
        // Walk until we can't
        const before = stream.position;
        // Conservative: walk until non-chunk
        while (stream.position + 8 < body.length) {
            const p = stream.position;
            const t = stream.readASCIIStr(8);
            stream.seek(p);
            if (!(t.startsWith("FOLD") || t.startsWith("DATA"))) break;
            const ver = stream.readUInt32();
            stream.seek(p + 8);
            stream.readUInt32(); // ver already wrong - reset
            stream.seek(p);
            const type = stream.readASCIIStr(8);
            stream.readUInt32();
            const len = stream.readUInt32();
            const nameLen = stream.readUInt32();
            stream.skip(8 + nameLen);
            const dataStart = stream.position;
            const dataEnd = dataStart + len;
            if (type.startsWith("FOLD")) {
                walk(dataEnd, 0);
                if (stream.position !== dataEnd) {
                    problems.push(
                        `top ${type} ended ${stream.position} vs ${dataEnd}`,
                    );
                    stream.seek(dataEnd);
                }
            } else {
                stream.seek(dataEnd);
            }
        }
        console.log(label, `chunky${i} consumed until`, stream.position);
    }

    // Tick stream sanity: after header, packets
    let pos = stream.position;
    let packets = 0;
    let bad = 0;
    while (pos + 8 <= body.length && packets < 20) {
        const view = new DataView(body.buffer, body.byteOffset + pos, 8);
        const type = view.getUint32(0, true);
        const len = view.getUint32(4, true);
        if (len > 1_000_000 || pos + 8 + len > body.length) {
            bad++;
            problems.push(
                `packet@${pos} type=${type} len=${len} remaining=${body.length - pos}`,
            );
            break;
        }
        packets++;
        pos += 8 + len;
    }

    console.log({
        label,
        size: body.length,
        problems,
        firstPackets: packets,
        headerEndGuess: stream.position,
    });
}

validate("broken", "replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec");
validate(
    "control",
    process.env.USERPROFILE +
        "\\Documents\\My Games\\Company of Heroes Relaunch\\playback\\control_langres_ok.rec",
);
validate("bznk", "replay_bznk6qkkzf_pcladdt4mp.rec");
