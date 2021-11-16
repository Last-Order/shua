#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
import Erii from 'erii';
import Downloader from './core/downloader';
import { deleteDirectory } from './utils/system';

Erii.setMetaInfo({
    version: JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json')).toString())['version'],
    name: 'Shua / A lovely downloader'
});

Erii.bind({
    name: ['help', 'h'],
    description: 'Show help documentation',
    argument: {
        name: 'command',
        description: 'Show help',
    }
}, (ctx) => {
    ctx.showHelp();
});

Erii.bind({
    name: ['file', 'f'],
    description: 'Download urls in a file',
    argument: {
        name: 'input_path',
        description: 'file path',
    }
}, async (ctx, options) => {
    const path = ctx.getArgument().toString();
    const downloader = new Downloader(options);
    await downloader.loadUrlsFromFile(path);
    downloader.start();
    downloader.once('finish', () => {
        process.exit();
    });
});

Erii.bind({
    name: ['json', 'j'],
    description: 'Import tasks from a JSON file',
    argument: {
        name: 'input_path',
        description: 'file path',
    }
}, (ctx, options) => {
    const path = ctx.getArgument().toString();
    const downloader = new Downloader(options);
    downloader.loadUrlsFromJSON(path);
    downloader.start();
    downloader.once('finish', () => {
        process.exit();
    });
});

Erii.bind({
    name: ['expression', 'e'],
    description: 'Download urls from a expression',
    argument: {
        name: 'expression',
        description: 'Url expression'
    }
}, (ctx, options) => {
    const expression = ctx.getArgument().toString();
    const downloader = new Downloader(options);
    downloader.loadUrlsFromExpression(expression);
    downloader.start();
    downloader.once('finish', () => {
        process.exit();
    });
});

Erii.bind({
    name: ['clean'],
    description: '[DEBUG ONLY DO NOT USE]',
}, () => {
    for (const file of fs.readdirSync(path.resolve(__dirname, '../'))) {
        if (file.startsWith('shua_download_')) {
            deleteDirectory(path.resolve(__dirname, `../${file}`));
        }
    }
    fs.writeFileSync(path.resolve(__dirname, '../tasks.json'), '[]');
});

Erii.addOption({
    name: 'headers',
    description: 'Custom HTTP headers',
    argument: {
        name: 'headers',
        description: '(Optional) Custom HTTP headers. Multi headers should be splitted with "\\n\"',
    }
});

Erii.addOption({
    name: 'threads',
    description: 'Threads limit',
    argument: {
        name: 'limit',
        description: '(Optional) Limit of threads, defaults to 8'
    }
});

Erii.addOption({
    name: 'timeout',
    description: 'Timeout threshold for each segment.',
    argument: {
        name: 'limit',
        description: '(Optional) Timeout threshold in ms, defaults to 30000'
    }
});

Erii.addOption({
    name: ['output', 'o'],
    description: 'Set output direcotry',
    argument: {
        name: 'path',
        description: '(Optional) Output files path',
        validate: (outputPath: string, logger) => {
            if (path.basename(outputPath).match(/[\*\:|\?<>]/)) {
                logger('Filename should\'t contain :, |, <, >.');
                return false;
            }
            return true;
        }
    }
});

Erii.addOption({
    name: ['verbose', 'debug'],
    description: 'Debug output'
});

Erii.addOption({
    name: ['ascending'],
    description: 'Rename output files numerical ascendingly'
});

Erii.default(() => {
    Erii.showHelp();
});

Erii.okite()