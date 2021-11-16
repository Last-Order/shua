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
                resolve(response.data);
            } catch (e) {
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
