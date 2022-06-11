import * as fs from "fs";
import { URL } from "url";
import axios from "axios";
import logger from "./logger";
const http = require("http");
const https = require("https");

const axiosInstance = axios.create({
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true }),
});
export interface DownloadOptions {
    /** 超时 单位毫秒  */
    timeout?: number;
    /** Custom HTTP Headers */
    headers?: object;
}
/**
 * 下载文件
 * @param url URL
 * @param path 保存路径
 * @param options 设置
 * @return {Promise<void>}
 */
export function downloadFile(url, path, { timeout = 60000, headers }: DownloadOptions = {}): Promise<void> {
    const CancelToken = axios.CancelToken;
    let source = CancelToken.source();
    const promise: Promise<void> = new Promise(async (resolve, reject) => {
        try {
            setTimeout(() => {
                source && source.cancel();
                source = null;
            }, timeout);
            let response = await axiosInstance({
                url,
                method: "GET",
                responseType: "arraybuffer",
                headers: {
                    Host: new URL(url).host,
                    ...headers,
                },
                cancelToken: source.token,
            });
            if (
                response.headers["content-length"] &&
                parseInt(response.headers["content-length"]) !== response.data.length
            ) {
                reject("Bad response");
            }
            fs.writeFileSync(path, response.data);
            response = null;
            resolve();
        } catch (e) {
            reject(e);
        } finally {
            source = null;
        }
    });
    return promise;
}

export function loadRemoteFile(url: string, { timeout = 3000, headers }: DownloadOptions = {}) {
    return new Promise(async (resolve, reject) => {
        let retries = 5;
        while (retries > 0) {
            const CancelToken = axios.CancelToken;
            let source = CancelToken.source();
            try {
                setTimeout(() => {
                    source && source.cancel();
                    source = null;
                }, timeout);
                const response = await axios({
                    url,
                    method: "GET",
                    responseType: "text",
                    headers: {
                        Host: new URL(url).host,
                        ...headers,
                    },
                    cancelToken: source.token,
                });
                retries = 0;
                resolve(response.data);
            } catch (e) {
                console.log(url)
                logger.warning(
                    `Load remote file error, retry. [${
                        e.code ||
                        (e.response ? `${e.response.status} ${e.response.statusText}` : undefined) ||
                        e.message ||
                        e.constructor.name ||
                        "UNKNOWN"
                    }]`
                );
                logger.debug(e);
                retries--;
                if (retries <= 0) {
                    reject(e);
                }
            }
        }
    });
}

/**
 * 二进制连接文件
 * @param fileList
 * @param output
 * @returns
 */
export function concat(fileList = [], output = "./output") {
    const cliProgress = require("cli-progress");
    return new Promise<string>(async (resolve) => {
        if (fileList.length === 0) {
            resolve(output);
        }

        const writeStream = fs.createWriteStream(output);
        const lastIndex = fileList.length - 1;
        const bar = new cliProgress.SingleBar(
            {
                format: "[MERGING] [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}",
            },
            cliProgress.Presets.shades_classic
        );
        bar.start(fileList.length, 0);
        let i = 0;
        let writable = true;
        write();
        function write() {
            writable = true;
            while (i <= lastIndex && writable) {
                writable = writeStream.write(fs.readFileSync(fileList[i]), () => {
                    if (i > lastIndex) {
                        bar.update(i);
                        bar.stop();
                        writeStream.end();
                        resolve(output);
                    }
                });
                bar.update(i);
                i++;
            }
            if (i <= lastIndex) {
                writeStream.once("drain", () => {
                    write();
                });
            }
        }
    });
}

/** 获得文件后缀名 */
export function getFileExt(filePath: string): string {
    let ext = "";
    if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
        const urlPath = new URL(filePath).pathname.slice(1).split("/");
        if (urlPath[urlPath.length - 1].includes(".")) {
            ext = urlPath[urlPath.length - 1].split(".").slice(-1)[0];
        }
    } else {
        const filePathArr = filePath.split("/");
        const filename = filePathArr[filePathArr.length - 1];
        ext = filename.includes(".") ? filename.split(".").slice(-1)[0] : "";
    }
    return ext;
}
