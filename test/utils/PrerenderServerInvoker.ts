import request from 'request';
import util from 'util';

import ResultMatcher from './ResultMatcher';

const get = util.promisify(request.get);

/**
 * Logic encapsulating class to invoke prerender server calls and return promises
 * that are easy to be used in tests.
 */
export default class PrerenderServerInvoker {
    prerenderServerAddress: string;
    testServerAddress: string;

    constructor(prerenderServerAddress: string, testServerAddress: string) {
        this.prerenderServerAddress = prerenderServerAddress;
        this.testServerAddress = testServerAddress;
    }

    /**
     * Renders a file through the prerender server and returns its content.
     *
     * @param url - The URL to be rendered by prerender.
     */
    public async renderURL(url: string): Promise<string> {
        const response = await get({
            url: `${this.prerenderServerAddress}/${url}`
        });

        return response.body;
    }

    /**
     * Gets a file from the test server through prerender and matches it to an expected content
     * using ResultMatcher.
     *
     * @param remoteFilePath - The path of the test file on the remote server.
     * @param expectedContent - The expected content to be rendered by the prerender server.
     */
    public async renderTestURLAndVerifyMatch(remoteFilePath: string, expectedContent: string | undefined): Promise<boolean> {
        if (typeof expectedContent === 'undefined') {
            return false;
        }

        const fileContent = await this.renderURL(`${this.testServerAddress}/${remoteFilePath}`);

        return new ResultMatcher(fileContent).match(expectedContent);
    }
}