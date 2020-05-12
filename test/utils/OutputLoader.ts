import { promises as fs } from 'fs';
import path from 'path';

const OUTPUT_FOLDER = path.resolve(__dirname, '..', 'test-data', 'output');

export default abstract class OutputLoader {
    public static async loadOutputFiles(): Promise<Map<string, string>> {
        const outputFiles = new Map();
        const files = await fs.readdir(OUTPUT_FOLDER);

        for await (const file of files) {
            outputFiles.set(file, (await fs.readFile(path.resolve(OUTPUT_FOLDER, file))).toString());

        }

        return outputFiles;
    }
}