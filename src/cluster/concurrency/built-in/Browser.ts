
import * as puppeteer from 'puppeteer';
import { launch } from 'chrome-launcher'
const request = require('request');
const { promisify } = require('util');

import { debugGenerator, timeoutExecute } from '../../util';
import ConcurrencyImplementation, { WorkerInstance } from '../ConcurrencyImplementation';
const debug = debugGenerator('BrowserConcurrency');

const BROWSER_TIMEOUT = 5000;

export default class Browser extends ConcurrencyImplementation {
    public async init() {}
    public async close() {}

    public async workerInstance(perBrowserOptions: puppeteer.LaunchOptions | undefined):
        Promise<WorkerInstance> {
        
        let chrome: any;
        const options = perBrowserOptions || this.options;
        const chromeFlags = this.options.args

        if (this.chromeLauncher) {
          const chromeLib = await launch({
            chromeFlags,
            logLevel: 'silent',
          });
            
          const resp = await promisify(request)(`http://localhost:${chromeLib.port}/json/version`);
          const { webSocketDebuggerUrl } = JSON.parse(resp.body);

          chrome = await this.puppeteer.connect({ browserWSEndpoint: webSocketDebuggerUrl }) as puppeteer.Browser;  
        } else {
          chrome = await this.puppeteer.launch(options) as puppeteer.Browser;
        }
        
        let page: puppeteer.Page;
        let context: any; // puppeteer typings are old...

        return {
            jobInstance: async () => {
                await timeoutExecute(BROWSER_TIMEOUT, (async () => {
                    context = await chrome.createIncognitoBrowserContext();
                    page = await context.newPage();
                })());

                return {
                    resources: {
                        page,
                    },

                    close: async () => {
                        await timeoutExecute(BROWSER_TIMEOUT, context.close());
                    },
                };
            },

            close: async () => {
                if (this.chromeLauncher){
                  await chrome.kill()
                } else {
                  await chrome.close();
                }                
            },

            repair: async () => {
                debug('Starting repair');
                try {
                    // will probably fail, but just in case the repair was not necessary
                    if (this.chromeLauncher){
                      await chrome.kill()
                    } else {
                      await chrome.close();
                    }  
                } catch (e) {}

                // just relaunch as there is only one page per browser
                if (this.chromeLauncher) {
                    const chromeLib = await launch({
                      chromeFlags,
                      logLevel: 'silent'
                    });
                      
                    const resp = await promisify(request)(`http://localhost:${chromeLib.port}/json/version`);
                    const { webSocketDebuggerUrl } = JSON.parse(resp.body);
          
                    chrome = await this.puppeteer.connect({ browserWSEndpoint: webSocketDebuggerUrl }) as puppeteer.Browser;  
                  } else {
                    chrome = await this.puppeteer.launch(options) as puppeteer.Browser;
                  }
            },
        };
    }

}
