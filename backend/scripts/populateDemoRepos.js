"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const populateDemoRepos_1 = require("../src/utils/populateDemoRepos");
const prisma_1 = __importDefault(require("../src/utils/prisma"));
const queueService_1 = require("../src/services/queueService");
dotenv_1.default.config();
async function main() {
    try {
        const result = await (0, populateDemoRepos_1.populateDemoRepos)({ silent: false });
        // Close Prisma connection
        await prisma_1.default.$disconnect();
        // Close Redis connection
        await queueService_1.repoQueue.close();
        process.exit(result.errors > 0 ? 1 : 0);
    }
    catch (error) {
        console.error('Fatal error:', error);
        await prisma_1.default.$disconnect();
        await queueService_1.repoQueue.close();
        process.exit(1);
    }
}
main();
