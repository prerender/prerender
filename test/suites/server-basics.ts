import assert from 'assert';

// Since that part is not typed, we ts-ignore these for now, until further refactor of the server.
// @ts-ignore
import Prerender from '../../lib';

import TestInstance from '../utils/TestInstance';
import OutputLoader from '../utils/OutputLoader';
import PrerenderServerInvoker from '../utils/PrerenderServerInvoker';

describe('Server - simple', function() {
    let server: Prerender;
    let expectedOutputFiles: Map<string, string>;
    let testInstance: TestInstance;

    beforeEach(function(done) {
        OutputLoader.loadOutputFiles().then(files => {
            expectedOutputFiles = files;

            server = Prerender();
            server.start().then(() => {
                testInstance = new TestInstance();
                testInstance.start().then(done);
            });
        });
    });

    afterEach(function(done) {
        testInstance.stop().then(() => {
            server.stop().then(done);
        });
    });

    /**
     * Tests that the server properly responds to a simple file that has no embedded JS.
     */
    it('should respond properly to a simple non-js file', function(done) {
        const path = 'basic-1.html';

        new PrerenderServerInvoker(server.address, testInstance.address).renderTestURLAndVerifyMatch(path, expectedOutputFiles.get(path)).then(match => {
            assert.equal(match, true);
            done();
        }, done).catch(done);
    });

    /**
     * Sends multiple requests to the server at the same time and expects all responses to return
     * properly and with the expected content.
     */
    it('should be able to handle multiple requests with the same instance', function(done) {
        const requests = [];
        const path = 'multiple.html';

        for (let i = 0; i < 50; i++) {
            requests.push(
                new PrerenderServerInvoker(server.address, testInstance.address).renderTestURLAndVerifyMatch(path, expectedOutputFiles.get(path)).then(match => {
                    assert.equal(match, true);
                }, done)
            );
        }

        Promise.all(requests).then(() => {
            done();
        }, done);
    });
});