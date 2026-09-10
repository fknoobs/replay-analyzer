import { existsSync, readFileSync, writeFileSync } from "fs";
import {
    findMapArchivePaths,
    prepareForLocalCoh,
    rewriteLocalMapArchivePaths,
} from "../src/rewrite-local-map-path";

if (!existsSync("temp.rec")) {
    throw new Error("temp.rec required to build fixture");
}

const temp = new Uint8Array(readFileSync("temp.rec"));
const foreign = rewriteLocalMapArchivePaths(temp, {
    localDocuments: "C:\\Users\\oscar\\Documents",
});
writeFileSync("fixtures/vire_foreign_map_path.rec", foreign.bytes);

console.log("fixture paths", findMapArchivePaths(foreign.bytes));
const prepared = prepareForLocalCoh(foreign.bytes, {
    localDocuments: "C:\\Users\\Richa\\Documents",
});
console.log("prepared", prepared.rewritten);
console.log(
    "after",
    findMapArchivePaths(prepared.bytes).map((h) => h.path),
);
