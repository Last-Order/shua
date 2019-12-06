#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
import Erii from 'erii';
import Downloader from './core/downloader';

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
}, (ctx, options) => {
    const path = ctx.getArgument().toString();
    const downloader = new Downloader(options);
    downloader.loadUrlsFromFile(path);
    downloader.start();
});

Erii.addOption({
    name: 'headers',
    description: 'Custom HTTP Headers',
});

Erii.addOption({
    name: 'output',
    description: 'Set output direcotry'
});

Erii.default(() => {
    Erii.showHelp();
});

Erii.okite()