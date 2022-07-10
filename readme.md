# Shua

Shua is a common file downloader implemented by Node.js. Inspired by Minyami download core.

The target of Shua is to provide a way to download thousands of small files in a short time.

## Installation

```
npm install -g shua
```

Note: Shua needs Node.js 12.0.0+.

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

## Options

### `--file, -f <path>`

Download all URLs containing in a file. Both local path and remote URLs are supported as import. Lines couldn't be parsed as an valid URL will be ignored by default.

#### Examples

```bash
shua -f "files.txt"
shua -f "https://example.com/file_list.txt"
```

### `--expression, -e <expression>`

Download all URLs generated from a expression. See `Expressions` section above.

### `--json, -j <path>`

Download tasks defined in a json file. JSON files should contain a `DownloadTask` array.

```TypeScript
interface DownloadTask {
    /** URL */
    url: string;
    /** retry count */
    retryCount: number;
    /** output filename */
    filename?: string;
    /** custom HTTP headers */
    headers?: Record<string, string>;
}
type Tasks = DownloadTask[];
```

### `--threads <limit>`

Threads limit.

### `--retries, -r <limit>`

Max attempts for download tasks.

### `--timeout <threshold>`

Timeout threshold for download tasks in milliseconds.

### `--concat, -c` (3.0.0+)

Concatenate all downloaded files into a single output file.

### `--output, -o <name>`

Output folder name.

Nested paths are not supported now.

if `--concat` is provided, `--output` will be used for concentration.

### `--ascending, -a`

Rename output files in numerical ascending order.

### `--debug, --verbose`

Enable debug log output.

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
| `progress`    | `finishedCount: number, totalCount: number` |
| `task-finish` | `task: Task`                                |
| `task-error`  | `err: Error, task: Task`                    |
| `finish`      |                                             |
