
import * as puppeteer from 'puppeteer';
import ConcurrencyImplementation, { ResourceData } from './ConcurrencyImplementation';
import { launch, LaunchedChrome } from 'chrome-launcher'
const request = require('request');
const { promisify } = require('util');
import { debugGenerator, timeoutExecute } from '../util';
const debug = debugGenerator('SingleBrowserImpl');

const BROWSER_TIMEOUT = 5000;

export default abstract class SingleBrowserImplementation extends ConcurrencyImplementation {

    protected browser: puppeteer.Browser | LaunchedChrome | null = null;

    private repairing: boolean = false;
    private repairRequested: boolean = false;
    private openInstances: number = 0;
    private waitingForRepairResolvers: (() => void)[] = [];

    public constructor(options: puppeteer.LaunchOptions, puppeteer: any, chromeLauncher: boolean) {
        super(options, puppeteer, chromeLauncher);
    }

    private async repair() {
        if (this.openInstances !== 0 || this.repairing) {
            // already repairing or there are still pages open? wait for start/finish
            await new Promise((resolve) => this.waitingForRepairResolvers.push(resolve))
            return;
        }

        this.repairing = true;
        debug('Starting repair');

        try {
            // will probably fail, but just in case the repair was not necessary
          if(this.chromeLauncher) await (this.browser as LaunchedChrome).kill()
          else await (this.browser as puppeteer.Browser).close();
        } catch (e) {
            debug('Unable to close browser.');
        }

        try {
            if (this.chromeLauncher) {
                const chromeLib = await launch({
                  chromeFlags: this.options.args,
                  logLevel: 'silent',
                });
                  
                const resp = await promisify(request)(`http://localhost:${chromeLib.port}/json/version`);
                const { webSocketDebuggerUrl } = JSON.parse(resp.body);
      
                this.browser = await this.puppeteer.connect({ browserWSEndpoint: webSocketDebuggerUrl }) as puppeteer.Browser;  
              } else {
                this.browser = await this.puppeteer.launch(this.options) as puppeteer.Browser;
              }
        } catch (err) {
            throw new Error('Unable to restart chrome.');
        }
        this.repairRequested = false;
        this.repairing = false;
        this.waitingForRepairResolvers.forEach(resolve => resolve());
        this.waitingForRepairResolvers = [];
    }

    public async init() {
        if (this.chromeLauncher) {
            const chromeLib = await launch({
              chromeFlags: this.options.args,
              logLevel: 'silent',
            });
              
            const resp = await promisify(request)(`http://localhost:${chromeLib.port}/json/version`);
            const { webSocketDebuggerUrl } = JSON.parse(resp.body);
  
            this.browser = await this.puppeteer.connect({ browserWSEndpoint: webSocketDebuggerUrl }) as puppeteer.Browser;  
          } else {
            this.browser = await this.puppeteer.launch(this.options) as puppeteer.Browser;
          }
    }

    public async close() {
        if(this.chromeLauncher) await (this.browser as LaunchedChrome).kill()
        else await (this.browser as puppeteer.Browser).close();
    }

    protected abstract async createResources(): Promise<ResourceData>;

    protected abstract async freeResources(resources: ResourceData): Promise<void>;

    public async workerInstance() {
        let resources: ResourceData;

        return {
            jobInstance: async () => {
                if (this.repairRequested) {
                    await this.repair();
                }

                await timeoutExecute(BROWSER_TIMEOUT, (async () => {
                    resources = await this.createResources();
                })());
                this.openInstances += 1;

                return {
                    resources,

                    close: async () => {
                        this.openInstances -= 1; // decrement first in case of error
                        await timeoutExecute(BROWSER_TIMEOUT, this.freeResources(resources));

                        if (this.repairRequested) {
                            await this.repair();
                        }
                    },
                };
            },

            close: async () => {},

            repair: async () => {
                debug('Repair requested');
                this.repairRequested = true;
                await this.repair();
            },
        };
    }
}
