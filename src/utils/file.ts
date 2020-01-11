const SocksProxyAgent = require('socks-proxy-agent');
import * as fs from 'fs';
import { URL } from 'url';
import axios, { AxiosProxyConfig, AxiosResponse } from 'axios';

const DEFAULT_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.80 Safari/537.36`;

export interface DownloadOptions {
    /** 代理设置 */
    proxy?: AxiosProxyConfig;
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
export function downloadFile(url, path, { proxy, timeout = 60000, headers }: DownloadOptions = {}): Promise<void> {
    const CancelToken = axios.CancelToken;
    let source = CancelToken.source();
    const promise: Promise<void> = new Promise(async (resolve, reject) => {
        try {
            setTimeout(() => {
                source && source.cancel();
                source = null;
            }, timeout);
            const response = await axios({
                url,
                method: 'GET',
                responseType: 'arraybuffer',
                httpsAgent: proxy ? new SocksProxyAgent(`socks5h://${proxy.host}:${proxy.port}`) : undefined,
                headers: {
                    'User-Agent': DEFAULT_USER_AGENT,
                    'Host': new URL(url).host,
                    ...headers
                },
                cancelToken: source.token,
            });
            if (response.headers['content-length'] && parseInt(response.headers['content-length']) !== response.data.length) {
                reject('Bad response');
            }
            fs.writeFileSync(path, response.data);
            resolve();
        } catch (e) {
            reject(e);
        } finally {
            source = null;
        }
    });
    return promise;
}