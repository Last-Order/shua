class ExpressionParser {
    expression: string;
    urls: string[] = [];
    constructor(expression) {
        this.expression = expression;
        this.parse();
    }
    private parse() {
        // Integer expression
        const integerExpressionMatchResults = [...this.expression.matchAll(/({{%d.+?}})/ig)];
        if (integerExpressionMatchResults.length > 0) {
            const firstIntegerExpressionMatchResult = integerExpressionMatchResults.shift();
            const integerExpressionArgumentMatchResult = firstIntegerExpressionMatchResult[1].match(/{{%d\((.+?)\)}}/);
            if (!integerExpressionArgumentMatchResult) {
                throw new Error('Invalid integer expression');
            }
            const integerExpressionArguments = firstIntegerExpressionMatchResult[1].match(/{{%d\((.+?)\)}}/)[1].split(',').map(a => parseInt(a));
            if (integerExpressionArguments.length < 2 || integerExpressionArguments.length > 4 || integerExpressionArguments.some(a => isNaN(a))) {
                console.error(`ERROR: Wrong arguments for integer expression`);
                console.error(`${this.expression}`);
                console.error(`${new Array(firstIntegerExpressionMatchResult.index).fill(' ').join('')}${new Array(firstIntegerExpressionMatchResult[1].length).fill('^').join('')}`)
                throw new Error('Invalid integer expression: wrong arguments');
            }
            if (integerExpressionArguments[1] >= integerExpressionArguments[0]) {
                if (integerExpressionArguments[2] !== undefined && integerExpressionArguments[2] <= 0) {
                    throw new Error('Invalid integer expression: infinite list');
                }
            }
            if (integerExpressionArguments[0] >= integerExpressionArguments[1]) {
                if (integerExpressionArguments[2] !== undefined && integerExpressionArguments[2] >= 0) {
                    throw new Error('Invalid integer expression: infinite list');
                }
            }
            const [start, end, step = 1, leftPad = 0] = integerExpressionArguments;
            for (let i = start; (step > 0 ? (i <= end) : (i >= end)); i += step) {
                this.urls.push(
                    this.expression.slice(0, firstIntegerExpressionMatchResult.index) + i.toString().padStart(leftPad, '0') + this.expression.slice(firstIntegerExpressionMatchResult.index + firstIntegerExpressionMatchResult[1].length)
                );
            }
        }
        if (integerExpressionMatchResults.length > 0) {
            const result = [];
            for (const url of this.urls) {
                result.push(...new ExpressionParser(url).getUrls());
            }
            this.urls = result;
        }
    }
    getUrls() {
        return this.urls;
    }
}

export default ExpressionParser;