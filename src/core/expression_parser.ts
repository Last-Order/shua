class ExpressionParser {
    expression: string;
    urls: string[] = [];
    constructor(expression) {
        this.expression = expression;
        this.parse();
    }
    private parse() {
        // Integer expression
        const integerExpressionMatchResults = [...this.expression.matchAll(/({{%d.+?}})/)]
        if (integerExpressionMatchResults.length > 0) {
            const firstIntegerExpressionMatchResult = integerExpressionMatchResults.shift();
            const integerExpressionArgumentMatchResult = firstIntegerExpressionMatchResult[1].match(/{{%d\((.+?)\)}}/);
            if (!integerExpressionArgumentMatchResult) {
                throw new Error('Invalid integer expression');
            }
            const integerExpressionArguments = firstIntegerExpressionMatchResult[1].match(/{{%d\((.+?)\)}}/)[1].split(',').map(a => parseInt(a));
            if (integerExpressionArguments.length < 2 || integerExpressionArguments.length > 3 || integerExpressionArguments.some(a => isNaN(a))) {
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
            const [start, end, step = 1] = integerExpressionArguments;
            for (let i = start; (step > 0 ? (i <= end) : (i >= end)); i += step) {
                this.urls.push(
                    this.expression.slice(0, firstIntegerExpressionMatchResult.index) + i.toString() + this.expression.slice(firstIntegerExpressionMatchResult.index + firstIntegerExpressionMatchResult[1].length)
                );
            }
        }
    }
    getUrls() {
        return this.urls;
    }
}

export default ExpressionParser;