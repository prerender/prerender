import assert from 'assert';

// Since that part is not typed, we ts-ignore these for now, until further refactor of the server.
// @ts-ignore
import Prerender from '../../lib';

import TestInstance from '../utils/TestInstance';
import OutputLoader from '../utils/OutputLoader';
import PrerenderServerInvoker from '../utils/PrerenderServerInvoker';

describe('Server - removeScriptTags plugin', function() {
    let server: Prerender;
    let expectedOutputFiles: Map<string, string>;
    let testInstance: TestInstance;

    beforeEach(function(done) {
        OutputLoader.loadOutputFiles().then(files => {
            expectedOutputFiles = files;

            server = Prerender();
            server.use(Prerender.removeScriptTags());
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
     * Tests that the removeScriptTags plugin successfully removes the script tag(s) from a simple file.
     */
    it('should remove the scripts tag from the output', function(done) {
        const path = 'remove-scripts-1.html';

        new PrerenderServerInvoker(server.address, testInstance.address).renderTestURLAndVerifyMatch(path, expectedOutputFiles.get(path)).then(match => {
            assert.equal(match, true);
            done();
        }, done).catch(done);
    });
});