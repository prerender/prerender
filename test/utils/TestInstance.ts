import express, { Express } from 'express';
import { Server } from 'http';
import path from 'path';

// Since that part is not typed, we ts-ignore these for now, until further refactor of the server.
// @ts-ignore
import prerenderUtils from '../../lib/util';

/**
 * A test web server to act like a customer's web server. We could have mocked it,
 * but since it's under our (the tests's) full control it will provide us with the
 * same reliability but with more accurate tests.
 */
export default class TestInstance {
    address: string;
    app: Express;
    port: number;
    serverReference: Server | undefined;

    constructor(port: number = 8989) {
        this.port = port;
        this.address = `localhost:${port}`; // default address

        this.app = express();
        this.app.use(express.static(path.resolve(__dirname, '..', 'test-data', 'input')));
    }

    /**
     * Starts the test server.
     */
    public start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.serverReference = this.app.listen(this.port, () => {
                prerenderUtils.log(`TestInstance started on port ${this.port}`);

                this.address = prerenderUtils.getServerAddress(this.serverReference?.address());

                resolve();
            });
        });
    }

    /**
     * Stops the test server.
     */
    public stop() {
        return new Promise((resolve, reject) => {
            this.serverReference?.close(error => {
                if (error) {
                    prerenderUtils.log('TestInstance failed to stop');
                    reject(error);
                } else {
                    prerenderUtils.log('TestInstance stopped');
                    resolve();
                }
            });
        });
    }
}