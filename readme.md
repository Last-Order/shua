# Shua

Shua is a common file downloader implemented by Node.js. Inspired by Minyami download core.

The target of Shua is to provide a way to download thousands of small files in a short time.

## Installation

```
npm install -g shua
```

Note: Shua needs Node.js 12.0.0+.

## Usage

```
Shua / A lovely downloader / 1.0.7

Help:
     Commands                      Description                   Alias

     --help <command>              Show help documentation       --h
         <command>                 Show help
     --file <input_path>           Download urls in a file       --f
         <input_path>              file path
     --expression <expression>     Download urls from a expressio--e
         <expression>              Url expression
     --clean                       [DEBUG ONLY DO NOT USE]

Options:

     Options                       Description
     --headers <headers>           Custom HTTP headers
         <headers>                 (Optional) Custom HTTP headers.
     --threads <limit>             Threads limit
         <limit>                   (Optional) Limit of threads, defaults to 8
     --timeout <limit>             Timeout threshold for each segment.
         <limit>                   (Optional) Timeout threshold in ms, defaults to 30000
     --output, o <path>            Set output direcotry
         <path>                    (Optional) Output files path
     --ascending                   Rename output files numerical ascendingly
```

## Expressions

Shua supports generating urls from a url expression.

### Integer Expressions

Syntax: `{{%d(start: integer, end: integer, step?: integer, leftPad?: integer)}}`

For example, to download

```
https://example.com/segment1.ts
https://example.com/segment2.ts
https://example.com/segment3.ts
...
https://example.com/segment100.ts
```

Just use the following command

`shua -e "https://example.com/segment{{%d(1, 100)}}.ts"`

Multi expressions is also supported.

To download

```
https://example.com/segment1_1.ts
https://example.com/segment1_2.ts
...
https://example.com/segment1_10.ts
https://example.com/segment2_1.ts
https://example.com/segment2_2.ts
...
https://example.com/segment2_10.ts
...
https://example.com/segment5_10.ts
```

Use the following expression

`shua -e "https://example.com/segment{{%d(1, 5)}}_{{%d(1, 10)}}.ts"`

To download

```
https://example.com/segment001.ts
https://example.com/segment002.ts
https://example.com/segment003.ts
...
https://example.com/segment100.ts
```

Use

`shua -e "https://example.com/segment{{%d(1, 100, 1, 3)}}.ts"`

## Example

### Download all urls from a.txt with 16 threads

```
shua -f a.txt --threads 16
```

## Use as a library

### Getting Started

```JavaScript
import { Downloader } from 'shua';
const downloader = new Downloader();
downloader.addUrlsFromFile('urls.txt');
downloader.on('finish', () => {
   console.log('All files downloaded!');
});
downloader.start();

```

### Events

| Event Name    | Parameters                                  |
| ------------- | ------------------------------------------- |
| `progress`    | `finishedCount: number, totalCOunt: number` |
| `task-finish` | `task: Task`                                |
| `task-error`  | `err: Error, task: Task`                    |
| `finish`      |                                             |
