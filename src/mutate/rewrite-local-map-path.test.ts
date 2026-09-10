import { existsSync, readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
    defaultLocalDocumentsRoot,
    embedReplayMetadata,
    findMapArchivePaths,
    parseHeader,
    parseReplay,
    prepareForLocalCoh,
    rewriteLocalMapArchivePaths,
    toLocalMapArchivePath,
} from "../index";

const FIXTURE = "fixtures/vire_foreign_map_path.rec";
const TEMP = "temp.rec";

describe("toLocalMapArchivePath", () => {
    it("rewrites foreign Users path keeping My Games suffix", () => {
        const foreign =
            "C:\\Users\\oscar\\Documents\\My Games\\Company of Heroes Relaunch\\ww2\\scenarios\\subscriptions\\7278971321831129089.sga";
        expect(
            toLocalMapArchivePath(foreign, "C:\\Users\\Richa\\Documents"),
        ).toBe(
            "C:\\Users\\Richa\\Documents\\My Games\\Company of Heroes Relaunch\\ww2\\scenarios\\subscriptions\\7278971321831129089.sga",
        );
    });

    it("returns null for non-archive or non-CoH paths", () => {
        expect(
            toLocalMapArchivePath(
                "C:\\Users\\oscar\\Documents\\foo.txt",
                "C:\\Users\\Richa\\Documents",
            ),
        ).toBeNull();
        expect(
            toLocalMapArchivePath(
                "DATA:scenarios\\mp\\vire",
                "C:\\Users\\Richa\\Documents",
            ),
        ).toBeNull();
    });
});

describe("rewriteLocalMapArchivePaths", () => {
    it.skipIf(!existsSync(FIXTURE))(
        "rewrites oscar fixture path to local Documents",
        () => {
            const original = new Uint8Array(readFileSync(FIXTURE));
            const before = findMapArchivePaths(original);
            expect(before.length).toBeGreaterThanOrEqual(1);
            expect(before[0]!.path).toContain("\\Users\\oscar\\");

            const { bytes, rewritten } = rewriteLocalMapArchivePaths(original, {
                localDocuments: "C:\\Users\\Richa\\Documents",
            });
            expect(rewritten).toEqual([
                {
                    from: before[0]!.path,
                    to: "C:\\Users\\Richa\\Documents\\My Games\\Company of Heroes Relaunch\\ww2\\scenarios\\subscriptions\\7278971321831129089.sga",
                },
            ]);

            const after = findMapArchivePaths(bytes);
            expect(after[0]!.path).toContain("\\Users\\Richa\\");
            expect(after[0]!.path).not.toContain("\\Users\\oscar\\");

            const header = parseHeader(bytes);
            expect(header.header.mapName).toContain("Vire River Valley");
            const full = parseReplay(bytes);
            expect(full.meta.warnings).toEqual([]);
            expect(full.actions.length).toBe(
                parseReplay(original).actions.length,
            );
        },
    );

    it.skipIf(!existsSync(TEMP))(
        "round-trips path on temp.rec via a foreign Documents root",
        () => {
            const original = new Uint8Array(readFileSync(TEMP));
            const local = findMapArchivePaths(original)[0]?.path;
            expect(local).toBeTruthy();

            const foreign = rewriteLocalMapArchivePaths(original, {
                localDocuments: "C:\\Users\\oscar\\Documents",
            });
            expect(foreign.rewritten.length).toBe(1);
            expect(foreign.rewritten[0]!.to).toContain("\\Users\\oscar\\");

            const back = rewriteLocalMapArchivePaths(foreign.bytes, {
                localDocuments: "C:\\Users\\Richa\\Documents",
            });
            expect(back.rewritten[0]!.to).toBe(
                "C:\\Users\\Richa\\Documents\\My Games\\Company of Heroes Relaunch\\ww2\\scenarios\\subscriptions\\7278971321831129089.sga",
            );
        },
    );

    it.skipIf(!existsSync(TEMP))(
        "keeps archive under the provided Documents root",
        () => {
            const original = new Uint8Array(readFileSync(TEMP));
            const docs =
                defaultLocalDocumentsRoot() ?? "C:\\Users\\Richa\\Documents";
            const { bytes } = rewriteLocalMapArchivePaths(original, {
                localDocuments: docs,
            });
            const paths = findMapArchivePaths(bytes);
            expect(
                paths[0]!.path.toLowerCase().startsWith(docs.toLowerCase()),
            ).toBe(true);
        },
    );
});

describe("prepareForLocalCoh", () => {
    it.skipIf(!existsSync(FIXTURE))(
        "strips FKSTMETA and rewrites foreign map paths",
        () => {
            const foreign = new Uint8Array(readFileSync(FIXTURE));
            const withTrailer = embedReplayMetadata(foreign, {
                steamIdsByName: { Alice: "76561198000000000" },
                playerIdsByName: {},
            });

            const { bytes, rewritten } = prepareForLocalCoh(withTrailer, {
                localDocuments: "C:\\Users\\Richa\\Documents",
            });

            expect(rewritten.length).toBe(1);
            expect(findMapArchivePaths(bytes)[0]!.path).toContain(
                "\\Users\\Richa\\",
            );
            expect(bytes.length).toBeLessThan(withTrailer.length);
            expect(parseHeader(bytes).header.mapName).toContain(
                "Vire River Valley",
            );
        },
    );
});
