"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionDefinitions = void 0;
const fs = __importStar(require("fs"));
class ActionDefinitions {
    constructor(filePath) {
        // Map<ID, Map<Category, Description>>
        this.definitions = new Map();
        this.load(filePath);
    }
    load(filePath) {
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
                this.definitions.get(hexId).set(category, description);
            }
        }
    }
    getDescription(actionId, allowedCategories) {
        const categoryMap = this.definitions.get(actionId);
        if (!categoryMap)
            return "";
        if (allowedCategories && allowedCategories.length > 0) {
            for (const cat of allowedCategories) {
                if (categoryMap.has(cat)) {
                    return categoryMap.get(cat);
                }
            }
            return ""; // Found ID but not in allowed categories
        }
        // If no categories specified, join all (fallback behavior)
        return Array.from(categoryMap.values()).join(' / ');
    }
}
exports.ActionDefinitions = ActionDefinitions;
