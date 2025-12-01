import * as fs from 'fs';

export class ActionDefinitions {
    // Map<ID, Map<Category, Description>>
    private definitions: Map<number, Map<string, string>> = new Map();

    constructor(filePath: string) {
        this.load(filePath);
    }

    private load(filePath: string) {
        if (!fs.existsSync(filePath)) {
            console.warn(`Action definitions file not found: ${filePath}`);
            return;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        
        // Regex to match: 9,0,CATEGORY,"Description",0xHEX,1
        // Example: 9,0,BUILDING,"Barracks",0x5eb,1
        const regex = /^\d+,\d+,(\w+),"([^"]+)",(0x[0-9a-fA-F]+),/;

        for (const line of lines) {
            const match = line.match(regex);
            if (match) {
                const category = match[1];
                const description = match[2];
                const hexId = parseInt(match[3], 16);

                if (!this.definitions.has(hexId)) {
                    this.definitions.set(hexId, new Map());
                }
                this.definitions.get(hexId)!.set(category, description);
            }
        }
    }

    public getDescription(actionId: number, allowedCategories?: string[]): string {
        const categoryMap = this.definitions.get(actionId);
        if (!categoryMap) return "";

        if (allowedCategories && allowedCategories.length > 0) {
            for (const cat of allowedCategories) {
                if (categoryMap.has(cat)) {
                    return categoryMap.get(cat)!;
                }
            }
            return ""; // Found ID but not in allowed categories
        }

        // If no categories specified, join all (fallback behavior)
        return Array.from(categoryMap.values()).join(' / ');
    }
}
