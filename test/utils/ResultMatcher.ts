import prettier, { Options } from 'prettier';

// Since that part is not typed, we ts-ignore these for now, until further refactor of the server.
// @ts-ignore
import prerenderUtils from '../../lib/util';

/**
 * Options for the html normalizer (prettify atm.).
 */
const OPTIONS: Options = {
    parser: 'html'
};

/**
 * A lenient matcher that matches HTML files based on content and not actual char-by-char matching.
 */
export default class ResultMatcher {
    input: string;

    constructor(inputString: string) {
        this.input = this.getNormalizedContent(inputString);
    }

    /**
     * Matches the input string to the provided string.
     *
     * @param expectedString The expected string to match the input to.
     */
    public match(expectedString: string): boolean {
        const expected = this.getNormalizedContent(expectedString);
        const match = this.input === expected;

        if (!match) {
            prerenderUtils.log('File contents do not match', this.input, expected);
        }

        return match;
    }

    /**
     * Normalizes an input string to be used for matching.
     *
     * @param input - The input string.
     */
    private getNormalizedContent(input: string): string {
        return prettier.format(input, OPTIONS);
    }
}